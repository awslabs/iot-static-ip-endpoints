# IoT Static IP Endpoints Solution

The IoT Static IP Endpoints Solution provides the capability to route all traffic through a set of static IP addresses to other AWS or Internet services.

Through the deployment of an OpenVPN server cluster, IoT devices in remote location can establish a VPN tunnel, reducing the configuration of firewalls and other security devices in those locations. This solution provides the ability to automate the creation and revocation of client certificates and configurations as needed.

This repository is the same code base used to generate the AWS CloudFormation templates and assets, and uses the [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) to build and deploy the stack.

# Getting Started

To get started with the IoT Static IP Endpoints Solution, please review the solution documentation. https://aws.amazon.com/answers/iot/iot-static-ip-endpoints/

# Building and deploying from source

This build process is based on using an [AWS CloudShell](https://aws.amazon.com/cloudshell/) environment to complete the build steps. Please adjust accordingly if using a different environment to deploy from source. When not using CloudShell you will need to have Docker and npm installed for the build to complete.

#### Install Python3.8

```shell
sudo amazon-linux-extras enable python3.8
sudo yum -y install python3.8
```

#### Checkout the source

```shell
git clone https://github.com/awslabs/iot-static-ip-endpoints
```

#### Configure

```shell
cd iot-static-ip-endpoints/deployment
source ./solution_config
export AWS_REGION=us-west-2
export SOLUTION_TRADEMARKEDNAME=iot-static-ip-endpoints
export BUCKET_NAME_PREFIX=my-solution-assets-bucket
export VERSION=1.0.0
```

#### Make a bucket to store the compiled CloudFormation template and S3 assets.

```shell
aws s3 mb --region=${AWS_REGION} s3://${BUCKET_NAME_PREFIX}-${AWS_REGION}
```

#### Build

```shell
./build-s3-dist.sh ${BUCKET_NAME_PREFIX} v${VERSION}
```

#### Upload the template and assets to S3

```shell
aws s3 sync global-s3-assets/ s3://${BUCKET_NAME_PREFIX}-${AWS_REGION}/${SOLUTION_TRADEMARKEDNAME}/v${VERSION}/
aws s3 sync regional-s3-assets/ s3://${BUCKET_NAME_PREFIX}-${AWS_REGION}/${SOLUTION_TRADEMARKEDNAME}/v${VERSION}/
```

#### Deploy a new stack

```shell
aws cloudformation create-stack \
   --stack-name=MyIoTEndpoints \
   --template-url=https://${BUCKET_NAME_PREFIX}-${AWS_REGION}.s3-${AWS_REGION}.amazonaws.com/${SOLUTION_TRADEMARKEDNAME}/v${VERSION}/${SOLUTION_TRADEMARKEDNAME}.template \
   --capabilities=CAPABILITY_IAM \
   --parameters \
      ParameterKey=Zone1,ParameterValue=${AWS_REGION}a \
      ParameterKey=Zone2,ParameterValue=${AWS_REGION}b
```

# Generate a device configuration

```shell
export CLIENT_NAME=MyTestClient
export MY_STACK_NAME=MyIoTEndpoints

export LAMBDA_FUNCTION=$(aws cloudformation describe-stacks --stack-name=${MY_STACK_NAME} --query "Stacks[0].Outputs[?OutputKey == 'CreateCertFunctionName'].OutputValue" --output text)

aws lambda invoke \
  --region $AWS_REGION \
  --function-name $LAMBDA_FUNCTION \
  --cli-binary-format raw-in-base64-out \
  --payload '{"ClientName": "'"$CLIENT_NAME"'"}' \
  $CLIENT_NAME.ovpn \
  && echo -e $(cat $CLIENT_NAME.ovpn | xargs) > $CLIENT_NAME.ovpn
```

# Parameters

| Parameter                    | Description                                                               | Update Action         | Default             |
| ---------------------------- | ------------------------------------------------------------------------- | --------------------- | ------------------- |
| Zone1                        | Availability Zone 1                                                       | Do not update †       |                     |
| Zone2                        | Availability Zone 2                                                       | Do not update †       |                     |
| VpcCIDR                      | The VPC CIDR, must be in the form x.x.x.x/16-24                           | Do not update †       | 10.249.0.0/24       |
| UseNatGateways               | Controls if NAT Gateway's will be used                                    | Do not update †       | No                  |
| EIPNAT1                      | Bring your own IP - NAT1 - EIP Allocation ID                              | Do not update †       |                     |
| EIPNAT2                      | Bring your own IP - NAT2 - EIP Allocation ID                              | Do not update †       |                     |
| Port                         | The port the endpoint will listen on                                      | Do not update †       | 1194                |
| EIPNLB1                      | Bring your own IP - NLB1 - EIP Allocation ID                              | Do not update †       |                     |
| EIPNLB2                      | Bring your own IP - NLB2 - EIP Allocation ID                              | Do not update †       |                     |
| GlobalAccelerator            | Toggles if a Global Accelerator endpoint is created                       | Do not update †       | No                  |
| BYOIPGA1                     | Bring your own IP - GA 1 - IP Address                                     | Do not update †       |                     |
| BYOIPGA2                     | Bring your own IP - GA 2 - IP Address                                     | Do not update †       |                     |
| VPNProtocol                  | UDP is strongly recommended to avoid TCP Meltdown.                        | Do not update †       | UDP                 |
| AutoScalingMinCapacity       | Minimum cluster size.                                                     | No interruption       | 2                   |
| AutoScalingMaxCapacity       | Maximum cluster size.                                                     | Possible interruption | 10                  |
| InstanceAMI                  | SSM instance parameter for Amazon Linux 2                                 | Interruption          | AmazonLinux2 x86_64 |
| InstanceType                 | EC2 instance type                                                         | Interruption          | t3.small            |
| CAValidDays                  | Private CA valid days                                                     | Do not update †       | 3653                |
| OpenVpnKeepAliveSeconds      | OpenVPN Keepalive Seconds                                                 | Do not update †       | 10                  |
| PeerCidr                     | The remote CIDR range to permit ingress traffic to our endpoints          | Possible interruption | 0.0.0.0/0           |
| NotificationsEmail           | The email which notifications will be sent to. (i.e. Auto Scaling Events) | No interruption       |                     |
| LogRetentionDays             | Number of days to retain logs                                             | No interruption       | 365                 |
| ActivateFlowLogsToCloudWatch | Send VPC flow logs to CloudWatch                                          | No interruption       | Yes                 |
| EFSRetentionPolicy           | Toggles the EFS share with OpenVPN will be Retained or Deleted            | No interruption       | Retain              |
| CWLRetentionPolicy           | Toggles the CloudWatch log groups will be Retained or Deleted             | No interruption       | Retain              |

† Many parameters are used to initialize the OpenVPN cluster, and are passed to clients in the configuration files. These parameters cannot be changed once the stack has been deployed.

## Command Reference

| Command            | Purpose                       |
| ------------------ | ----------------------------- |
| npm run build      | Run Build                     |
| npm run tests      | Run Unit Tests                |
| npm run lint       | Run Linting                   |
| npm run full-build | Lint, Build, Test, and Synth  |
| npm run check      | Run Build & Synth             |
| npm run nag        | Run Build, Synth, and cfn-nag |

## A note on configuration and conditions

This solution uses the AWS CDK, however is also published as a synthesized Cloud Formation template which can be deployed without using the AWS CDK. For this reason we move all configuration and conditional logic into the resulting template using Cloud Formation conditions. This makes the resulting code slightly more awkward, however allows us to produce an easily consumable solution without requiring use of the AWS CDK.

---

Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://www.apache.org/licenses/LICENSE-2.0

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
