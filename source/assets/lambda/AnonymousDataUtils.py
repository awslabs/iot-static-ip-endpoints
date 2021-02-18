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
from datetime import datetime, timedelta
import urllib
import logging as log
from awsutil import get_client

REGION = os.environ["REGION"]
STACK_NAME = os.environ["STACK_NAME"]
SOLUTION_ID = os.environ["SOLUTION_ID"]
PERIOD_SECONDS = int(os.environ["PERIOD_SECONDS"])
SEND_USAGE_DATA = os.environ["SEND_USAGE_DATA"] == "Yes"

cloudwatch = get_client("cloudwatch")
cfn = get_client("cloudformation")


def send(payload):
    if not SEND_USAGE_DATA:
        log.info("Anonymous data collection not activated, skipping send")
        return

    log.info("Anonymous data payload")
    log.info(json.dumps(payload))
    req = urllib.request.Request(
        method="POST",
        url=f"https://{os.environ['ENDPOINT']}/generic",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
    )

    if "UNIT_TESTING" in os.environ and os.environ["UNIT_TESTING"] == "Yes":
        log.warn("Skipping metrics send because we're just unit testing, payload:")
        log.info(payload)
        return

    response = urllib.request.urlopen(req)

    log.info("Anonymous data post response")
    log.info(response.read())


def safe_datapoint(res, stat):
    if "Datapoints" in res and len(res["Datapoints"]) > 0:
        val = res["Datapoints"][0]
        return val[stat] if stat in val else ""
    return ""


def get_vpn_metric(MetricName, Statistic="Average", Unit="None"):
    return safe_datapoint(
        cloudwatch.get_metric_statistics(
            Namespace=f"{STACK_NAME}/VPN",
            MetricName=MetricName,
            StartTime=datetime.now() - timedelta(hours=1),
            EndTime=datetime.now(),
            Period=PERIOD_SECONDS,
            Statistics=[Statistic],
            Unit=Unit,
        ),
        Statistic,
    )


def get_cluster_metric(
    AutoScalingGroupName, MetricName, Statistic="Average", Unit="None"
):
    return safe_datapoint(
        cloudwatch.get_metric_statistics(
            Namespace="AWS/EC2",
            MetricName=MetricName,
            Dimensions=[
                {"Name": "AutoScalingGroupName", "Value": AutoScalingGroupName}
            ],
            StartTime=datetime.now() - timedelta(hours=1),
            EndTime=datetime.now(),
            Period=PERIOD_SECONDS,
            Statistics=[Statistic],
            Unit=Unit,
        ),
        Statistic,
    )


def get_nlb_metric(LoadBalancerName, MetricName, Statistic="Average", Unit="None"):
    return safe_datapoint(
        cloudwatch.get_metric_statistics(
            Namespace="AWS/NetworkELB",
            MetricName=MetricName,
            Dimensions=[{"Name": "LoadBalancer", "Value": LoadBalancerName}],
            StartTime=datetime.now() - timedelta(hours=1),
            EndTime=datetime.now(),
            Period=PERIOD_SECONDS,
            Statistics=[Statistic],
            Unit=Unit,
        ),
        Statistic,
    )


def get_tg_metric(
    LoadBalancerName, TargetGroupName, MetricName, Statistic="Average", Unit="None"
):
    return safe_datapoint(
        cloudwatch.get_metric_statistics(
            Namespace="AWS/NetworkELB",
            MetricName=MetricName,
            Dimensions=[
                {"Name": "LoadBalancer", "Value": LoadBalancerName},
                {"Name": "TargetGroup", "Value": TargetGroupName},
            ],
            StartTime=datetime.now() - timedelta(hours=1),
            EndTime=datetime.now(),
            Period=PERIOD_SECONDS,
            Statistics=[Statistic],
            Unit=Unit,
        ),
        Statistic,
    )


def get_stack_details():
    res = cfn.describe_stacks(StackName=STACK_NAME)
    stack = res["Stacks"][0]
    params = {}
    outputs = {}
    for p in stack["Parameters"]:
        params[p["ParameterKey"]] = p["ParameterValue"]
    for o in stack["Outputs"]:
        outputs[o["OutputKey"]] = o["OutputValue"]
    return (params, outputs)


