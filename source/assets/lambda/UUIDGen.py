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
from uuid import uuid4
from AnonymousDataUtils import send_launch_metrics


def handler(event, context):
    request_type = event["RequestType"]
    if request_type == "Create":
        uid = str(uuid4())
        send_launch_metrics(uid, event["RequestType"], event["ResourceProperties"])
        return {"PhysicalResourceId": uid}
    elif request_type == "Delete":
        send_launch_metrics(event["PhysicalResourceId"], event["RequestType"], None)
        return {"PhysicalResourceId": event["PhysicalResourceId"]}
    else:
        send_launch_metrics(
            event["PhysicalResourceId"],
            event["RequestType"],
            event["ResourceProperties"],
        )
        return {"PhysicalResourceId": event["PhysicalResourceId"]}