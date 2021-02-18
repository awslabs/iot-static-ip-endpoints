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
import logging as log
from awsutil import get_client

ec2 = get_client("ec2")


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
    allocationId = props["AllocationId"]
    log.info(
        f"Releasing EIP allocation id {allocationId}. 'Access Denied' errors may be logged while the process waits for the resource to be available for release."
    )

    while True:
        try:
            ec2.release_address(AllocationId=allocationId)
            print(
                f"The EIP AllocationId {allocationId} has been successfully released. Ignore any (AuthFailure) messages above."
            )
            return {"PhysicalResourceId": f"{allocationId}-reaper"}
        except Exception as e:
            log.error(e)
            time.sleep(5)


def on_update(event):
    props = event["ResourceProperties"]
    allocationId = props["AllocationId"]
    return {"PhysicalResourceId": f"{allocationId}-reaper"}


def on_create(event):
    props = event["ResourceProperties"]
    allocationId = props["AllocationId"]
    return {"PhysicalResourceId": f"{allocationId}-reaper"}
