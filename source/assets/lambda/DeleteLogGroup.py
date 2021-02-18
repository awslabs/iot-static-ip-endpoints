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

logs = get_client("logs")


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
    logGroupName = props["LogGroupName"]
    try:
        logs.delete_log_group(logGroupName=logGroupName)
    except logs.exceptions.ResourceNotFoundException:
        # don't blow up if the log group has not yet been created
        pass
    return {"PhysicalResourceId": f"{logGroupName}-delete"}


def on_update(event):
    props = event["ResourceProperties"]
    logGroupName = props["LogGroupName"]
    return {"PhysicalResourceId": f"{logGroupName}-delete"}


def on_create(event):
    props = event["ResourceProperties"]
    logGroupName = props["LogGroupName"]
    return {"PhysicalResourceId": f"{logGroupName}-delete"}
