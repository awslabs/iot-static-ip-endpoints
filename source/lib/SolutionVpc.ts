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

import { createCondition, createParameter } from "./Utils"
import { NAT } from "./NAT"
import { SolutionSubnet } from "./SolutionSubnet"
import { CfnParameter, Construct, Fn, ConstructNode, ResourceEnvironment, Stack, IDependable, CfnCustomResource } from "@aws-cdk/core"
import {
  IVpc,
  CfnVPC,
  CfnSubnet,
  SubnetSelection,
  CfnInternetGateway,
  CfnRouteTable,
  CfnFlowLog,
  CfnVPCGatewayAttachment,
  CfnSubnetRouteTableAssociation,
  CfnRoute,
  IRouteTable,
  ISubnet,
  SelectedSubnets,
  EnableVpnGatewayOptions,
  VpnConnection,
  VpnConnectionOptions,
  GatewayVpcEndpointOptions,
  GatewayVpcEndpoint,
  InterfaceVpcEndpointOptions,
  InterfaceVpcEndpoint,
  FlowLog,
  FlowLogOptions
} from "@aws-cdk/aws-ec2"
import { Role, ServicePrincipal } from "@aws-cdk/aws-iam"
import { Logs } from "./Logs"
import { CustomResourcesProvider } from "./CustomResourcesProvider"

export interface SolutionVpcConfig {
  readonly vpcCidrParam: CfnParameter
  readonly useNatGatewaysParam: CfnParameter
  readonly activateFlowLogsToCloudWatchParam: CfnParameter
  readonly zone1: CfnParameter
  readonly zone2: CfnParameter
}

export class SolutionVpc extends Construct implements IVpc {
  readonly cfnVpc: CfnVPC
  readonly cfnPublicSubnets: CfnSubnet[]
  readonly cfnPrivateSubnets: CfnSubnet[]
  readonly publicSubnetsSelection: SubnetSelection
  readonly privateSubnetsSelection: SubnetSelection
  readonly nat: NAT[]
  readonly internetGateway: CfnInternetGateway
  readonly publicRouteTable: CfnRouteTable
  readonly privateRouteTables: CfnRouteTable[]
  readonly flowLog: CfnFlowLog
  readonly config: SolutionVpcConfig

  constructor(scope: Construct, id: string, cfnprovider: CustomResourcesProvider) {
    super(scope, id)

    this.config = this.setupConfig()
    this.cfnVpc = this.setupVpc()
    this.cfnPublicSubnets = this.setupPublicSubnets(cfnprovider)
    this.cfnPrivateSubnets = this.setupPrivateSubnets(cfnprovider)
    this.internetGateway = this.setupInternetGateway()
    this.publicRouteTable = this.setupPublicRouteTable()
    this.privateRouteTables = this.setupPrivateRouteTables()
    this.nat = this.setupNAT(cfnprovider)
    this.flowLog = this.setupFlowLogs()
    this.publicSubnetsSelection = this.setupPublicSubnetSelection()
    this.privateSubnetsSelection = this.setupPrivateSubnetSelection()
  }

