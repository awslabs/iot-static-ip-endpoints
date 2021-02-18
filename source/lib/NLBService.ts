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

import { CfnParameter, Construct, CfnOutput, Fn, CfnResource, CfnDeletionPolicy } from "@aws-cdk/core"
import { CfnSubnet, CfnEIP } from "@aws-cdk/aws-ec2"
import { CfnLoadBalancer, CfnTargetGroup, CfnListener, TargetType, Protocol } from "@aws-cdk/aws-elasticloadbalancingv2"
import { AutoScalingGroup } from "@aws-cdk/aws-autoscaling"
import { Condition, createCondition, createParameter } from "./Utils"
import { CustomResourcesProvider } from "./CustomResourcesProvider"

export interface NLBServiceConfig {
  // CFN Parameters
  readonly nlb1EipAllocationIdParam: CfnParameter
  readonly nlb2EipAllocationIdParam: CfnParameter
  readonly protocol: CfnParameter

  // CFN Conditions
  readonly allocateEipForNlb1Condition: Condition
  readonly allocateEipForNlb2Condition: Condition
  readonly isUdp: Condition
}

export interface NLBServiceProps {
  /** The VPC which is used */
  readonly vpcId: string

  /** The subnets where the NLB will be placed */
  readonly subnets: CfnSubnet[]

  /** The NLB target type - note, this may be a Token */
  readonly targetType: string

  /** The backend port used */
  readonly backendPort: number

  /** The frontend port */
  readonly frontendPort: number

  readonly cfnprovider: CustomResourcesProvider
}

// Internal interface for passing around NLB and EIP's
interface NLBServiceLoadBalancerConfig {
  nlb: CfnLoadBalancer
  nlbEips: CfnEIP[]
}

/**
 * CDK construct for building up a Network Load Balancer into
 * a VPC with a frontend and backend port for the specified
 * target type.
 *
 * @noInheritDoc
 */
export class NLBService extends Construct {
  /** Network Load Balancer (NLB) */
  readonly nlb: CfnLoadBalancer

  /** Elastic IPs of the NLB */
  readonly nlbEips: CfnEIP[]

  /** The NLB target group */
  readonly targetGroup: CfnTargetGroup

  /** The NLB listener */
  readonly listener: CfnListener

  /** The NLB target type */
  readonly targetType: string

  readonly config: NLBServiceConfig

  constructor(scope: Construct, id: string, props: NLBServiceProps) {
    super(scope, id)

    this.config = this.setupConfig()

    // note the target type, instance methods will use this
    this.targetType = props.targetType

    // NLB Setup
    const nlbResult = this.setupLoadBalancer(props)
    this.nlb = nlbResult.nlb
    this.nlbEips = nlbResult.nlbEips
    this.targetGroup = this.setupTargetGroup(props)
    this.listener = this.setupListener(props)

    // NLB EIP Outputs
    new CfnOutput(this, `${id}NlbEip1`, { value: this.ip1 }).overrideLogicalId(`${id}NlbEip1`)
    new CfnOutput(this, `${id}NlbEip2`, { value: this.ip2 }).overrideLogicalId(`${id}NlbEip2`)
  }

  private setupConfig(): NLBServiceConfig {
    const nlb1Eip = createParameter(this, "EIPNLB1", {
      type: "String",
      description: "[Optional] BYOIP - NLB 1",
      default: "",
      allowedPattern: "(eipalloc-[0-9a-z]+)?"
    })

    const nlb2Eip = createParameter(this, "EIPNLB2", {
      type: "String",
      description: "[Optional] BYOIP - NLB 2",
      default: "",
      allowedPattern: "(eipalloc-[0-9a-z]+)?"
    })

    const protocol = createParameter(this, "VPNProtocol", {
      type: "String",
      description: "UDP is strongly recommended to avoid TCP Meltdown.",
      allowedValues: ["UDP", "TCP"],
      default: "UDP"
    })

    return {
      nlb1EipAllocationIdParam: nlb1Eip,
      nlb2EipAllocationIdParam: nlb2Eip,
      protocol: protocol,
      allocateEipForNlb1Condition: createCondition(this, "AllocateNlb1Eip", {
        expression: Fn.conditionEquals(nlb1Eip.valueAsString, "")
      }),
      allocateEipForNlb2Condition: createCondition(this, "AllocateNlb2Eip", {
        expression: Fn.conditionEquals(nlb2Eip.valueAsString, "")
      }),
      isUdp: createCondition(this, "IsUdp", {
        expression: Fn.conditionEquals(protocol.valueAsString, "UDP")
      })
    }
  }

  /** Helper to get the NLB EIP in Zone 1 */
  get ip1(): string {
    return (Fn.conditionIf(
      this.config.allocateEipForNlb1Condition.logicalId,
      this.nlbEips[0].ref,
      this.config.nlb1EipAllocationIdParam.valueAsString
    ) as unknown) as string
  }

