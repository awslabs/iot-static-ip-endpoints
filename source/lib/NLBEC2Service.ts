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

import { Duration, CfnParameter, Fn, Tags } from "aws-cdk-lib/core"
import { SecurityGroup, CfnSecurityGroupIngress, InstanceType, MachineImageConfig, OperatingSystemType, UserData } from "aws-cdk-lib/aws-ec2"
import { ManagedPolicy, PolicyStatement, Effect } from "aws-cdk-lib/aws-iam"
import { IMetric, Unit, Metric } from "aws-cdk-lib/aws-cloudwatch"
import { NLBService } from "./NLBService"
import { SolutionVpc } from "./SolutionVpc"
import { createParameter } from "./Utils"
import { AutoScalingGroup, CfnAutoScalingGroup, AdjustmentType, BlockDeviceVolume, Monitoring, ScalingEvents } from "aws-cdk-lib/aws-autoscaling"
import { Logs } from "./Logs"
import { Topic } from "aws-cdk-lib/aws-sns"
import { CustomResourcesProvider } from "./CustomResourcesProvider"
import { Construct } from "constructs"

export interface CpuScalingOptions {
  /** The period used for the CloudWatch metrics */
  readonly dashboardMeticPeriod: Duration
  /** Scale-in CPU threshold */
  readonly cpuPercentLow: number

  /** Scale-out CPU threshold */
  readonly cpuPercentHigh: number

  /** Estimated instance startup time */
  readonly estimatedInstanceWarmup: Duration
}

export interface NLBEC2ServiceConfig {
  readonly instanceTypeParam: CfnParameter
  readonly instanceAmiParam: CfnParameter
  readonly asgMinCapacityParam: CfnParameter
  readonly asgMaxCapacityParam: CfnParameter
}

export interface NLBEC2ServiceProps {
  /** CPU scaling configuration */
  readonly cpuScalingOptions?: CpuScalingOptions

  /** The NLB service to connect into */
  readonly nlbService: NLBService

  /** Peer IP addresses */
  readonly peers: string[]

  /** The service backend port */
  readonly backendPort: number

  /** The service VPC */
  readonly vpc: SolutionVpc

  readonly notificationsTopic: Topic

  readonly cfnprovider: CustomResourcesProvider
}

/**
 * Construct for a Layer4 EC2 based service which is placed into
 * a VPC behind a network load balancer.
 *
 * @noInheritDoc
 */
export class NLBEC2Service extends Construct {
  /** The instances security group */
  readonly securityGroup: SecurityGroup

  /** The auto scaling group */
  readonly autoScalingGroup: AutoScalingGroup

  readonly config: NLBEC2ServiceConfig

  readonly props: NLBEC2ServiceProps

  constructor(scope: Construct, id: string, props: NLBEC2ServiceProps) {
    super(scope, id)
    this.props = props

    this.config = {
      instanceTypeParam: createParameter(this, "InstanceType", {
        type: "String",
        default: "t3.small",
        description: "The instance type to use. Be sure to switch AMI to x86_64 or arm64 based on instance architecture.",
        allowedPattern: "^[a-z][a-z0-9-]+\\.[0-9a-z]+$"
      }),
      instanceAmiParam: createParameter(this, "InstanceAMI", {
        type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
        default: "/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2",
        allowedValues: [
          "/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-arm64-gp2",
          "/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2"
        ]
      }),
      asgMinCapacityParam: createParameter(this, "AutoScalingMinCapacity", {
        type: "Number",
        minValue: 1,
        default: 2,
        description: "Minimum cluster size."
      }),
      asgMaxCapacityParam: createParameter(this, "AutoScalingMaxCapacity", {
        type: "Number",
        minValue: 1,
        default: 10,
        description: "Maximum cluster size."
      })
    }

    // Service EC2 security group
    this.securityGroup = this.setupSecurityGroup(props)

    // Auto Scaling Group
    this.autoScalingGroup = this.setupAutoScaling(props)
  }

