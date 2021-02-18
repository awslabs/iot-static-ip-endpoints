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
import botocore
from mock import patch
import logging

logging.basicConfig()
logging.getLogger().setLevel(logging.DEBUG)


def _mock_make_api_call(self, operation_name, kwarg):
    print(operation_name)

    if operation_name == "DescribeAutoScalingGroups":
        return {
            "AutoScalingGroups": [
                {"Instances": [{"HealthStatus": "Healthy", "InstanceId": "i-123"}]}
            ]
        }

    if operation_name == "SendCommand":
        return {"Command": {"CommandId": "cmd-123"}}

    if operation_name == "GetCommandInvocation":
        return {
            "Status": "Success",
            "StandardOutputContent": "REPLACE_WITH_PRIVATE_KEY_PEM",
        }

    raise Exception("Don't know how to mock this call")


def new_mock_context():
    return patch("botocore.client.BaseClient._make_api_call", new=_mock_make_api_call)