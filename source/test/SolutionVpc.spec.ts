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
import * as mock from "./Mock"
import * as fs from "fs"
import { Template } from "aws-cdk-lib/assertions"

const scope = new cdk.Stack()
const cfnprovider = mock.cfnprovider(scope)
const vpc = mock.vpc(scope, cfnprovider)
const stack = Template.fromStack(scope)
fs.writeFileSync("test/SolutionVpc.synth.json", JSON.stringify(stack, null, 2))

test("has a single VPC which is configured as expected", () => {
  stack.resourceCountIs("AWS::EC2::VPC", 1)
  stack.hasResource("AWS::EC2::VPC", {
    CidrBlock: { Ref: "VpcCIDR" },
    EnableDnsHostnames: true,
    EnableDnsSupport: true,
    InstanceTenancy: "default",
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-vpc"]] } }]
  })
})

test("has a single internet gateway, and internet gateway attachment", () => {
  stack.resourceCountIs("AWS::EC2::InternetGateway", 1)
  stack.resourceCountIs("AWS::EC2::VPCGatewayAttachment", 1)
})

test("vpc has 4 subnets", () => {
  stack.resourceCountIs("AWS::EC2::Subnet", 4)
})

test("vpc has /26 public subnets in 2 availability zones", () => {
  stack.hasResource("AWS::EC2::Subnet", {
    AvailabilityZone: { Ref: "Zone1" },
    MapPublicIpOnLaunch: true,
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-public1"]] } }]
  })
  stack.hasResource("AWS::EC2::Subnet", {
    AvailabilityZone: { Ref: "Zone2" },
    MapPublicIpOnLaunch: true,
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-public2"]] } }]
  })
})

test("vpc has /26 private subnets in 2 availability zones", () => {
  stack.hasResource("AWS::EC2::Subnet", {
    AvailabilityZone: { Ref: "Zone1" },
    MapPublicIpOnLaunch: false,
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-private1"]] } }]
  })
  stack.hasResource("AWS::EC2::Subnet", {
    AvailabilityZone: { Ref: "Zone2" },
    MapPublicIpOnLaunch: false,
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-private2"]] } }]
  })
})

test("has 3 route tables", () => {
  stack.resourceCountIs("AWS::EC2::RouteTable", 3)
})

test("has public route table", () => {
  stack.hasResource("AWS::EC2::RouteTable", {
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-public"]] } }]
  })
})

test("has private route tables", () => {
  stack.hasResource("AWS::EC2::RouteTable", {
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-private1"]] } }]
  })
  stack.hasResource("AWS::EC2::RouteTable", {
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-private2"]] } }]
  })
})

test("has correct number of route table associations", () => {
  stack.resourceCountIs("AWS::EC2::SubnetRouteTableAssociation", 4)
})

test("public route table associated to public subnets", () => {
  stack.hasResource("AWS::EC2::SubnetRouteTableAssociation", {
    RouteTableId: {
      Ref: "VpcpublicRouteTable84AA4D2D"
    },
    SubnetId: {
      Ref: "VpcPublicSubnet15D99DDA5"
    }
  })
  stack.hasResource("AWS::EC2::SubnetRouteTableAssociation", {
    RouteTableId: {
      Ref: "VpcpublicRouteTable84AA4D2D"
    },
    SubnetId: {
      Ref: "VpcPublicSubnet2DB07F317"
    }
  })
})

test("private route tables associated to private subnets", () => {
  stack.hasResource("AWS::EC2::SubnetRouteTableAssociation", {
    RouteTableId: {
      Ref: "VpcprivateRouteTable1CC524E24"
    },
    SubnetId: {
      Ref: "VpcPrivateSubnet1C7C9FF92"
    }
  })
  stack.hasResource("AWS::EC2::SubnetRouteTableAssociation", {
    RouteTableId: {
      Ref: "VpcprivateRouteTable29D4318A6"
    },
    SubnetId: {
      Ref: "VpcPrivateSubnet231E744E9"
    }
  })
})

test("public route table has internet route", () => {
  stack.hasResource("AWS::EC2::Route", {
    RouteTableId: {
      Ref: "VpcpublicRouteTable84AA4D2D"
    },
    DestinationCidrBlock: "0.0.0.0/0",
    GatewayId: {
      Ref: "VpcInternetGatewayAFE6D548"
    }
  })
})

test("has EIP resources for NAT Gateways", () => {
  stack.hasResource("AWS::EC2::EIP", {
    Domain: "vpc",
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-NAT1"]] } }]
  })

  stack.hasResource("AWS::EC2::EIP", {
    Domain: "vpc",
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-NAT2"]] } }]
  })
})

