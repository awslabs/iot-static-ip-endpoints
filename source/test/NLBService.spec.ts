/**
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from "aws-cdk-lib/core"
import * as fs from "fs"
import * as mock from "./Mock"
import { Template } from "aws-cdk-lib/assertions"

const scope = new cdk.Stack()
const cfnprovider = mock.cfnprovider(scope)
const vpc = mock.vpc(scope, cfnprovider)
mock.nlb(scope, vpc, cfnprovider)
const stack = Template.fromStack(scope)
fs.writeFileSync("test/NLBService.synth.json", JSON.stringify(stack, null, 2))

test("has a single network load balancer configured as expected", () => {
  stack.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1)
  stack.hasResource("AWS::ElasticLoadBalancingV2::LoadBalancer", {
    LoadBalancerAttributes: [{ Key: "load_balancing.cross_zone.enabled", Value: "true" }],
    Scheme: "internet-facing",
    SubnetMappings: [
      {
        AllocationId: {
          "Fn::If": ["AllocateNlb1Eip", { "Fn::GetAtt": ["NLBEip1625885A1", "AllocationId"] }, { Ref: "EIPNLB1" }]
        },
        SubnetId: { Ref: "VpcPublicSubnet15D99DDA5" }
      },
      {
        AllocationId: {
          "Fn::If": ["AllocateNlb2Eip", { "Fn::GetAtt": ["NLBEip25B15A9F0", "AllocationId"] }, { Ref: "EIPNLB2" }]
        },
        SubnetId: { Ref: "VpcPublicSubnet2DB07F317" }
      }
    ],
    Type: "network"
  })
})

test("has a single target group configured as expected", () => {
  stack.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 1)
  stack.hasResource("AWS::ElasticLoadBalancingV2::TargetGroup", {
    HealthCheckEnabled: true,
    HealthCheckIntervalSeconds: 10,
    HealthCheckPort: {
      "Fn::If": ["IsUdp", 1195, 1194]
    },
    HealthCheckProtocol: "TCP",
    HealthCheckTimeoutSeconds: 10,
    HealthyThresholdCount: 2,
    Port: 1194,
    Protocol: {
      Ref: "VPNProtocol"
    },
    TargetGroupAttributes: [
      {
        Key: "deregistration_delay.timeout_seconds",
        Value: "5"
      }
    ],
    TargetType: "ip",
    UnhealthyThresholdCount: 2,
    VpcId: {
      Ref: "VpcSolutionVpc403D449E"
    }
  })
})

test("has a single listener configured as expected", () => {
  stack.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1)
  stack.hasResource("AWS::ElasticLoadBalancingV2::Listener", {
    DefaultActions: [
      {
        TargetGroupArn: {
          Ref: "NLBTargetGroupE1D7C108"
        },
        Type: "forward"
      }
    ],
    LoadBalancerArn: {
      Ref: "NLBLoadBalancer9C1B11AD"
    },
    Port: 443,
    Protocol: {
      Ref: "VPNProtocol"
    }
  })
})