  private setupVpc(): CfnVPC {
    return new CfnVPC(this, "SolutionVpc", {
      cidrBlock: this.config.vpcCidrParam.valueAsString,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      instanceTenancy: "default",
      tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-vpc` }]
    })
  }

  private getSubnetCIDR(cfnprovider: CustomResourcesProvider, index: number): CfnCustomResource {
    return cfnprovider.create(this, `SubnetCidr${index}IPLookup`, "IpLookup", {
      VpcCIDR: this.config.vpcCidrParam.valueAsString,
      Index: index
    })
  }

  private setupPublicSubnets(cfnprovider: CustomResourcesProvider): CfnSubnet[] {
    return [
      new CfnSubnet(this, "PublicSubnet1", {
        cidrBlock: this.getSubnetCIDR(cfnprovider, 0).ref,
        vpcId: this.cfnVpc.ref,
        availabilityZone: this.config.zone1.valueAsString,
        mapPublicIpOnLaunch: true,
        tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-public1` }]
      }),
      new CfnSubnet(this, "PublicSubnet2", {
        cidrBlock: this.getSubnetCIDR(cfnprovider, 1).ref,
        vpcId: this.cfnVpc.ref,
        availabilityZone: this.config.zone2.valueAsString,
        mapPublicIpOnLaunch: true,
        tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-public2` }]
      })
    ]
  }

  private setupPrivateSubnets(cfnprovider: CustomResourcesProvider): CfnSubnet[] {
    return [
      new CfnSubnet(this, "PrivateSubnet1", {
        cidrBlock: this.getSubnetCIDR(cfnprovider, 2).ref,
        vpcId: this.cfnVpc.ref,
        availabilityZone: this.config.zone1.valueAsString,
        mapPublicIpOnLaunch: false,
        tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-private1` }]
      }),
      new CfnSubnet(this, "PrivateSubnet2", {
        cidrBlock: this.getSubnetCIDR(cfnprovider, 3).ref,
        vpcId: this.cfnVpc.ref,
        availabilityZone: this.config.zone2.valueAsString,
        mapPublicIpOnLaunch: false,
        tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-private2` }]
      })
    ]
  }

  private setupInternetGateway(): CfnInternetGateway {
    // conditional internet gateway
    const igw = new CfnInternetGateway(this, "InternetGateway", {})

    // conditional internet gateway attachment
    const igwAttach = new CfnVPCGatewayAttachment(this, "InternetGatewayAttachment", {
      vpcId: this.cfnVpc.ref,
      internetGatewayId: igw.ref
    })

    // wait for IGW attachment...
    this.cfnPublicSubnets.forEach((subnet) => subnet.addDependsOn(igwAttach))

    return igw
  }

  private setupNAT(cfnprovider: CustomResourcesProvider): NAT[] {
    const shouldCreateNats = Fn.conditionEquals(this.config.useNatGatewaysParam.valueAsString, "Yes")

    return [
      new NAT(this, "NAT1", {
        creationExpression: shouldCreateNats,
        cfnprovider: cfnprovider,
        routeTableId: this.privateRouteTables[0].ref,
        subnetId: this.cfnPublicSubnets[0].ref
      }),
      new NAT(this, "NAT2", {
        creationExpression: shouldCreateNats,
        cfnprovider: cfnprovider,
        routeTableId: this.privateRouteTables[1].ref,
        subnetId: this.cfnPublicSubnets[1].ref
      })
    ]
  }

  private setupFlowLogs(): CfnFlowLog {
    const cond = createCondition(this, "ActivateFlowLogs", {
      expression: Fn.conditionEquals(this.config.activateFlowLogsToCloudWatchParam.valueAsString, "Yes")
    })

    const logDeliveryRole = new Role(this, "LogDeliveryRole", {
      assumedBy: new ServicePrincipal("vpc-flow-logs.amazonaws.com")
    })
    cond.applyTo(logDeliveryRole)
    Logs.allowLoggingForRole(logDeliveryRole)

    const flowLog = new CfnFlowLog(this, "VpcFlowLog", {
      trafficType: "ALL",
      resourceType: "VPC",
      resourceId: this.cfnVpc.ref,
      deliverLogsPermissionArn: logDeliveryRole.roleArn,
      logDestinationType: "cloud-watch-logs",
      logGroupName: Logs.logGroupName(this, "flowlogs"),
      maxAggregationInterval: 60
    })
    flowLog.addDependsOn(Logs.logGroup(this, "flowlogs"))
    cond.applyTo(flowLog)
    return flowLog
  }

  private setupConfig(): SolutionVpcConfig {
    const useNatGatewaysParam = createParameter(this, "UseNatGateways", {
      type: "String",
      description: "Controls if NAT Gateway's will be used",
      allowedValues: ["Yes", "No"],
      default: "No"
    })

    const activateFlowLogsToCloudWatchParam = createParameter(this, "ActivateFlowLogsToCloudWatch", {
      type: "String",
      description: "Activates sending VPC FlowLogs to CloudWatch",
      allowedValues: ["Yes", "No"],
      default: "No"
    })

    return {
      vpcCidrParam: createParameter(this, "VpcCIDR", {
        type: "String",
        default: "10.249.0.0/24",
        allowedPattern:
          "^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\/(1[6-9]|2[0-4]))$",
        description: "[Non-Updatable] The VPC CIDR, must be in the form x.x.x.x/16-24"
      }),
      useNatGatewaysParam: useNatGatewaysParam,
      activateFlowLogsToCloudWatchParam: activateFlowLogsToCloudWatchParam,
      zone1: createParameter(this, "Zone1", {
        type: "AWS::EC2::AvailabilityZone::Name",
        description: "Availability Zone 1"
      }),
      zone2: createParameter(this, "Zone2", {
        type: "AWS::EC2::AvailabilityZone::Name",
        description: "Availability Zone 2"
      })
    }
  }

  private setupPublicRouteTable(): CfnRouteTable {
    const publicRouteTable = new CfnRouteTable(this, "publicRouteTable", {
      vpcId: this.cfnVpc.ref,
      tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-public` }]
    })
    new CfnSubnetRouteTableAssociation(this, "PublicSubnet1RouteTableAssoc", {
      routeTableId: publicRouteTable.ref,
      subnetId: this.cfnPublicSubnets[0].ref
    })
    new CfnSubnetRouteTableAssociation(this, "PublicSubnet2RouteTableAssoc", {
      routeTableId: publicRouteTable.ref,
      subnetId: this.cfnPublicSubnets[1].ref
    })

    // internet routes for public
    new CfnRoute(this, "PublicInternetRoute", {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: this.internetGateway.ref
    })

    return publicRouteTable
  }

  private setupPrivateRouteTables(): CfnRouteTable[] {
    const privateRouteTable1 = new CfnRouteTable(this, "privateRouteTable1", {
      vpcId: this.cfnVpc.ref,
      tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-private1` }]
    })
    const privateRouteTable2 = new CfnRouteTable(this, "privateRouteTable2", {
      vpcId: this.cfnVpc.ref,
      tags: [{ key: "Name", value: `${Fn.ref("AWS::StackName")}-private2` }]
    })

    new CfnSubnetRouteTableAssociation(this, "PrivateSubnet1RouteTableAssoc", {
      routeTableId: privateRouteTable1.ref,
      subnetId: this.cfnPrivateSubnets[0].ref
    })
    new CfnSubnetRouteTableAssociation(this, "PrivateSubnet2RouteTableAssoc", {
      routeTableId: privateRouteTable2.ref,
      subnetId: this.cfnPrivateSubnets[1].ref
    })

    return [privateRouteTable1, privateRouteTable2]
  }

  private setupPublicSubnetSelection(): SubnetSelection {
    return {
      subnets: [
        new SolutionSubnet(this.cfnPublicSubnets[0], this.publicRouteTable),
        new SolutionSubnet(this.cfnPublicSubnets[1], this.publicRouteTable)
      ]
    }
  }

  private setupPrivateSubnetSelection(): SubnetSelection {
    return {
      subnets: [
        new SolutionSubnet(this.cfnPrivateSubnets[0], this.privateRouteTables[0]),
        new SolutionSubnet(this.cfnPrivateSubnets[1], this.privateRouteTables[1])
      ]
    }
  }

  /**
   * This returns an ISubnet construct the CDK can use which conditionally chooses what subnet
   * internet routable resources will be placed in based on if the launch parameters indicated
   * to use NAT gateways or not.
   * @param condId
   * @param pri
   * @param pub
   */
  private getConditionalInternetRoutableSubnet(condId: string, pri: ISubnet, pub: ISubnet): ISubnet {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ifNat = function (x: any, y: any): any {
      return Fn.conditionIf(condId, x, y)
    }

    return {
      subnetId: ifNat(pri.subnetId, pub.subnetId),
      availabilityZone: ifNat(pri.availabilityZone, pub.availabilityZone),
      internetConnectivityEstablished: true,
      ipv4CidrBlock: pri.ipv4CidrBlock,
      get routeTable(): IRouteTable {
        throw new Error("not implemented")
      },
      associateNetworkAcl(): void {
        throw new Error("not implemented")
      },
      get node(): ConstructNode {
        throw new Error("not implemented")
      },
      get env(): ResourceEnvironment {
        throw new Error("not implemented")
      },
      get stack(): Stack {
        throw new Error("not implemented")
      }
    }
  }

  /**
   * Helper for returning different set's of subnets based on a CloudFormation condition. In this case
   * if NAT Gateways are not used, the public subnets, otherwise the private subnets
   */
  get internetRoutableSubnets(): ISubnet[] {
    return [
      this.getConditionalInternetRoutableSubnet(this.nat[0].config.condition.logicalId, this.privateSubnets[0], this.publicSubnets[0]),
      this.getConditionalInternetRoutableSubnet(this.nat[1].config.condition.logicalId, this.privateSubnets[1], this.publicSubnets[1])
    ]
  }

  //
  // Custom IVpc Implementation
  //
  get vpcId(): string {
    return this.cfnVpc.ref
  }

  get vpcCidrBlock(): string {
    return this.cfnVpc.cidrBlock
  }

  get stack(): Stack {
    return this.cfnVpc.stack
  }

  get availabilityZones(): string[] {
    return [this.config.zone1.valueAsString, this.config.zone2.valueAsString]
  }

  selectSubnets(_selection?: SubnetSelection | undefined): SelectedSubnets {
    if (_selection?.subnets) {
      return {
        subnets: _selection.subnets,
        availabilityZones: _selection.subnets.map((subnet) => subnet.availabilityZone),
        get hasPublic(): boolean {
          // it may, but for the purpose of how the CDK uses this it does not matter
          return false
        },
        internetConnectivityEstablished: true,
        subnetIds: _selection.subnets.map((subnet) => subnet.subnetId)
      }
    }
    console.log(_selection)
    throw new Error("not implemented")
  }

  get publicSubnets(): ISubnet[] {
    return this.publicSubnetsSelection.subnets as ISubnet[]
  }

  get privateSubnets(): ISubnet[] {
    return this.privateSubnetsSelection.subnets as ISubnet[]
  }

  get isolatedSubnets(): ISubnet[] {
    throw new Error("vpc.isolatedSubnets Not Implemented")
  }

  get vpnGatewayId(): string | undefined {
    throw new Error("vpc.vpnGatewayId Not Implemented")
  }

  get internetConnectivityEstablished(): IDependable {
    throw new Error("vpc.internetConnectivityEstablished Not Implemented")
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enableVpnGateway(_options: EnableVpnGatewayOptions): void {
    throw new Error("vpc.enableVpnGateway Not Implemented")
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addVpnConnection(_id: string, _options: VpnConnectionOptions): VpnConnection {
    throw new Error("vpc.addVpnConnection Not Implemented")
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addGatewayEndpoint(_id: string, _options: GatewayVpcEndpointOptions): GatewayVpcEndpoint {
    throw new Error("vpc.addGatewayEndpoint Not Implemented")
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addInterfaceEndpoint(_id: string, _options: InterfaceVpcEndpointOptions): InterfaceVpcEndpoint {
    throw new Error("vpc.addInterfaceEndpoint Not Implemented")
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addFlowLog(_id: string, _options?: FlowLogOptions | undefined): FlowLog {
    throw new Error("vpc.addFlowLog Not Implemented")
  }

  get env(): ResourceEnvironment {
    throw new Error("vpc.env Not Implemented")
  }
}