  /** Setup the EC2 security group */
  private setupSecurityGroup(props: NLBEC2ServiceProps): SecurityGroup {
    const sg = new SecurityGroup(this, "EC2SecurityGroup", {
      description: `${Fn.ref("AWS::StackName")} OpenVPN EC2 Instance`,
      vpc: props.vpc
    })
    Tags.of(sg).add("Name", `${Fn.ref("AWS::StackName")}-ec2`)

    new CfnSecurityGroupIngress(this, "HealthCheckIngress", {
      groupId: sg.securityGroupId,
      ipProtocol: "TCP",
      cidrIp: props.vpc.vpcCidrBlock, // only allow health checks from the NLB
      toPort: props.nlbService.healthCheckPort as unknown as number,
      fromPort: props.nlbService.healthCheckPort as unknown as number,
      description: "Health Checks"
    })

    props.peers.forEach((peer) => {
      new CfnSecurityGroupIngress(this, "VPNIngress", {
        groupId: sg.securityGroupId,
        ipProtocol: Fn.conditionIf(props.nlbService.config.isUdp.logicalId, "UDP", "TCP") as unknown as string,
        cidrIp: peer,
        toPort: props.backendPort,
        fromPort: props.backendPort,
        description: "VPN"
      })
    })

    return sg
  }

  /** Setup the auto scaling group */
  private setupAutoScaling(props: NLBEC2ServiceProps): AutoScalingGroup {
    const imageId = this.config.instanceAmiParam.valueAsString

    const asg = new AutoScalingGroup(this, "Asg", {
      instanceType: this.config.instanceTypeParam.valueAsString as unknown as InstanceType,
      vpc: props.vpc,
      vpcSubnets: { subnets: props.vpc.internetRoutableSubnets },
      instanceMonitoring: Monitoring.DETAILED,
      machineImage: {
        getImage(): MachineImageConfig {
          return {
            imageId: imageId,
            osType: OperatingSystemType.LINUX,
            userData: UserData.forLinux()
          }
        }
      },
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: BlockDeviceVolume.ebs(8, { encrypted: true, deleteOnTermination: true })
        }
      ],
      minCapacity: this.config.asgMinCapacityParam.valueAsNumber,
      maxCapacity: this.config.asgMaxCapacityParam.valueAsNumber,
      securityGroup: this.securityGroup,
      healthCheck: { type: "ELB" },
      notifications: [{ topic: props.notificationsTopic, scalingEvents: ScalingEvents.ALL }]
    })

    const aAsg = asg.node.defaultChild as CfnAutoScalingGroup
    // on create, wait for all instances to report healthy
    // timeout after 30 minutes. We do this to all the public
    // key infrastructure for OpenVPN to initialize. This can
    // take an unknown amount of time and we want to ensure the
    // ELB does not consider the instance unhealthy during this
    // initial process. So on creation we raise the health check
    // grace period to 30 minutes to align with this timeout.
    aAsg.healthCheckGracePeriod = 30 * 60
    aAsg.cfnOptions.creationPolicy = {
      autoScalingCreationPolicy: {
        minSuccessfulInstancesPercent: 100
      },
      resourceSignal: {
        count: this.config.asgMinCapacityParam.valueAsNumber,
        timeout: "PT25M" // PKI initialization can take a while (prime generation)
      }
    }
    aAsg.cfnOptions.updatePolicy = {
      autoScalingReplacingUpdate: {
        willReplace: true
      }
    }

    // Activate the automatic management via Systems Manager
    asg.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"))

    Logs.allowLoggingForRole(asg.role)

    // cfn-signal
    asg.role.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["cloudformation:SignalResource"],
        resources: [Fn.sub("arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/${AWS::StackName}/*")]
      })
    )

    // Register the target group with the ASG
    props.nlbService.addAsgTarget(asg)

    // auto scaling options
    if (props.cpuScalingOptions) {
      this.setupCpuScaling(asg, props.cpuScalingOptions)
    }

    // health check update
    const hcgpRes = props.cfnprovider.create(this, "UpdateHealthCheck", "UpdateHealthCheck", {
      AutoScalingGroupName: asg.autoScalingGroupName
    })
    hcgpRes.addDependency(aAsg)

    return asg
  }

  /** Configure CPU based auto scaling */
  private setupCpuScaling(asg: AutoScalingGroup, opts: CpuScalingOptions): void {
    const avgCpuUtilizationMetric = this.getClusterAvgCpuUtilizationMetric(asg, opts.dashboardMeticPeriod)
    asg.scaleOnMetric("CpuScaling", {
      metric: avgCpuUtilizationMetric,
      scalingSteps: [
        { upper: opts.cpuPercentLow, change: -2 },
        { lower: opts.cpuPercentHigh, change: 2 }
      ],
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY,
      estimatedInstanceWarmup: opts.estimatedInstanceWarmup
    })
  }

  /** Cluster average CPU metric */
  private getClusterAvgCpuUtilizationMetric(asg: AutoScalingGroup, period: Duration): IMetric {
    return new Metric({
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      period: period,
      statistic: "Average",
      unit: Unit.PERCENT,
      dimensionsMap: { AutoScalingGroupName: asg.autoScalingGroupName }
    })
  }
}