  /** Helper to get the NLB EIP in Zone 2 */
  get ip2(): string {
    return (Fn.conditionIf(
      this.config.allocateEipForNlb2Condition.logicalId,
      this.nlbEips[1].ref,
      this.config.nlb2EipAllocationIdParam.valueAsString
    ) as unknown) as string
  }

  /** Helper for adding an conditional IP target */
  addIpTarget(ip: string, port: number, conditionId?: string): void {
    if (!this.targetGroup.targets) {
      this.targetGroup.targets = []
    }
    const arr = this.targetGroup.targets as unknown[]
    if (conditionId) {
      arr.push(Fn.conditionIf(conditionId, { Id: ip, Port: port }, Fn.ref("AWS::NoValue")))
    } else {
      arr.push({ Id: ip, Port: port })
    }
  }

  /** Helper for adding an conditional Auto Scaling (instance) target */
  addAsgTarget(asg: AutoScalingGroup): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aAsg = asg as any
    aAsg.targetGroupArns.push(this.targetGroup.ref)
  }

  /** Setup the NLB */
  private setupLoadBalancer(props: NLBServiceProps): NLBServiceLoadBalancerConfig {
    // allocate EIP's for the NLB
    const reapers: CfnResource[] = []

    const eip1 = new CfnEIP(this, "Eip1", {
      domain: "vpc",
      tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-nlb1` }]
    })
    // always retain, we'll delete (if necessary) elsewhere
    eip1.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN
    reapers.push(props.cfnprovider.createConditionalReaper(this, eip1, this.config.allocateEipForNlb1Condition))
    this.config.allocateEipForNlb1Condition.applyTo(eip1)

    const eip2 = new CfnEIP(this, "Eip2", {
      domain: "vpc",
      tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-nlb2` }]
    })
    // always retain, we'll delete (if necessary) elsewhere
    eip2.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN
    reapers.push(props.cfnprovider.createConditionalReaper(this, eip2, this.config.allocateEipForNlb2Condition))
    this.config.allocateEipForNlb2Condition.applyTo(eip2)

    const eips = [eip1, eip2]

    const nlb = new CfnLoadBalancer(this, "LoadBalancer", {
      scheme: "internet-facing",
      type: "network",
      subnetMappings: props.subnets.map((subnet, index) => ({
        subnetId: subnet.ref,
        allocationId: (Fn.conditionIf(
          index == 0 ? this.config.allocateEipForNlb1Condition.logicalId : this.config.allocateEipForNlb2Condition.logicalId,
          eips[index].attrAllocationId,
          index == 0 ? this.config.nlb1EipAllocationIdParam.valueAsString : this.config.nlb2EipAllocationIdParam.valueAsString
        ) as unknown) as string
      })),
      loadBalancerAttributes: [{ key: "load_balancing.cross_zone.enabled", value: "true" }],
      tags: [
        { key: "Name", value: Fn.ref("AWS::StackName") },
        // conditional reaper dependencies
        { key: "Reaper1", value: (Fn.conditionIf(this.config.allocateEipForNlb1Condition.logicalId, reapers[0].ref, "n/a") as unknown) as string },
        { key: "Reaper2", value: (Fn.conditionIf(this.config.allocateEipForNlb2Condition.logicalId, reapers[1].ref, "n/a") as unknown) as string }
      ]
    })

    return { nlbEips: eips, nlb: nlb }
  }

  /** Setup the target grorup */
  private setupTargetGroup(props: NLBServiceProps): CfnTargetGroup {
    return new CfnTargetGroup(this, "TargetGroup", {
      port: props.backendPort,
      protocol: this.config.protocol.valueAsString as Protocol,
      targetType: props.targetType as TargetType,
      vpcId: props.vpcId,
      healthCheckEnabled: true,
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
      healthCheckIntervalSeconds: 10,
      healthCheckTimeoutSeconds: 10,
      healthCheckProtocol: "TCP",
      healthCheckPort: this.healthCheckPort,
      targetGroupAttributes: [{ key: "deregistration_delay.timeout_seconds", value: "5" }]
    })
  }

  get healthCheckPort(): string {
    return (Fn.conditionIf(this.config.isUdp.logicalId, 1195, 1194) as unknown) as string
  }

  /** Setup the listener */
  private setupListener(props: NLBServiceProps): CfnListener {
    return new CfnListener(this, "Listener", {
      loadBalancerArn: this.nlb.ref,
      port: props.frontendPort,
      protocol: this.config.protocol.valueAsString as Protocol,
      defaultActions: [{ type: "forward", targetGroupArn: this.targetGroup.ref }]
    })
  }
}
