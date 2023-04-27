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

import { CfnParameter, ICfnConditionExpression, CfnCustomResource, Fn, CfnDeletionPolicy } from "aws-cdk-lib/core"
import { CfnEIP, CfnNatGateway, CfnRoute } from "aws-cdk-lib/aws-ec2"
import { Condition, createParameter, createCondition } from "./Utils"
import { CustomResourcesProvider } from "./CustomResourcesProvider"
import { Construct } from "constructs"

export interface NATConfig {
  /** The EIP allocation ID parameter which may be specified during stack creation */
  readonly eipAllocationIdParam: CfnParameter

  /** Creation condition */
  readonly condition: Condition

  /** Allocate EIP condition */
  readonly allocateEipCondition: Condition
}

export interface NATProps {
  /**
   * A CloudFormation expression to determine if this NAT gateway will be
   * created based on the parameters the user has choosen on launch.
   */
  readonly creationExpression: ICfnConditionExpression

  /**
   * The subnetId where the NAT Gateway will be placed
   */
  readonly subnetId: string

  /**
   * The route table which should be updated with a default route to the NAT
   */
  readonly routeTableId: string

  readonly cfnprovider: CustomResourcesProvider
}

/**
 * Conditionally creates a NAT gateway in the given subnet, and defines the default
 * internet route in the given route table. Adds a CloudFormation parameter to the stack
 * allowing the user to specify an EIP allocation to use for the NAT Gateway. If the
 * allocationId is not specified an EIP will be provisioned. When an EIP is provisioned
 * an EIP reaper will be conditionally used based on the configurations of the
 * provided EIP reaper.
 *
 * We use this custom EIP reaper to avoid situations where stack deletion fails due
 * to permissions not being released on the EIP by the NAT gateway service by the
 * time CloudFormation attempts to delete them. This custom EIP reaper resource handles
 * automatic retries of deletion until successful.
 */
export class NAT extends Construct {
  readonly config: NATConfig
  readonly eip: CfnEIP
  readonly nat: CfnNatGateway
  readonly reaper: CfnCustomResource
  readonly route: CfnRoute

  constructor(scope: Construct, id: string, props: NATProps) {
    super(scope, id)
    this.config = this.setupConfig(id, props)
    this.eip = this.setupEIP(id)
    this.reaper = props.cfnprovider.createConditionalReaper(this, this.eip, this.config.allocateEipCondition)
    this.nat = this.setupNAT(id, props)
    this.route = this.setupRoute(props)

    // Apply the default condition to everything in this construct
    this.config.condition.applyTo(this)
  }

  /**
   * Sets up the CloudFormation parameters and conditions required for this construct.
   * @param id
   * @param props
   */
  private setupConfig(id: string, props: NATProps): NATConfig {
    const eipAllocationIdParam = createParameter(this, `EIP${id}`, {
      type: "String",
      description: `[Optional] Elastic IP Allocation ID - ${id}`,
      default: "",
      allowedPattern: "(eipalloc-[0-9a-z]+)?"
    })

    return {
      eipAllocationIdParam: eipAllocationIdParam,
      condition: createCondition(this, `Use${id}`, {
        expression: props.creationExpression
      }),
      allocateEipCondition: createCondition(this, `Allocate${id}IP`, {
        expression: Fn.conditionAnd(props.creationExpression, Fn.conditionEquals(eipAllocationIdParam.valueAsString, ""))
      })
    }
  }

  /**
   * Conditionally allocates an EIP for the NAT
   * @param id
   */
  private setupEIP(id: string): CfnEIP {
    const eip = new CfnEIP(this, `${id}EIP`, {
      domain: "vpc",
      tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-${id}` }]
    })

    // always retain, we'll detete with a reaper if configured
    eip.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN

    // conditionally create
    this.config.allocateEipCondition.applyTo(eip)

    return eip
  }

  /**
   * Conditional NAT Gateway
   *
   * @param id
   * @param props
   */
  private setupNAT(id: string, props: NATProps): CfnNatGateway {
    return new CfnNatGateway(this, "Gateway", {
      subnetId: props.subnetId,
      // use the allocated, or passed in EIP allocation id
      allocationId: Fn.conditionIf(
        this.config.allocateEipCondition.logicalId,
        this.eip.attrAllocationId,
        this.config.eipAllocationIdParam.valueAsString
      ) as unknown as string,
      tags: [
        { key: "Name", value: `${Fn.ref("AWS::StackName")}-${id}` },
        {
          // this creates a conditional dependency on the NAT EIP Reaper
          // we can't use Fn::If in DependsOn, so we'll do it as a Tag instead which acomplishes the same dependency
          key: "Reaper",
          value: Fn.conditionIf(this.config.allocateEipCondition.logicalId, this.reaper.ref, "n/a") as unknown as string
        }
      ]
    })
  }

  /**
   * Add the default route to the specified route table.
   *
   * @param props
   */
  private setupRoute(props: NATProps): CfnRoute {
    return new CfnRoute(this, "Route", {
      routeTableId: props.routeTableId,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: this.nat.ref
    })
  }
}
