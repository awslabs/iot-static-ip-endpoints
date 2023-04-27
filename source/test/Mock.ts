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
import * as ec2 from "aws-cdk-lib/aws-ec2"
import { SolutionVpc } from "../lib/SolutionVpc"
import { NLBService } from "../lib/NLBService"
import { SolutionSubnet } from "../lib/SolutionSubnet"
import { NAT } from "../lib/NAT"
import { CustomResourcesProvider } from "../lib/CustomResourcesProvider"
import { Construct } from "constructs"

export function nat(scope: Construct, cfnprovider: CustomResourcesProvider): NAT {
  return new NAT(scope, "NAT", {
    creationExpression: cdk.Fn.conditionEquals("true", "true"),
    cfnprovider: cfnprovider,
    routeTableId: "rtb-1234",
    subnetId: "subnet-1234"
  })
}

export function cfnprovider(scope: Construct): CustomResourcesProvider {
  return new CustomResourcesProvider(scope, "CustomResourcesProvider")
}

export function vpc(scope: Construct, cfnprovider: CustomResourcesProvider): SolutionVpc {
  return new SolutionVpc(scope, "Vpc", cfnprovider)
}

export function nlb(scope: Construct, vpc: SolutionVpc, cfnprovider: CustomResourcesProvider): NLBService {
  return new NLBService(scope, "NLB", {
    vpcId: vpc.vpcId,
    subnets: vpc.cfnPublicSubnets,
    targetType: "ip",
    backendPort: 1194,
    frontendPort: 443,
    cfnprovider: cfnprovider
  })
}
export function subnet(scope: Construct): SolutionSubnet {
  const vpc = new ec2.CfnVPC(scope, "Vpc", {
    cidrBlock: "10.100.0.0/16"
  })
  const sn = new ec2.CfnSubnet(scope, "Subnet", {
    vpcId: vpc.ref,
    cidrBlock: "10.100.0.0/24"
  })
  const rt = new ec2.CfnRouteTable(scope, "RouteTable", {
    vpcId: vpc.ref
  })
  return new SolutionSubnet(sn, rt)
}
