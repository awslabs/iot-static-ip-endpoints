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

import { IAspect, Construct, IConstruct, CfnResource, Aspects } from "@aws-cdk/core"

/**
 * List of cfn-nag suppressions where the key matches part of the CDK path
 */
const CFN_NAG_SUPPRESSIONS: {
  [index: string]: { id: string; reason: string }[]
} = {
  "/CustomResourcesProvider/Role/DefaultPolicy/Resource": [
    // W12: IAM policy should not allow * resource
    { id: "W12", reason: "* only on require actions which resource ids are not possible to use or unknown at the time of creation" },
    {
      id: "W76",
      reason: "High SPCM - complexity comes from implementing as granular as possible permissions on actions not supporting conditions/resources"
    }
  ],
  "/CreateDeviceCertLambdaRole/DefaultPolicy": [
    // W12: IAM policy should not allow * resource
    { id: "W12", reason: "* only on ssm:GetCommandInvocation, autoscaling:DescribeAutoScalingGroups (resources/conditions not supported)" }
  ],
  "RevokeDeviceCertLambdaRole/DefaultPolicy": [
    // W12: IAM policy should not allow * resource
    { id: "W12", reason: "* only on ssm:GetCommandInvocation, autoscaling:DescribeAutoScalingGroups (resources/conditions not supported)" }
  ],
  "/AnonymousData/AnonymousCollectionLambdaRole/DefaultPolicy/Resource": [
    // W12: IAM policy should not allow * resource
    { id: "W12", reason: "* only on cloudwatch:GetMetricStatistics (resources/conditions not supported)" }
  ],
  "/NLBService/LoadBalancer": [
    // W52: Elastic Load Balancer V2 should have access logging activated
    { id: "W52", reason: "NLB in use, VPC FlowLogs can be activated for visibility" }
  ],
  "/SolutionVpc/PublicSubnet1": [
    // W33: EC2 Subnet should not have MapPublicIpOnLaunch set to true
    { id: "W33", reason: "This is a public subnet, MapPublicIpOnLaunch is expected" }
  ],
  "/SolutionVpc/PublicSubnet2": [
    // W33: EC2 Subnet should not have MapPublicIpOnLaunch set to true
    { id: "W33", reason: "This is a public subnet, MapPublicIpOnLaunch is expected" }
  ],
  "/VPN/EC2SecurityGroup/": [
    // Our VPN servers are expected to have egress to world. This is a core feature of the solution.
    { id: "W40", reason: "Egress to any protocol expected" },
    { id: "W5", reason: "Egress CIDR open to world expected" },
    { id: "W9", reason: "Non-CIDR Egress Expected" }
  ],
  "/VPN/EFSSecurityGroup/": [
    // Security group denies all traffic using an impossible rule (from AWS CDK)
    //     "No machine can ever actually have the 255.255.255.255 IP address, but in order to
    //      lock it down even more we'll restrict to a nonexistent * ICMP traffic type."
    { id: "W29", reason: "False positive" }
  ],
  // match all log groups
  LogGroup: [{ id: "W84", reason: "Logs don't contain sensitive information." }],

  // All of our Lambda's have access to write to our log groups provisioned by this solution
  // we use a tigher policy then what cfn nag checks for, this the false positives
  "/VPN/CreateDeviceVpnCertificateLambda/": [{ id: "W58", reason: "False positive - Logging permissions in role policy" }],
  "/VPN/RevokeDeviceVpnCertificateLambda/": [{ id: "W58", reason: "False positive - Logging permissions in role policy" }],
  "/AnonymousData/AnonymousDataCollector/Resource": [{ id: "W58", reason: "False positive - Logging permissions in role policy" }],
  "/CustomResourcesProvider/Lambda/Resource": [{ id: "W58", reason: "False positive - Logging permissions in role policy" }],

  "/NotificationsTopic/Resource": [
    //W47 -  SNS Topic should specify KmsMasterKeyId property
    { id: "W47", reason: "Only passes data with a sensitivity level low enough for email delivery" }
  ]
}

/**
 * CDK Visitor for applying cfn-nag suppression metadata
 *
 * @noInheritDoc
 */
export class CfnNagAspect implements IAspect {
  static applyTo(node: Construct): void {
    new CfnNagAspect(node)
  }

  private constructor(construct: IConstruct) {
    Aspects.of(construct).add(this)
  }

  visit(node: Construct): void {
    if (node instanceof CfnResource) {
      for (const id in CFN_NAG_SUPPRESSIONS) {
        if (node.node.path.indexOf(id) !== -1) {
          node.addMetadata("cfn_nag", {
            rules_to_suppress: CFN_NAG_SUPPRESSIONS[id]
          })
        }
      }
    }
  }
}
