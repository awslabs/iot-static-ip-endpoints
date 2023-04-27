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

import * as path from "path"
import * as cdk from "aws-cdk-lib/core"
import * as iam from "aws-cdk-lib/aws-iam"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { PYTHON_LAMBDA_RUNTIME } from "./Constants"
import { Logs } from "./Logs"
import { Condition } from "./Utils"
import { Construct } from "constructs"

export class CustomResourcesProvider extends Construct {
  private readonly serviceToken: string
  private counter = 0

  constructor(scope: Construct, id: string) {
    super(scope, id)

    const role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
    })

    // resources/conditions not supported on these actions
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          // used to release the EIP's
          "ec2:ReleaseAddress",
          // used to determine IP addresses of NLB endpoints
          "ec2:DescribeNetworkInterfaces",
          // used to pull anonymous data stats
          "cloudwatch:GetMetricStatistics",
          // used to determine the global accelerator endpoint IP
          "globalaccelerator:DescribeAccelerator",
          // used to update the HealthCheckGracePeriod attribute after first launch
          "autoscaling:UpdateAutoScalingGroup",
          // used to cleanup the EFS filesystem if retain on delete is No
          "elasticfilesystem:DeleteFileSystem"
        ],
        resources: ["*"]
      })
    )

    // allow deleting log groups created by our stack
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:DeleteLogGroup"],
        resources: [
          // we need to allow * here because when there is long stack names, the log group name is truncated (middle)
          // and then on stack delete, the policy fails to match the resources
          `arn:${cdk.Fn.ref("AWS::Partition")}:logs:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:log-group:*`
        ]
      })
    )

    // allow deleting log groups created by our stack
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:DeleteLogGroup"],
        resources: [
          `arn:${cdk.Fn.ref("AWS::Partition")}:logs:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:log-group:/aws/lambda/${cdk.Fn.ref(
            "AWS::StackName"
          )}-*`,
          `arn:${cdk.Fn.ref("AWS::Partition")}:logs:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:log-group:${cdk.Fn.ref(
            "AWS::StackName"
          )}/*`
        ]
      })
    )

    // allow describing of our stack
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudformation:DescribeStacks"],
        resources: [
          `arn:${cdk.Fn.ref("AWS::Partition")}:cloudformation:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:stack/${cdk.Fn.ref(
            "AWS::StackName"
          )}/*`
        ]
      })
    )

    const handler = new lambda.Function(this, "Lambda", {
      runtime: PYTHON_LAMBDA_RUNTIME,
      timeout: cdk.Duration.minutes(10),
      handler: "CustomResourcesProvider.handler",
      code: lambda.Code.fromAsset(path.join("assets", "lambda")),
      description: `${cdk.Fn.ref("AWS::StackName")} custom CloudFormation resource provider`,
      role: role,
      environment: {
        SEND_USAGE_DATA: cdk.Fn.findInMap("Send", "AnonymousUsage", "Data"),
        ENDPOINT: cdk.Fn.findInMap("Send", "AnonymousUsage", "Endpoint"),
        REGION: cdk.Fn.ref("AWS::Region"),
        STACK_NAME: cdk.Fn.ref("AWS::StackName"),
        SOLUTION_ID: "SO0139",
        PERIOD_SECONDS: "86400" // daily
      }
    })

    this.serviceToken = handler.functionArn

    Logs.setcfnprovider(this)
    Logs.initLambdaLogGroup(this, handler, role)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(scope: Construct, id: string, action: string, properties: { [index: string]: any } = {}): cdk.CfnCustomResource {
    const res = new cdk.CfnCustomResource(scope, id, {
      serviceToken: this.serviceToken
    })
    res.addPropertyOverride("Action", action)
    for (const p in properties) {
      res.addPropertyOverride(p, properties[p])
    }
    return res
  }

  createConditionalReaper(scope: Construct, eip: ec2.CfnEIP, condition: Condition): cdk.CfnCustomResource {
    if (!condition.cfnCondition.expression) {
      throw new Error("missing condition expression")
    }
    const res = this.create(scope, `EIPReaper${this.counter++}`, "IpReaper", { AllocationId: eip.attrAllocationId })
    condition.applyTo(res)
    return res
  }
}
