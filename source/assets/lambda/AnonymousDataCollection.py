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
import json
import os
from AnonymousDataUtils import send_operational_metrics
import urllib


def handler(event, context):
    send_operational_metrics(
        os.environ["AUTO_SCALING_GROUP_NAME"],
        os.environ["LOAD_BALANCER_NAME"],
        os.environ["TARGET_GROUP_NAME"],
    )