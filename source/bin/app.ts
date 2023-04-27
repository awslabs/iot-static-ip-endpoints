#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core"
import { IoTStaticEndpointsStack } from "../lib/IoTStaticEndpointsStack"
import * as Constants from "../lib/Constants"

const app = new cdk.App()
const name = process.env.STACK_NAME || Constants.SOLUTION_NAME

new IoTStaticEndpointsStack(app, name, {
  stackName: name,
  description: `(${Constants.SOLUTION_ID}) - ${Constants.SOLUTION_DISPLAY_NAME} Version %%SOLUTION_VERSION%%`
})

app.synth()