def wrap(uuid, payload):
    return {
        "Solution": SOLUTION_ID,
        "UUID": uuid,
        "TimeStamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "Data": payload,
    }


def send_launch_metrics(uuid, cfnEventType, params):
    try:
        if params:
            send(
                wrap(
                    uuid,
                    {
                        "D00_Type": cfnEventType,
                        "D01_Version": params["Version"],
                        "D03_UseNatGateways": params["UseNatGateways"] == "Yes",
                        "D04_UseNatBYOIP": params["EIPNAT1"] != "",
                        "D05_Port": params["Port"],
                        "D06_UseNlbBYOIP": params["EIPNLB1"] != "",
                        "D07_UseGA": params["GlobalAccelerator"] == "Yes",
                        "D08_UseGABYOIP": params["BYOIPGA1"] != "",
                        "D09_Protocol": params["VPNProtocol"],
                        "D10_AutoScalingMinCapacity": params["AutoScalingMinCapacity"],
                        "D11_AutoScalingMaxCapacity": params["AutoScalingMaxCapacity"],
                        "D12_InstanceType": params["InstanceType"],
                        "D13_ActivateFlowLogsToCloudWatch": params[
                            "ActivateFlowLogsToCloudWatch"
                        ]
                        == "Yes",
                        "D14_EFSRetentionPolicy": params["EFSRetentionPolicy"],
                        "D15_CWLRetentionPolicy": params["CWLRetentionPolicy"],
                    },
                )
            )
        else:
            send(wrap(uuid, {"D00_Type": cfnEventType}))
    except Exception as e:
        # ignore failures, if anonymous collection fails it should not impact the customer
        log.error(e)


def send_operational_metrics(AsgName, LbName, TgName):
    params, outputs = get_stack_details()
    send(
        wrap(
            outputs["UUID"],
            {
                # Deployment
                "D00_Type": "Usage",
                "D01_Version": outputs["Version"],
                "D03_UseNatGateways": params["UseNatGateways"] == "Yes",
                "D04_UseNatBYOIP": params["EIPNAT1"] != "",
                "D05_Port": params["Port"],
                "D06_UseNlbBYOIP": params["EIPNLB1"] != "",
                "D07_UseGA": params["GlobalAccelerator"] == "Yes",
                "D08_UseGABYOIP": params["BYOIPGA1"] != "",
                "D09_Protocol": params["VPNProtocol"],
                "D10_AutoScalingMinCapacity": params["AutoScalingMinCapacity"],
                "D11_AutoScalingMaxCapacity": params["AutoScalingMaxCapacity"],
                "D12_InstanceType": params["InstanceType"],
                "D13_ActivateFlowLogsToCloudWatch": params[
                    "ActivateFlowLogsToCloudWatch"
                ]
                == "Yes",
                # Operational
                "O01_ClientConnectCount": get_vpn_metric(
                    "ClientConnect", Statistic="Sum", Unit="Count"
                ),
                "O02_ClientDisconnectCount": get_vpn_metric(
                    "ClientDisconnect", Statistic="Sum", Unit="Count"
                ),
                "O03_CPUUtilizationAvg": get_cluster_metric(
                    AsgName, "CPUUtilization", Unit="Percent"
                ),
                "O04_NetworkInAvg": get_cluster_metric(
                    AsgName, "NetworkIn", Unit="Bytes"
                ),
                "O05_NetworkOutAvg": get_cluster_metric(
                    AsgName, "NetworkOut", Unit="Bytes"
                ),
                "O06_ActiveFlowsAvg": get_nlb_metric(
                    LbName, "ActiveFlowCount", Unit="Count"
                ),
                "O07_NewFlowsAvg": get_nlb_metric(
                    LbName, "ActiveFlowCount", Unit="Count"
                ),
                "O08_HealthyHostsAvg": get_tg_metric(
                    LbName, TgName, "HealthyHostCount", Unit="Count"
                ),
                "O09_UnhealthyHostsAvg": get_tg_metric(
                    LbName, TgName, "UnHealthyHostCount", Unit="Count"
                ),
            },
        )
    )
