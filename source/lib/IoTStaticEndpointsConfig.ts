/**
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use
 * this file except in compliance with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under the License.
 **/

import { createParameter } from "./Utils"
import { Construct, CfnParameter, Stack } from "@aws-cdk/core"

/**
 * Configures the stack with our parameters, conditions, and other metadata.
 *
 * @noInheritDoc
 */
export class IoTStaticEndpointsConfig extends Construct {
  readonly peerCidr: CfnParameter
  readonly notificationsEmail: CfnParameter

  /**
   * The port the endpoint will run on.
   *
   * @default 1194
   * @updatable Do not change after creation
   */
  readonly portParam: CfnParameter

  constructor(scope: Stack, id: string) {
    super(scope, id)

    this.peerCidr = createParameter(this, "PeerCidr", {
      type: "String",
      default: "0.0.0.0/0",
      allowedPattern:
        "^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\/([0-9]|[1-2][0-9]|3[0-2]))$",
      description: "The remote CIDR range to permit ingress traffic to our endpoints"
    })

    this.portParam = createParameter(this, "Port", {
      type: "Number",
      default: 1194,
      minValue: 1,
      maxValue: 65535,
      description: "[Non-Updatable] The port the endpoint will listen on"
    })

    this.notificationsEmail = createParameter(this, "NotificationsEmail", {
      type: "String",
      description: "[Optional/Recommended] The email which notifications will be sent to. (i.e. Auto Scaling Events)",
      default: ""
    })
  }

  stackMetadata(): { [index: string]: unknown } {
    return {
      "AWS::Solution::Information": this.getReadmeMetadata(),
      "AWS::CloudFormation::Interface": {
        ParameterLabels: {
          Port: { default: "Port" },
          UseNatGateways: { default: "Use NAT Gateways" },
          EIPNAT1: { default: "NAT Gateway Zone 1 - EIP Allocation ID" },
          EIPNAT2: { default: "NAT Gateway Zone 2 - EIP Allocation ID" },
          EIPNLB1: { default: "NLB Zone 1 - EIP Allocation ID" },
          EIPNLB2: { default: "NLB Zone 2 - EIP Allocation ID" },
          GlobalAccelerator: { default: "Activate Global Accelerator" },
          BYOIPGA1: { default: "Global Accelerator IP 1 - Bring Your Own IP Address" },
          BYOIPGA2: { default: "Global Accelerator IP 2 - Bring Your Own IP Address" },
          VPNProtocol: { default: "VPN Tunnel Protocol" },
          AutoScalingMinCapacity: { default: "Auto Scaling Group - Min Capacity" },
          AutoScalingMaxCapacity: { default: "Auto Scaling Group - Max Capacity" },
          InstanceAMI: { default: "Instance AMI" },
          InstanceType: { default: "Instance Type" },
          PeerCidr: { default: "Peer CIDR" },
          ActivateFlowLogsToCloudWatch: { default: "Activate VPC FlowLogs Delivery to CloudWatch" },
          LogRetentionDays: { default: "Log Retention Days" },
          CAValidDays: { default: "CA Valid Days" },
          NotificationsEmail: { default: "Notifications Email" },
          EFSRetentionPolicy: { default: "EFS Retention Policy" },
          CWLRetentionPolicy: { default: "CloudWatch Logs Retention Policy" },
          VpcCIDR: { default: "VPC CIDR" },
          OpenVpnKeepAliveSeconds: { default: "OpenVPN Keepalive Seconds" }
        },
        ParameterGroups: [
          {
            Label: { default: "Amazon VPC configuration" },
            Parameters: ["Zone1", "Zone2", "VpcCIDR", "UseNatGateways", "EIPNAT1", "EIPNAT2"]
          },
          {
            Label: { default: "Load balancer configuration" },
            Parameters: ["Port", "EIPNLB1", "EIPNLB2"]
          },
          {
            Label: { default: "AWS Global Accelerator configuration" },
            Parameters: ["GlobalAccelerator", "BYOIPGA1", "BYOIPGA2"]
          },
          {
            Label: { default: "Amazon VPN configuration" },
            Parameters: [
              "VPNProtocol",
              "AutoScalingMinCapacity",
              "AutoScalingMaxCapacity",
              "InstanceAMI",
              "InstanceType",
              "CAValidDays",
              "OpenVpnKeepAliveSeconds"
            ]
          },
          {
            Label: { default: "Security and monitoring" },
            Parameters: ["PeerCidr", "NotificationsEmail"]
          },
          {
            Label: { default: "Logging configuration" },
            Parameters: ["LogRetentionDays", "ActivateFlowLogsToCloudWatch"]
          },
          {
            Label: { default: "Data retention policies" },
            Parameters: ["EFSRetentionPolicy", "CWLRetentionPolicy"]
          }
        ]
      }
    }
  }

  private getReadmeMetadata(): { [index: string]: unknown } {
    return {
      Name: "%%SOLUTION_DISPLAY_NAME%%",
      License: "Apache 2.0"
    }
  }
}
