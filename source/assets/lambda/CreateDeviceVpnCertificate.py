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
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
import logging as log
from awsutil import get_client

REGION = os.environ["REGION"]
AUTO_SCALING_GROUP_NAME = os.environ["AUTO_SCALING_GROUP_NAME"]
ec2as = get_client("autoscaling")
ssm = get_client("ssm")


def generate_key_and_csr(thing_name):
    key = rsa.generate_private_key(
        public_exponent=65537, key_size=4096, backend=default_backend()
    )
    log.info("Generated private key.")

    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(
            x509.Name(
                [
                    # Provide various details about who we are.
                    x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
                    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "WA"),
                    x509.NameAttribute(NameOID.LOCALITY_NAME, "Seattle"),
                    x509.NameAttribute(
                        NameOID.ORGANIZATION_NAME, "IoT Static IP Endpoints"
                    ),
                    x509.NameAttribute(NameOID.COMMON_NAME, thing_name),
                ]
            )
        )
        .sign(key, hashes.SHA256(), default_backend())
    )
    log.info("Generated CSR")

    key_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    log.info("Encoded key in pem format")

    csr_pem = str(csr.public_bytes(serialization.Encoding.PEM), "utf-8")
    log.info("Encoded CSR in pem format")

    return (key_pem, csr_pem)


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


def get_command_result(command_id, instance_id):
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
                raise Exception("Command execution failed")
            elif status == "Success":
                log.info("Command execution success")
                stdout = output["StandardOutputContent"]
                stdout = stdout.replace("\r", "")
                return stdout
        except ssm.exceptions.InvocationDoesNotExist as e:
            if retries == 300:
                log.error(f"SSM command execution failed after 5 minutes")
                raise e
            else:
                log.info(
                    f"Waiting for command {command_id} to finish execution [{retries} / 300]"
                )
                time.sleep(1.0)


def exec_gencert_cmd(instance_id, thing_name, csr_pem):
    res = ssm.send_command(
        InstanceIds=[instance_id],
        DocumentName="AWS-RunShellScript",
        Parameters={
            "commands": [f"sudo /usr/share/gen-device-cert '{thing_name}' '{csr_pem}'"]
        },
    )
    command_id = res["Command"]["CommandId"]
    return get_command_result(command_id, instance_id)


def handler(event, context):
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
    log.info(f"Executing certificate creation command on instance {instance_id}")

    # Use the passed in CSR, or generate new key/CSR
    if "CSR" in event:
        log.info(
            "User specified CSR was passed, end-user must insert their own private key into the result."
        )
        key_pem = "REPLACE_WITH_PRIVATE_KEY_PEM"
        csr_pem = event["CSR"]
    else:
        log.info("No user specified CSR was found, generating new private key and CSR")
        # of note.. the lifespan of this private key is until this function completes executing
        # after which the private key will no longer be known except to the caller of the function
        # DO NOT print the key to any logging mechanism
        key_pem, csr_pem = generate_key_and_csr(thing_name)

    # and execute the command to create a device cert and configuration
    cfg = exec_gencert_cmd(instance_id, thing_name, csr_pem)
    cfg = cfg.replace("REPLACE_WITH_PRIVATE_KEY_PEM", key_pem)

    return cfg
