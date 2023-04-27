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

import { GreengrassVpnService } from "./GreengrassVpnService"
import { CfnNagAspect } from "./CfnNagAspect"
import { NLBService } from "./NLBService"
import { SolutionVpc } from "./SolutionVpc"
import { NLBGlobalAccelerator } from "./NLBGlobalAccelerator"
import { IoTStaticEndpointsConfig } from "./IoTStaticEndpointsConfig"
import { StackProps, Stack, Duration, Fn } from "aws-cdk-lib/core"
import { createBasicGraphWidget, createCondition } from "./Utils"
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch"
import { Topic, Subscription, SubscriptionProtocol } from "aws-cdk-lib/aws-sns"
import { AnonymousData } from "./AnonymousData"
import { CustomResourcesProvider } from "./CustomResourcesProvider"
import { Construct } from "constructs"

/**
 * @noInheritDoc
 */
export class IoTStaticEndpointsStack extends Stack {
  /** The stack configuration */
  readonly config: IoTStaticEndpointsConfig

  /** Solution VPC */
  readonly vpc: SolutionVpc

  /** NLB Service */
  readonly nlbService: NLBService

  /** Global Accelerator */
  readonly accelerator: NLBGlobalAccelerator

  /** VPN Endpoint Service */
  readonly vpnService: GreengrassVpnService

  readonly notificationsTopic: Topic

  private peers: string[]

  private cfnprovider: CustomResourcesProvider

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    this.cfnprovider = new CustomResourcesProvider(this, "CustomResourcesProvider")
    this.config = new IoTStaticEndpointsConfig(this, "CFN")
    this.templateOptions.metadata = this.config.stackMetadata()

    this.notificationsTopic = new Topic(this, "NotificationsTopic", {})

    const sub = new Subscription(this, "NotificationsSub", {
      topic: this.notificationsTopic,
      endpoint: this.config.notificationsEmail.valueAsString,
      protocol: SubscriptionProtocol.EMAIL
    })
    // only create the subscription if an email was provided
    createCondition(this, "HasNotificationsEmail", {
      expression: Fn.conditionNot(Fn.conditionEquals(this.config.notificationsEmail.valueAsString, ""))
    }).applyTo(sub)

    this.peers = [this.config.peerCidr.valueAsString]

    // Solution VPC
    this.vpc = new SolutionVpc(this, "SolutionVpc", this.cfnprovider)

    // NLB Service
    this.nlbService = new NLBService(this, "NLBService", {
      backendPort: 1194,
      frontendPort: this.config.portParam.valueAsNumber,
      targetType: "instance",
      vpcId: this.vpc.vpcId,
      subnets: this.vpc.cfnPublicSubnets,
      cfnprovider: this.cfnprovider
    })

    // Global Accelerator
    this.accelerator = new NLBGlobalAccelerator(this, "Accelerator", {
      cfnprovider: this.cfnprovider,
      nlbArn: this.nlbService.nlb.ref,
      port: this.config.portParam.valueAsNumber,
      protocol: this.nlbService.config.protocol.valueAsString
    })

    // VPN
    this.vpnService = new GreengrassVpnService(this, "VPN", {
      peers: this.peers,
      acceleratorIp1: this.accelerator.ip1,
      acceleratorIp2: this.accelerator.ip2,
      frontendPort: this.config.portParam.valueAsNumber,
      backendPort: 1194,
      nlbService: this.nlbService,
      vpc: this.vpc,
      cpuScalingOptions: {
        dashboardMeticPeriod: Duration.minutes(5),
        cpuPercentHigh: 80,
        cpuPercentLow: 15,
        estimatedInstanceWarmup: Duration.minutes(3)
      },
      cfnprovider: this.cfnprovider,
      notificationsTopic: this.notificationsTopic
    })

    this.setupCloudWatchDashboard()

    new AnonymousData(this, "AnonymousData", {
      autoScalingGroupName: this.vpnService.autoScalingGroup.autoScalingGroupName,
      loadBalancerName: this.nlbService.nlb.attrLoadBalancerFullName,
      targetGroupName: this.nlbService.targetGroup.attrTargetGroupFullName,
      cfnprovider: this.cfnprovider
    })

