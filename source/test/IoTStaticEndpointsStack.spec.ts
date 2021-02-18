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
import "@aws-cdk/assert/jest"
import { IoTStaticEndpointsStack } from "../lib/IoTStaticEndpointsStack"

const scope = new cdk.Stack()
const _stack = new IoTStaticEndpointsStack(scope, "mystack", {})
const stack = SynthUtils.toCloudFormation(scope)

test("creates the stack", () => {
  expect(_stack).not.toBeNull()
  expect(stack).not.toBeNull()
})
