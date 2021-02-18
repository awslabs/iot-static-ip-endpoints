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

import { CfnParameter, Construct, Fn, CfnOutput, Tags, CfnCustomResource } from "@aws-cdk/core"
import { Accelerator, Listener, EndpointGroup, CfnAccelerator, ConnectionProtocol, EndpointConfiguration } from "@aws-cdk/aws-globalaccelerator"
import { Condition, createCondition, createParameter } from "./Utils"
import { CustomResourcesProvider } from "./CustomResourcesProvider"

export interface NLBGlobalAcceleratorConfig {
  // CFN Parameters
  readonly useGlobalAcceleratorParam: CfnParameter
  readonly ipAddress1Param: CfnParameter
  readonly ipAddress2Param: CfnParameter
  // CFN Conditions
  readonly useGlobalAcceleratorCondition: Condition
  readonly allocateGaIp1Condition: Condition
  readonly allocateGaIp2Condition: Condition
}

export interface NLBGlobalAcceleratorProps {
  readonly port: number
  readonly nlbArn: string
  readonly cfnprovider: CustomResourcesProvider
  readonly protocol: string
}

/**
 * Creates a Global Accelerator endpoint targeting an NLB service NLB
 *
 * @noInheritDoc
 */
export class NLBGlobalAccelerator extends Construct {
  readonly accelerator?: Accelerator
  readonly listener?: Listener
  readonly endpointGroup?: EndpointGroup
  readonly acceleratorIp1?: CfnCustomResource
  readonly acceleratorIp2?: CfnCustomResource
  readonly config: NLBGlobalAcceleratorConfig
  readonly props: NLBGlobalAcceleratorProps

  constructor(scope: Construct, id: string, props: NLBGlobalAcceleratorProps) {
    super(scope, id)
    this.props = props

    this.config = this.setupConfig()

    // Global Accelerator Setup
    this.accelerator = new Accelerator(this, "GA", {})
    const aAccelerator = this.accelerator.node.defaultChild as CfnAccelerator

    aAccelerator.ipAddresses = (Fn.conditionIf(this.config.allocateGaIp1Condition.logicalId, Fn.ref("AWS::NoValue"), [
      (Fn.conditionIf(
        this.config.allocateGaIp1Condition.logicalId,
        Fn.ref("AWS::NoValue"),
        this.config.ipAddress1Param.valueAsString
      ) as unknown) as string,
      (Fn.conditionIf(
        this.config.allocateGaIp2Condition.logicalId,
        Fn.ref("AWS::NoValue"),
        this.config.ipAddress2Param.valueAsString
      ) as unknown) as string
    ]) as unknown) as string[]

    Tags.of(this.accelerator).add("StackName", Fn.ref("AWS::StackName"))

    this.listener = new Listener(this, "GAListener", {
      accelerator: this.accelerator,
      portRanges: [{ fromPort: props.port, toPort: props.port }],
      protocol: props.protocol as ConnectionProtocol
    })

    const eg = (this.endpointGroup = new EndpointGroup(this, "GAGroup", {
      listener: this.listener
    }))

    new EndpointConfiguration(this, "EndpointEIP1", {
      endpointId: props.nlbArn,
      endpointGroup: eg
    })

    // GA IP outputs
    this.acceleratorIp1 = this.createAcceleratorIpGetter(this.accelerator.acceleratorArn, 0, props)
    this.acceleratorIp2 = this.createAcceleratorIpGetter(this.accelerator.acceleratorArn, 1, props)
    const gaIp1Out = new CfnOutput(this, `${id}GaIp1`, { value: this.ip1 })
    gaIp1Out.overrideLogicalId(`${id}GaIp1`)
    const gaIp2Out = new CfnOutput(this, `${id}GaIp2`, { value: this.ip2 })
    gaIp2Out.overrideLogicalId(`${id}GaIp2`)

    this.config.useGlobalAcceleratorCondition.applyTo(this)
  }

  private setupConfig(): NLBGlobalAcceleratorConfig {
    const useGaParam = createParameter(this, "GlobalAccelerator", {
      type: "String",
      allowedValues: ["Yes", "No"],
      default: "No",
      description: "[Non-Updatable] Toggles if a AWS Global Accelerator endpoint is created"
    })

    const ip1 = createParameter(this, "BYOIPGA1", {
      type: "String",
      description: "[Optional] Bring your own IP Address - AWS Global Accelerator 1",
      default: "",
      allowedPattern: "^((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]).){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))?$"
    })
    const ip2 = createParameter(this, "BYOIPGA2", {
      type: "String",
      description: "[Optional] Bring your own IP Address - AWS Global Accelerator 2",
      default: "",
      allowedPattern: "^((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]).){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))?$"
    })

    return {
      useGlobalAcceleratorParam: useGaParam,
      ipAddress1Param: ip1,
      ipAddress2Param: ip2,
      useGlobalAcceleratorCondition: createCondition(this, "GlobalAcceleratorActivated", {
        expression: Fn.conditionEquals(useGaParam.valueAsString, "Yes")
      }),
      allocateGaIp1Condition: createCondition(this, "CreateGAIP1", {
        expression: Fn.conditionAnd(Fn.conditionEquals(useGaParam.valueAsString, "Yes"), Fn.conditionEquals(ip1.valueAsString, ""))
      }),
      allocateGaIp2Condition: createCondition(this, "CreateGAIP2", {
        expression: Fn.conditionAnd(Fn.conditionEquals(useGaParam.valueAsString, "Yes"), Fn.conditionEquals(ip2.valueAsString, ""))
      })
    }
  }

  private createAcceleratorIpGetter(acceleratorArn: string, index: number, props: NLBGlobalAcceleratorProps): CfnCustomResource {
    return props.cfnprovider.create(this, `GA${index}IPLookup`, "IpLookup", {
      AcceleratorArn: acceleratorArn,
      IpIndex: index
    })
  }

  /** Helper to get the Global Accelerator first IP address  */
  get ip1(): string {
    return (Fn.conditionIf(
      this.config.allocateGaIp1Condition.logicalId,
      this.acceleratorIp1?.ref,
      this.config.ipAddress1Param.valueAsString
    ) as unknown) as string
  }

  /** Helper to get the Global Accelerator second IP address  */
  get ip2(): string {
    return (Fn.conditionIf(
      this.config.allocateGaIp2Condition.logicalId,
      this.acceleratorIp2?.ref,
      this.config.ipAddress2Param.valueAsString
    ) as unknown) as string
  }
}