    CfnNagAspect.applyTo(this)
  }

  private setupCloudWatchDashboard(): void {
    const dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `${Fn.ref("AWS::StackName")}-${Fn.ref("AWS::Region")}`
    })

    dashboard.addWidgets(this.createActiveFlowsWidget(), this.createNewFlowsWidget(), this.createHostsWidget())
    dashboard.addWidgets(this.createCpuWidget(), this.createClusterNetworkWidget(), this.createConnectDisconnectsWidget())
  }

  private createConnectDisconnectsWidget(): cloudwatch.IWidget {
    return createBasicGraphWidget({
      title: "VPN Connects/Disconnects",
      stacked: false,
      namespace: [`${Fn.ref("AWS::StackName")}/VPN`, `${Fn.ref("AWS::StackName")}/VPN`],
      metricName: ["ClientConnect", "ClientDisconnect"],
      stat: ["sum", "sum"],
      dimensions: []
    })
  }

  /** CPU usage widget */
  private createCpuWidget(): cloudwatch.IWidget {
    const leftAnnotations = []
    if (this.vpnService.props.cpuScalingOptions) {
      leftAnnotations.push({
        value: this.vpnService.props.cpuScalingOptions.cpuPercentHigh || 1,
        label: "Scale Out Threshold",
        color: "#FF0000"
      })
      leftAnnotations.push({
        value: this.vpnService.props.cpuScalingOptions.cpuPercentLow || 0,
        label: "Scale In Threshold",
        color: "#00FF00"
      })
    }
    return new cloudwatch.GraphWidget({
      title: "Cluster Avg CPU",
      stacked: false,
      leftYAxis: {
        min: 0,
        max: 100
      },
      left: [
        new cloudwatch.Metric({
          statistic: "Average",
          namespace: "AWS/EC2",
          metricName: "CPUUtilization",
          dimensionsMap: { AutoScalingGroupName: this.vpnService.autoScalingGroup.autoScalingGroupName }
        })
      ],
      leftAnnotations: leftAnnotations
    })
  }

  /** Network usage widget */
  private createClusterNetworkWidget(): cloudwatch.IWidget {
    return createBasicGraphWidget({
      title: "Cluster Avg Tx/Rx",
      stacked: true,
      namespace: ["AWS/EC2", "AWS/EC2"],
      metricName: ["NetworkIn", "NetworkOut"],
      dimensions: [
        { AutoScalingGroupName: this.vpnService.autoScalingGroup.autoScalingGroupName },
        { AutoScalingGroupName: this.vpnService.autoScalingGroup.autoScalingGroupName }
      ],
      stat: ["avg", "avg"]
    })
  }

  /** Create active flows widget */
  private createActiveFlowsWidget(): cloudwatch.IWidget {
    return createBasicGraphWidget({
      title: "Avg Active Flows",
      namespace: ["AWS/NetworkELB"],
      metricName: ["ActiveFlowCount"],
      dimensions: [{ LoadBalancer: this.nlbService.nlb.attrLoadBalancerFullName }],
      stat: ["avg"],
      stacked: false
    })
  }

  /** Create new flows widget */
  private createNewFlowsWidget(): cloudwatch.IWidget {
    return createBasicGraphWidget({
      title: "New Flows",
      namespace: ["AWS/NetworkELB"],
      metricName: ["NewFlowCount"],
      dimensions: [{ LoadBalancer: this.nlbService.nlb.attrLoadBalancerFullName }],
      stat: ["sum"],
      stacked: false
    })
  }

  /** Create healthy/unhealthy hosts widget */
  private createHostsWidget(): cloudwatch.IWidget {
    return createBasicGraphWidget({
      title: "VPN Hosts",
      stacked: true,
      namespace: ["AWS/NetworkELB", "AWS/NetworkELB"],
      metricName: ["HealthyHostCount", "UnHealthyHostCount"],
      dimensions: [
        { LoadBalancer: this.nlbService.nlb.attrLoadBalancerFullName, TargetGroup: this.nlbService.targetGroup.attrTargetGroupFullName },
        { LoadBalancer: this.nlbService.nlb.attrLoadBalancerFullName, TargetGroup: this.nlbService.targetGroup.attrTargetGroupFullName }
      ],
      stat: ["min", "max"]
    })
  }
}
