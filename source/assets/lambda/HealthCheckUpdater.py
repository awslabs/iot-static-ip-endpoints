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
import time
from awsutil import get_client

ec2as = get_client("autoscaling")


def assertHealthCheckGracePeriodIs2Mins(asgName):
    ec2as.update_auto_scaling_group(
        AutoScalingGroupName=asgName, HealthCheckGracePeriod=90
    )


def handler(event, context):
    request_type = event["RequestType"]
    if request_type == "Create":
        return on_create(event)
    if request_type == "Update":
        return on_update(event)
    if request_type == "Delete":
        return on_delete(event)
    raise Exception("Invalid request type: %s" % request_type)


def on_delete(event):
    props = event["ResourceProperties"]
    asgName = props["AutoScalingGroupName"]
    return {"PhysicalResourceId": f"{asgName}-healthcheck"}


def on_update(event):
    props = event["ResourceProperties"]
    asgName = props["AutoScalingGroupName"]
    assertHealthCheckGracePeriodIs2Mins(asgName)
    return {"PhysicalResourceId": f"{asgName}-healthcheck"}


def on_create(event):
    props = event["ResourceProperties"]
    asgName = props["AutoScalingGroupName"]
    assertHealthCheckGracePeriodIs2Mins(asgName)
    return {"PhysicalResourceId": f"{asgName}-healthcheck"}
