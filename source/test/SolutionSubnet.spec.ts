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
const subnet = mock.subnet(scope)
const stack = Template.fromStack(scope)
fs.writeFileSync("test/NAT.synth.json", JSON.stringify(stack, null, 2))

test("has expected resource counts", () => {
  stack.resourceCountIs("AWS::EC2::Subnet", 1)
  stack.resourceCountIs("AWS::EC2::RouteTable", 1)
})

test("method overrides work as expected", () => {
  expect(subnet.subnetId).not.toEqual("")
  expect(subnet.availabilityZone).not.toEqual("")
  expect(subnet.routeTable).not.toBeNull()
  expect(subnet.node).not.toBeNull()
  expect(subnet.stack).not.toBeNull()
  expect(subnet.internetConnectivityEstablished).toBeTruthy()
})
