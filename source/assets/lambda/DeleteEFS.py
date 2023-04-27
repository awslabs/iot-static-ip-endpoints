#
# Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

efs = get_client("efs")


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
    fileSystemId = props["FileSystemId"]
    log.info(
        f"Deleting EFS filesystem id {fileSystemId}. Errors may be logged while the process waits for the resource to be released."
    )
    while True:
        try:
            efs.delete_file_system(FileSystemId=fileSystemId)
            return {"PhysicalResourceId": f"{fileSystemId}-delete"}
        except Exception as e:
            log.error(e)
            time.sleep(5)


def on_update(event):
    props = event["ResourceProperties"]
    fileSystemId = props["FileSystemId"]
    return {"PhysicalResourceId": f"{fileSystemId}-delete"}


def on_create(event):
    props = event["ResourceProperties"]
    fileSystemId = props["FileSystemId"]
    return {"PhysicalResourceId": f"{fileSystemId}-delete"}
