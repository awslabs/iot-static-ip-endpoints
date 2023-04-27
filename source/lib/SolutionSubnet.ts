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

import { Stack, ResourceEnvironment, RemovalPolicy } from "aws-cdk-lib/core"
import { ISubnet, CfnSubnet, CfnRouteTable, IRouteTable, INetworkAcl } from "aws-cdk-lib/aws-ec2"
import { Node } from "constructs"

export class SolutionSubnet implements ISubnet {
  private readonly cfnSubnet: CfnSubnet
  private readonly cfnRouteTable: CfnRouteTable
  readonly ipv4CidrBlock: string

  constructor(cfnSubnet: CfnSubnet, cfnRouteTable: CfnRouteTable) {
    this.cfnSubnet = cfnSubnet
    this.ipv4CidrBlock = cfnSubnet.cidrBlock!
    this.cfnRouteTable = cfnRouteTable
  }

  applyRemovalPolicy(policy: RemovalPolicy): void {
    this.cfnSubnet.applyRemovalPolicy(policy)
  }

  get subnetId(): string {
    return this.cfnSubnet.ref
  }

  get availabilityZone(): string {
    return this.cfnSubnet.availabilityZone || "wont-happen"
  }

  get routeTable(): IRouteTable {
    return {
      routeTableId: this.cfnRouteTable.ref
    }
  }

  get node(): Node {
    return this.cfnSubnet.node
  }

  get stack(): Stack {
    return this.cfnSubnet.stack
  }

  get internetConnectivityEstablished(): boolean {
    return true
  }

  get env(): ResourceEnvironment {
    throw new Error("Not implemented")
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  associateNetworkAcl(_id: string, _acl: INetworkAcl): void {
    throw new Error("Not implemented")
  }
}
