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
import { CfnMapping } from "@aws-cdk/core"
import * as iam from "@aws-cdk/aws-iam"
import * as lambda from "@aws-cdk/aws-lambda"
import { createCondition, Condition } from "./Utils"
import { PYTHON_LAMBDA_RUNTIME } from "./Constants"
import * as path from "path"
import { Logs } from "./Logs"
import * as events from "@aws-cdk/aws-events"
import * as targets from "@aws-cdk/aws-events-targets"
import { CustomResourcesProvider } from "./CustomResourcesProvider"
import * as constants from "./Constants"

export interface AnonymousDataProps {
  readonly autoScalingGroupName: string
  readonly loadBalancerName: string
  readonly targetGroupName: string
  readonly cfnprovider: CustomResourcesProvider
}

export class AnonymousData extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AnonymousDataProps) {
    super(scope, id)

    // mapping for users to activate/deactivate anonymous usage collection
    new CfnMapping(this, "Send", {
      mapping: {
        AnonymousUsage: {
          Data: "Yes",
          Endpoint: "metrics.awssolutionsbuilder.com"
        }
      }
    }).overrideLogicalId("Send")

    // condition for anonymous usage collection resources
    const cond = createCondition(this, "SendAnonymousData", {
      expression: cdk.Fn.conditionEquals(cdk.Fn.findInMap("Send", "AnonymousUsage", "Data"), "Yes")
    })

    this.setupUUID(props)

    this.setupAnonymousUsageCollectionLambda(props, cond)

    new CfnMapping(this, "Solution", {
      mapping: {
        Information: {
          Version: constants.VERSION
        }
      }
    }).overrideLogicalId("Solution")

    new cdk.CfnOutput(this, "Version", {
      value: constants.VERSION
    }).overrideLogicalId("Version")
  }

  private setupAnonymousUsageCollectionLambda(props: AnonymousDataProps, cond: Condition): lambda.Function {
    const role = new iam.Role(this, "AnonymousCollectionLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
    })
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:GetMetricStatistics"],
        resources: ["*"]
        // resource does not support conditions
      })
    )

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
    cond.applyTo(role)

    const func = new lambda.Function(this, "AnonymousDataCollector", {
      runtime: PYTHON_LAMBDA_RUNTIME,
      code: lambda.Code.asset(path.join("assets", "lambda")),
      handler: "AnonymousDataCollection.handler",
      timeout: cdk.Duration.minutes(5),
      description: `${cdk.Fn.ref("AWS::StackName")} anonymous usage collection`,
      role: role,
      environment: {
        REGION: cdk.Fn.ref("AWS::Region"),
        STACK_NAME: cdk.Fn.ref("AWS::StackName"),
        AUTO_SCALING_GROUP_NAME: props.autoScalingGroupName,
        LOAD_BALANCER_NAME: props.loadBalancerName,
        TARGET_GROUP_NAME: props.targetGroupName,
        SOLUTION_ID: constants.SOLUTION_ID,
        ENDPOINT: cdk.Fn.findInMap("Send", "AnonymousUsage", "Endpoint"),
        PERIOD_SECONDS: "86400", // daily,
        SEND_USAGE_DATA: cdk.Fn.findInMap("Send", "AnonymousUsage", "Data")
      }
    })
    cond.applyTo(func)

    const logGroup = Logs.initLambdaLogGroup(this, func, role)
    cond.applyTo(logGroup)

    // Report AnonymousUsage daily
    const dailyRule = new events.Rule(this, "DailyUsageCollection", {
      enabled: true,
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new targets.LambdaFunction(func)]
    })
    cond.applyTo(dailyRule)

    return func
  }

  private setupUUID(props: AnonymousDataProps) {
    const uuid = props.cfnprovider.create(this, "UUIDResource", "UUIDGen", {
      AutoScalingGroupName: props.autoScalingGroupName,
      LoadBalancerName: props.loadBalancerName,
      TargetGroupName: props.targetGroupName,
      Port: cdk.Fn.ref("Port"),
      UseNatGateways: cdk.Fn.ref("UseNatGateways"),
      EIPNAT1: cdk.Fn.ref("EIPNAT1"),
      EIPNAT2: cdk.Fn.ref("EIPNAT2"),
      EIPNLB1: cdk.Fn.ref("EIPNLB1"),
      EIPNLB2: cdk.Fn.ref("EIPNLB2"),
      GlobalAccelerator: cdk.Fn.ref("GlobalAccelerator"),
      BYOIPGA1: cdk.Fn.ref("BYOIPGA1"),
      BYOIPGA2: cdk.Fn.ref("BYOIPGA2"),
      VPNProtocol: cdk.Fn.ref("VPNProtocol"),
      AutoScalingMinCapacity: cdk.Fn.ref("AutoScalingMinCapacity"),
      AutoScalingMaxCapacity: cdk.Fn.ref("AutoScalingMaxCapacity"),
      InstanceAMI: cdk.Fn.ref("InstanceAMI"),
      InstanceType: cdk.Fn.ref("InstanceType"),
      PeerCidr: cdk.Fn.ref("PeerCidr"),
      ActivateFlowLogsToCloudWatch: cdk.Fn.ref("ActivateFlowLogsToCloudWatch"),
      LogRetentionDays: cdk.Fn.ref("LogRetentionDays"),
      CWLRetentionPolicy: cdk.Fn.ref("CWLRetentionPolicy"),
      EFSRetentionPolicy: cdk.Fn.ref("EFSRetentionPolicy"),
      CAValidDays: cdk.Fn.ref("CAValidDays"),
      NotificationsEmail: cdk.Fn.ref("NotificationsEmail"),
      Version: constants.VERSION
    })

    new cdk.CfnOutput(this, "UUID", {
      value: uuid.ref
    }).overrideLogicalId("UUID")
  }
}
