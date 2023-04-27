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
import { assertResourceWithIdLikeHasCondition } from "./Util"
import { Template } from "aws-cdk-lib/assertions"

const scope = new cdk.Stack()
const cfnprovider = mock.cfnprovider(scope)
mock.nat(scope, cfnprovider)
const stack = Template.fromStack(scope)
fs.writeFileSync("test/NAT.synth.json", JSON.stringify(stack, null, 2))

test("has expected resource counts", () => {
  stack.resourceCountIs("AWS::EC2::NatGateway", 1)
  stack.resourceCountIs("AWS::EC2::Route", 1)
  stack.resourceCountIs("AWS::IAM::Role", 1)
  stack.resourceCountIs("AWS::IAM::Policy", 1)
  stack.resourceCountIs("AWS::Lambda::Function", 1)
  stack.resourceCountIs("AWS::CloudFormation::CustomResource", 2)
})

test("has expected eip resource", () => {
  stack.hasResource("AWS::EC2::EIP", {
    Domain: "vpc",
    Tags: [{ Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-NAT"]] } }]
  })
})

test("eip resource uses expected condition", () => {
  assertResourceWithIdLikeHasCondition(stack, /NATNATEIP.*/, "AllocateNATIP")
})

test("has nat", () => {
  stack.hasResource("AWS::EC2::NatGateway", {
    AllocationId: { "Fn::If": ["AllocateNATIP", { "Fn::GetAtt": ["NATNATEIPEC65D153", "AllocationId"] }, { Ref: "EIPNAT" }] },
    SubnetId: "subnet-1234",
    Tags: [
      { Key: "Name", Value: { "Fn::Join": ["", [{ Ref: "AWS::StackName" }, "-NAT"]] } },
      { Key: "Reaper", Value: { "Fn::If": ["AllocateNATIP", { Ref: "NATEIPReaper07051D245" }, "n/a"] } }
    ]
  })
})

test("NAT uses expected condition", () => {
  assertResourceWithIdLikeHasCondition(stack, /NATGateway.*/, "UseNAT")
})

test("has nat route", () => {
  stack.hasResource("AWS::EC2::Route", {
    RouteTableId: "rtb-1234",
    DestinationCidrBlock: "0.0.0.0/0",
    NatGatewayId: { Ref: "NATGateway3927D637" }
  })
  assertResourceWithIdLikeHasCondition(stack, /NATRoute.*/, "UseNAT")
})

test("NAT route uses expected condition", () => {
  assertResourceWithIdLikeHasCondition(stack, /NATRoute.*/, "UseNAT")
})
