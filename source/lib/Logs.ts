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
import * as logs from "aws-cdk-lib/aws-logs"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { Fn, CfnDeletionPolicy } from "aws-cdk-lib/core"
import { createParameter, Condition, createCondition } from "./Utils"
import { CustomResourcesProvider } from "./CustomResourcesProvider"
import { Construct } from "constructs"

const logGroups: { [index: string]: logs.CfnLogGroup } = {}
let counter = 0
let retentionParam: cdk.CfnParameter | null = null
let deletionPolicyParam: cdk.CfnParameter | null = null
let isDeleteLogs: Condition | null = null
let cfnprovider: CustomResourcesProvider | null = null

export class Logs {
  static initLambdaLogGroup(scope: Construct, func: lambda.Function, role: iam.IRole): logs.CfnLogGroup {
    if (!logGroups[`/aws/lambda/${func.functionName}`]) {
      const group = new logs.CfnLogGroup(scope, `LogGroup${++counter}`, {
        logGroupName: `/aws/lambda/${func.functionName}`,
        retentionInDays: Logs.logRetentionDays(scope) as unknown as number
      })
      group.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN
      logGroups[`/aws/lambda/${func.functionName}`] = group
    }

    const resources = [
      // function name in unknown here, and passing a ref causes a circular dependency
      `arn:${Fn.ref("AWS::Partition")}:logs:${Fn.ref("AWS::Region")}:${Fn.ref("AWS::AccountId")}:log-group:/aws/lambda/${Fn.ref("AWS::StackName")}-*`,
      `arn:${Fn.ref("AWS::Partition")}:logs:${Fn.ref("AWS::Region")}:${Fn.ref("AWS::AccountId")}:log-group:/aws/lambda/${Fn.ref(
        "AWS::StackName"
      )}-*:log-stream:*`,
      `arn:${Fn.ref("AWS::Partition")}:logs:${Fn.ref("AWS::Region")}:${Fn.ref("AWS::AccountId")}:log-group:${Fn.ref("AWS::StackName")}/*`
    ]

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams"],
        effect: iam.Effect.ALLOW,
        resources: resources
      })
    )

    this.setupReaper(scope, logGroups[`/aws/lambda/${func.functionName}`])

    return logGroups[`/aws/lambda/${func.functionName}`]
  }

  static setcfnprovider(p: CustomResourcesProvider): void {
    cfnprovider = p
  }

  private static setupReaper(scope: Construct, logGroup: logs.CfnLogGroup): void {
    if (!cfnprovider) {
      throw new Error("Missing cfnprovider")
    }
    const reaper = cfnprovider.create(scope, `LogGroupReaper${++counter}`, "DeleteLogGroup", {
      LogGroupName: logGroup.logGroupName
    })
    this.deleteCondition(scope).applyTo(reaper)
  }

  static logGroupName(scope: Construct, name: string): string {
    return Logs.logGroup(scope, name).logGroupName || "%%wont-happen%"
  }

  static logGroup(scope: Construct, name: string): logs.CfnLogGroup {
    if (!logGroups[name]) {
      logGroups[name] = new logs.CfnLogGroup(scope, `LogGroup${++counter}`, {
        // Use portion of StackId UUID to create unique path for log groups
        logGroupName: `${Fn.ref("AWS::StackName")}/${Fn.select(0, Fn.split("-", Fn.select(2, Fn.split("/", Fn.ref("AWS::StackId")))))}/${name}`,
        retentionInDays: Logs.logRetentionDays(scope) as unknown as number
      })
      logGroups[name].cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN
    }
    this.setupReaper(scope, logGroups[name])
    return logGroups[name]
  }

  static allowLoggingForRole(role: iam.IRole): void {
    const resources = [
      `arn:${Fn.ref("AWS::Partition")}:logs:${Fn.ref("AWS::Region")}:${Fn.ref("AWS::AccountId")}:log-group:${Fn.ref("AWS::StackName")}/*`
    ]

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams"],
        effect: iam.Effect.ALLOW,
        resources: resources
      })
    )
  }

  static logRetentionDays(scope: Construct): string {
    if (!retentionParam) {
      retentionParam = createParameter(scope, "LogRetentionDays", {
        type: "String",
        allowedValues: ["1", "3", "5", "7", "14", "30", "60", "90", "120", "150", "180", "365", "400", "545", "731", "1827", "3653", ""],
        default: "30"
      })
    }
    return retentionParam.valueAsString
  }

  static deleteCondition(scope: Construct): Condition {
    if (!deletionPolicyParam) {
      deletionPolicyParam = createParameter(scope, "CWLRetentionPolicy", {
        type: "String",
        allowedValues: ["Retain", "Delete"],
        default: "Retain",
        description: "Controls if the CloudWatch Log Groups for this selection will be retained or delete when the stack is deleted"
      })
    }

    if (!isDeleteLogs) {
      isDeleteLogs = createCondition(scope, "DeleteLogs", {
        expression: cdk.Fn.conditionEquals(deletionPolicyParam.valueAsString, "Delete")
      })
    }

    return isDeleteLogs
  }
}