test("has NAT Gateway resources in 2 availability zones", () => {
  stack.hasResource("AWS::EC2::NatGateway", {
    AllocationId: { "Fn::If": ["AllocateNAT1IP", { "Fn::GetAtt": ["VpcNAT1NAT1EIPFB47460A", "AllocationId"] }, { Ref: "EIPNAT1" }] },
    SubnetId: { Ref: "VpcPublicSubnet15D99DDA5" }
  })

  stack.hasResource("AWS::EC2::NatGateway", {
    AllocationId: { "Fn::If": ["AllocateNAT2IP", { "Fn::GetAtt": ["VpcNAT2NAT2EIPD6D91F97", "AllocationId"] }, { Ref: "EIPNAT2" }] },
    SubnetId: { Ref: "VpcPublicSubnet2DB07F317" }
  })
})

test("private route tables contain NAT Gateway routes", () => {
  stack.hasResource("AWS::EC2::Route", {
    RouteTableId: {
      Ref: "VpcprivateRouteTable1CC524E24"
    },
    DestinationCidrBlock: "0.0.0.0/0",
    NatGatewayId: {
      Ref: "VpcNAT1Gateway036B2D19"
    }
  })

  stack.hasResource("AWS::EC2::Route", {
    RouteTableId: {
      Ref: "VpcprivateRouteTable29D4318A6"
    },
    DestinationCidrBlock: "0.0.0.0/0",
    NatGatewayId: {
      Ref: "VpcNAT2Gateway91942A29"
    }
  })
})

test("method overrides work as expected", () => {
  // casting to any because we're accessing private methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sn = (vpc as any).getConditionalInternetRoutableSubnet("MyConditionId", vpc.privateSubnets[0], vpc.publicSubnets[0])
  expect(sn).not.toBeNull()

  try {
    console.log(sn.node)
  } catch (err) {
    if ((err as any) !== "not implemented") {
      throw err
    }
  }

  try {
    console.log(sn.stack)
  } catch (err) {
    if ((err as any) !== "not implemented") {
      throw err
    }
  }

  try {
    console.log(sn.env)
  } catch (err) {
    if ((err as any) !== "not implemented") {
      throw err
    }
  }

  try {
    sn.associateNetworkAcl()
  } catch (err) {
    if ((err as any) !== "not implemented") {
      throw err
    }
  }

  try {
    console.log(sn.routeTable)
  } catch (err) {
    if ((err as any) !== "not implemented") {
      throw err
    }
  }

  const irs = vpc.internetRoutableSubnets
  expect(irs).not.toBeNull()
  expect(irs.length).toEqual(2)

  expect(vpc.vpcId).not.toBeNull()
  expect(vpc.vpcCidrBlock).not.toBeNull()
  expect(vpc.stack).not.toBeNull()
  expect(vpc.availabilityZones).not.toBeNull()
  expect(vpc.availabilityZones.length).toEqual(2)

  expect(vpc.selectSubnets({ subnets: vpc.publicSubnets })).not.toBeNull()

  expect(vpc.selectSubnets({ subnets: vpc.publicSubnets }).hasPublic).not.toBeTruthy()

  try {
    vpc.selectSubnets({ subnetGroupName: "Public" })
  } catch (err) {
    if ((err as any) !== "not implemented") {
      throw err
    }
  }

  try {
    vpc.selectSubnets()
  } catch (err) {
    if ((err as any) !== "not implemented") {
      throw err
    }
  }

  try {
    console.log(vpc.isolatedSubnets)
  } catch (err) {
    if ((err as any) !== "vpc.isolatedSubnets Not Implemented") {
      throw err
    }
  }

  try {
    console.log(vpc.vpnGatewayId)
  } catch (err) {
    if ((err as any) !== "vpc.vpnGatewayId Not Implemented") {
      throw err
    }
  }

  try {
    console.log(vpc.internetConnectivityEstablished)
  } catch (err) {
    if ((err as any) !== "vpc.internetConnectivityEstablished Not Implemented") {
      throw err
    }
  }

  try {
    console.log(vpc.env)
  } catch (err) {
    if ((err as any) !== "vpc.env Not Implemented") {
      throw err
    }
  }

  try {
    vpc.enableVpnGateway({ type: "" })
  } catch (err) {
    if ((err as any) !== "vpc.enableVpnGateway Not Implemented") {
      throw err
    }
  }

  try {
    vpc.addVpnConnection("", { ip: "" })
  } catch (err) {
    if ((err as any) !== "vpc.addVpnConnection Not Implemented") {
      throw err
    }
  }

  try {
    vpc.addGatewayEndpoint("", { service: { name: "" } })
  } catch (err) {
    if ((err as any).message !== "vpc.addGatewayEndpoint Not Implemented") {
      throw err
    }
  }

  try {
    vpc.addInterfaceEndpoint("", { service: { name: "", port: 0 } })
  } catch (err) {
    if ((err as any) !== "vpc.addInterfaceEndpoint Not Implemented") {
      throw err
    }
  }

  try {
    vpc.addFlowLog("", {})
  } catch (err) {
    if ((err as any) !== "vpc.addFlowLog Not Implemented") {
      throw err
    }
  }
})
