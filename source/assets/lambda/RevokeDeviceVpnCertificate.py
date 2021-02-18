#
# Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License"). You may not use
# this file except in compliance with the License. A copy of the License is located at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# or in the "license" file accompanying this file. This file is distributed on an "AS IS"
# BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations under the License.
#

import boto3
import os
import time
import json
import re
import logging as log
from awsutil import get_client

REGION = os.environ["REGION"]
AUTO_SCALING_GROUP_NAME = os.environ["AUTO_SCALING_GROUP_NAME"]
ec2as = get_client("autoscaling")
ssm = get_client("ssm")


def get_instance_id():
    asg = ec2as.describe_auto_scaling_groups(
        AutoScalingGroupNames=[AUTO_SCALING_GROUP_NAME]
    )
    healthy = [
        i
        for i in asg["AutoScalingGroups"][0]["Instances"]
        if i["HealthStatus"] == "Healthy"
    ]
    if len(healthy) == 0:
        raise Exception("No healthy instances.")
    return healthy[0]["InstanceId"]


def get_command_result(command_id, instance_id, thing_name):
    retries = 0
    while retries < 300:
        retries += 1
        try:
            output = ssm.get_command_invocation(
                CommandId=command_id, InstanceId=instance_id
            )
            status = output["Status"]
            if status == "InProgress":
                retries = 0
                log.info(
                    f"Waiting for command {command_id} to finish execution [{retries} / 300]"
                )
                time.sleep(1.0)
                continue
            elif status == "Failed":
                log.error("Command execution failed")
                raise Exception(
                    "Command execution failed, review RevokeDeviceVpnCertificate log file for more details"
                )
            elif status == "Success":
                log.info("Command execution success")
                stdout = output["StandardOutputContent"]
                stdout = stdout.replace("\r", "")
                log.info(f"Output of command execution: {stdout}")
                return f"Successfully revoked device configuration for {thing_name}, and updated certificate revocation list"
        except ssm.exceptions.InvocationDoesNotExist as e:
            if retries == 300:
                log.error(f"SSM command execution failed after 5 minutes")
                log.error(e)
                raise e
            else:
                log.info(
                    f"Waiting for command {command_id} to finish execution [{retries} / 300]"
                )
                time.sleep(1.0)


def exec_revokecert_cmd(instance_id, thing_name):
    res = ssm.send_command(
        InstanceIds=[instance_id],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": [f"sudo /usr/share/revoke-device-cert '{thing_name}'"]},
    )
    command_id = res["Command"]["CommandId"]
    log.info(f"SSM Command ID: {command_id}")
    return get_command_result(command_id, instance_id, thing_name)


def handler(event, context):
    log.info(f"Event: {event}")

    if not "ClientName" in event:
        # don't disclose much information here in case this Lambda
        # gets hooked up to an API in some manner.
        log.error("No ClientName was passed in the event payload")
        raise Exception("InvalidRequest")

    # get the thing name event attribute
    # this gets sent off to an instance as the argument for a command
    # sanitize for safety to prevent RCE's!
    thing_name = event["ClientName"]
    thing_name = re.sub("[^a-zA-Z0-9:_-]", "", thing_name)
    assert len(thing_name) >= 1 and len(thing_name) <= 128

    # find an instance
    instance_id = get_instance_id()
    log.info(f"Executing certificate revocation command on instance {instance_id}")

    # and execute the command to revoke a device cert and configuration
    return exec_revokecert_cmd(instance_id, thing_name)
