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
import { CfnParameter, RemovalPolicy, Fn, CfnResource, Duration, CfnOutput, Tags } from "aws-cdk-lib/core"
import { SecurityGroup } from "aws-cdk-lib/aws-ec2"
import { Role, PolicyStatement, Effect, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import { Code } from "aws-cdk-lib/aws-lambda"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { Asset } from "aws-cdk-lib/aws-s3-assets"
import { FileSystem, LifecyclePolicy, PerformanceMode, ThroughputMode } from "aws-cdk-lib/aws-efs"
import { PYTHON_LAMBDA_RUNTIME } from "./Constants"
import { NLBEC2Service, NLBEC2ServiceProps } from "./NLBEC2Service"
import { createCondition, createParameter } from "./Utils"
import * as logs from "aws-cdk-lib/aws-logs"
import { Logs } from "./Logs"
import { Construct } from "constructs"

export interface GreengrassVpnServiceConfig {
  readonly caValidDaysParam: CfnParameter
  readonly retainEFSParam: CfnParameter
}

export interface GreengrassVpnServiceProps extends NLBEC2ServiceProps {
  readonly acceleratorIp1: string
  readonly acceleratorIp2: string
  readonly frontendPort: number
}

/**
 * @noInheritDoc
 */
export class GreengrassVpnService extends NLBEC2Service {
  /** EFS share used for OpenVPN configuration and cert storage */
  readonly fileSystem: FileSystem

  /** THe Lambda function which generates VPN client certificates and config */
  readonly createCertificateFunction: lambda.Function

  readonly revokeCertificateFunction: lambda.Function

  readonly vpnConfig: GreengrassVpnServiceConfig

  constructor(scope: Construct, id: string, props: GreengrassVpnServiceProps) {
    super(scope, id, props)

    this.vpnConfig = {
      caValidDaysParam: createParameter(this, "CAValidDays", {
        type: "String",
        allowedPattern: "\\d+",
        default: "3653",
        description: "The OpenVPN Certificate Authority valid days. Default: 10 years"
      }),
      retainEFSParam: createParameter(this, "EFSRetentionPolicy", {
        type: "String",
        allowedValues: ["Retain", "Delete"],
        default: "Retain",
        description: "Controls if the EFS share with the OpenVPN configuration is retained or deleted when the stack is deleted."
      })
    }

    // Assets
    this.setupAssets()

    // EFS Share
    this.fileSystem = this.setupFileSystem(props)

    // Configure ASG
    this.configureInstanceStartup(props)

    // Cert management Lambdas
    this.createCertificateFunction = this.setupCertificateCreationLambda()
    this.revokeCertificateFunction = this.setupCertificateRevocationLambda()

    this.setupOpenVPNLogMetricFilters()
  }

  /** Setup the EFS share used for OpenVPN configuration and certificates */
  private setupFileSystem(props: GreengrassVpnServiceProps): FileSystem {
    const sg = new SecurityGroup(this, "EFSSecurityGroup", {
      vpc: props.vpc,
      description: `${Fn.ref("AWS::StackName")} OpenVPN EFS`,
      allowAllOutbound: false
    })
    sg.addEgressRule
    Tags.of(sg).add("Name", `${Fn.ref("AWS::StackName")}-efs`)

    const efsShare = new FileSystem(this, "EFSShare", {
      vpc: props.vpc,
      vpcSubnets: { subnets: props.vpc.privateSubnets },
      encrypted: true,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      throughputMode: ThroughputMode.BURSTING,
      securityGroup: sg,
      removalPolicy: RemovalPolicy.RETAIN
    })
    efsShare.connections.allowDefaultPortFrom(this.autoScalingGroup)

    // conditional reaper
    const reaper = props.cfnprovider.create(this, "EFSReaper", "DeleteEFS", {
      FileSystemId: efsShare.fileSystemId
    })
    createCondition(this, "IsDeleteEFS", {
      expression: Fn.conditionEquals(this.vpnConfig.retainEFSParam.valueAsString, "Delete")
    }).applyTo(reaper)

    return efsShare
  }

  /** Setup assets which get downloaded by our EC2 instances on boot */
  private setupAssets() {
    // CDK asset bucket for use by user-data
    const ec2Assets = new Asset(this, "StackAssets", {
      path: path.join("assets", "ec2", "ovpn")
    })
    ec2Assets.grantRead(this.autoScalingGroup)

    // --region required to support opt-in and China regions. Currently the commented out code
    // does not work for those regions (aws s3 cp command fails). Revert to L2 construct code
    // once resolved in CDK. https://github.com/aws/aws-cdk/issues/11958

    // this.autoScalingGroup.userData.addS3DownloadCommand({
    //   bucket: ec2Assets.bucket,
    //   bucketKey: ec2Assets.s3ObjectKey,
    //   localFile: "/tmp/assets.zip"
    // })
    const s3Path = `s3://${ec2Assets.bucket.bucketName}/${ec2Assets.s3ObjectKey}`
    this.autoScalingGroup.userData.addCommands(`aws s3 cp --region ${Fn.ref("AWS::Region")} '${s3Path}' '/tmp/assets.zip'`)
  }

  private determineDnsIp(): string {
    const vpcIp = Fn.select(0, Fn.split("/", Fn.ref("VpcCIDR")))
    const octets = Fn.split(".", vpcIp)
    return Fn.join(".", [Fn.select(0, octets), Fn.select(1, octets), Fn.select(2, octets), "2"])
  }

  /** Configure what happens when the instances boot */
  private configureInstanceStartup(props: GreengrassVpnServiceProps) {
    const keepalive = new CfnParameter(this, "OpenVpnKeepAliveSeconds", {
      type: "Number",
      minValue: 1,
      maxValue: 60,
      default: 10,
      description: "OpenVPN Keepalive"
    })
    keepalive.overrideLogicalId("OpenVpnKeepAliveSeconds")

    this.autoScalingGroup.userData.addCommands(
      "set -xe",
      `export FILE_SYSTEM_ID="${this.fileSystem.fileSystemId}"`,
      `export GAIP1="${props.acceleratorIp1}"`,
      `export GAIP2="${props.acceleratorIp2}"`,
      `export NLBIP1="${props.nlbService.ip1}"`,
      `export NLBIP2="${props.nlbService.ip2}"`,
      `export CIDR="${Fn.ref("VpcCIDR")}"`,
      `export DNSIP1="${this.determineDnsIp()}"`,
      `export STACK_NAME="${Fn.ref("AWS::StackName")}"`,
      `export LOG_GROUP_NAME_MESSAGES="${Logs.logGroupName(this, "ec2/messages")}"`,
      `export LOG_GROUP_NAME_OPENVPN="${Logs.logGroupName(this, "ec2/openvpn")}"`,
      `export LOG_GROUP_NAME_YUM="${Logs.logGroupName(this, "ec2/yum")}"`,
      `export LOG_GROUP_NAME_CIO="${Logs.logGroupName(this, "ec2/cloud-init-output")}"`,
      `export AUTO_SCALING_GROUP="${(this.autoScalingGroup.node.defaultChild as CfnResource).logicalId}"`,
      `export TUNNEL_PROTOCOL=${props.nlbService.config.protocol.valueAsString}`,
      `export TUNNEL_PORT="${Fn.ref("Port")}"`,
      `export KEEPALIVE="${keepalive.valueAsString}"`,
      `export CA_DAYS=${this.vpnConfig.caValidDaysParam.valueAsString}`,
      "cd /tmp",
      "unzip assets.zip",
      "cp gen-device-cert /usr/share/gen-device-cert",
      "cp revoke-device-cert /usr/share/revoke-device-cert",
      "cp tcp-health-check /usr/share/tcp-health-check",
      "cp init-instance /usr/share/init-instance",
      "chmod +x /usr/share/gen-device-cert",
      "chmod +x /usr/share/revoke-device-cert",
      "chmod +x /usr/share/tcp-health-check",
      "chmod +x /usr/share/init-instance",
      "/usr/share/init-instance"
    )
  }

  /** Setup the Lambda which generates OpenVPN client configuration and certificates */
  private setupCertificateCreationLambda(): lambda.Function {
    const role = new Role(this, "CreateDeviceCertLambdaRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com")
    })

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:GetCommandInvocation", "autoscaling:DescribeAutoScalingGroups"],
        resources: ["*"]
        // These actions don't support IAM resources or conditions so we * them
      })
    )

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:SendCommand"],
        resources: [`arn:${Fn.ref("AWS::Partition")}:ec2:*:*:instance/*`],
        conditions: {
          StringEquals: {
            "aws:ResourceTag/aws:cloudformation:stack-name": Fn.ref("AWS::StackName")
          }
        }
      })
    )

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:SendCommand"],
        resources: [`arn:${Fn.ref("AWS::Partition")}:ssm:${Fn.ref("AWS::Region")}::document/AWS-RunShellScript`]
      })
    )

    const func = new lambda.Function(this, "CreateDeviceVpnCertificateLambda", {
      runtime: PYTHON_LAMBDA_RUNTIME,
      code: Code.fromAsset(path.join("assets", "lambda")),
      handler: "CreateDeviceVpnCertificate.handler",
      timeout: Duration.minutes(5),
      description: `${Fn.ref("AWS::StackName")} VPN client config generator`,
      role: role,
      environment: {
        REGION: Fn.ref("AWS::Region"),
        AUTO_SCALING_GROUP_NAME: this.autoScalingGroup.autoScalingGroupName
      }
    })

    Logs.initLambdaLogGroup(this, func, role)

    // Add an output for scripts to easily find the function name
    new CfnOutput(this, "CreateCertFunctionName", {
      value: func.functionName
    }).overrideLogicalId("CreateCertFunctionName")

    return func
  }

  private setupCertificateRevocationLambda(): lambda.Function {
    const role = new Role(this, "RevokeDeviceCertLambdaRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com")
    })

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:GetCommandInvocation", "autoscaling:DescribeAutoScalingGroups"],
        resources: ["*"]
        // These actions don't support IAM resources or conditions so we * them
      })
    )

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:SendCommand"],
        resources: [`arn:${Fn.ref("AWS::Partition")}:ec2:*:*:instance/*`],
        conditions: {
          StringEquals: {
            "aws:ResourceTag/aws:cloudformation:stack-name": Fn.ref("AWS::StackName")
          }
        }
      })
    )

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:SendCommand"],
        resources: [`arn:${Fn.ref("AWS::Partition")}:ssm:${Fn.ref("AWS::Region")}::document/AWS-RunShellScript`]
      })
    )

    const func = new lambda.Function(this, "RevokeDeviceVpnCertificateLambda", {
      runtime: PYTHON_LAMBDA_RUNTIME,
      code: Code.fromAsset(path.join("assets", "lambda")),
      handler: "RevokeDeviceVpnCertificate.handler",
      timeout: Duration.minutes(5),
      description: `${Fn.ref("AWS::StackName")} VPN client config revocation`,
      role: role,
      environment: {
        REGION: Fn.ref("AWS::Region"),
        AUTO_SCALING_GROUP_NAME: this.autoScalingGroup.autoScalingGroupName
      }
    })

    Logs.initLambdaLogGroup(this, func, role)

    // Add an output for scripts to easily find the function name
    new CfnOutput(this, "RevokeCertFunctionName", {
      value: func.functionName
    }).overrideLogicalId("RevokeCertFunctionName")

    return func
  }

  private setupOpenVPNLogMetricFilters(): void {
    const mf1 = new logs.CfnMetricFilter(this, "ClientConnectMetricFilter", {
      filterPattern: "Peer Connection Initiated",
      logGroupName: Logs.logGroupName(this, "ec2/openvpn"),
      metricTransformations: [
        {
          metricValue: "1",
          metricNamespace: `${Fn.ref("AWS::StackName")}/VPN`,
          metricName: "ClientConnect"
        }
      ]
    })
    mf1.addDependency(Logs.logGroup(this, "ec2/openvpn"))

    const mf2 = new logs.CfnMetricFilter(this, "ClientDisconnectMetricFilter", {
      // double quotes in the filter pattern are required here
      // eslint-disable-next-line quotes
      filterPattern: '"client-instance exiting"',
      logGroupName: Logs.logGroupName(this, "ec2/openvpn"),
      metricTransformations: [
        {
          metricValue: "1",
          metricNamespace: `${Fn.ref("AWS::StackName")}/VPN`,
          metricName: "ClientDisconnect"
        }
      ]
    })
    mf2.addDependency(Logs.logGroup(this, "ec2/openvpn"))
  }
}
