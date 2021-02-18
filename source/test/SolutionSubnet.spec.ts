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

import * as cdk from "@aws-cdk/core"
import { SynthUtils } from "@aws-cdk/assert"
import * as mock from "./Mock"
import "@aws-cdk/assert/jest"
import * as fs from "fs"
import * as ec2 from "@aws-cdk/aws-ec2"

const scope = new cdk.Stack()
const subnet = mock.subnet(scope)
const stack = SynthUtils.toCloudFormation(scope)
fs.writeFileSync("test/NAT.synth.json", JSON.stringify(stack, null, 2))

test("has expected resource counts", () => {
  expect(stack).toCountResources("AWS::EC2::Subnet", 1)
  expect(stack).toCountResources("AWS::EC2::RouteTable", 1)
})

test("method overrides work as expected", () => {
  expect(subnet.subnetId).not.toEqual("")
  expect(subnet.availabilityZone).not.toEqual("")
  expect(subnet.routeTable).not.toBeNull()
  expect(subnet.node).not.toBeNull()
  expect(subnet.stack).not.toBeNull()
  expect(subnet.internetConnectivityEstablished).toBeTruthy()

  try {
    console.log(subnet.env)
  } catch (err) {
    if (err.message !== "Not implemented") {
      throw err
    }
  }

  try {
    subnet.associateNetworkAcl(
      "",
      new ec2.NetworkAcl(scope, "nacl", {
        vpc: new ec2.Vpc(new cdk.Stack(), "novpc")
      })
    )
  } catch (err) {
    if (err.message !== "Not implemented") {
      throw err
    }
  }
})
