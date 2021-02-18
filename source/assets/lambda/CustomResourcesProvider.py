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

from CfnResponse import send, SUCCESS, FAILED
from HealthCheckUpdater import handler as hcgp_handler
from IpLookupProvider import handler as iplookup_handler
from EIPReaper import handler as ipreaper_handler
from UUIDGen import handler as uuidgen_hander
from DeleteLogGroup import handler as deleteloggroup_hander
from DeleteEFS import handler as deleteefs_hander
import logging as log


def handler(event, context):
    try:
        if "ResourceProperties" in event and "Action" in event["ResourceProperties"]:
            action = event["ResourceProperties"]["Action"]
            log.info(f"Action: {action}")

            if action == "UpdateHealthCheck":
                res = hcgp_handler(event, context)
            elif action == "IpLookup":
                res = iplookup_handler(event, context)
            elif action == "IpReaper":
                res = ipreaper_handler(event, context)
            elif action == "UUIDGen":
                res = uuidgen_hander(event, context)
            elif action == "DeleteLogGroup":
                res = deleteloggroup_hander(event, context)
            elif action == "DeleteEFS":
                res = deleteefs_hander(event, context)
            else:
                raise Exception("Unknown action")

            send(event, context, SUCCESS, {}, res["PhysicalResourceId"])
        else:
            raise Exception("Action not specified")
    except Exception as e:
        log.error(e)
        send(event, context, FAILED, {}, reason=str(e))
