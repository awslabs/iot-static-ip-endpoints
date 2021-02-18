# EC2 Instance Configuration

## SSH Access

Terminal access is only available through AWS Systems Manager Session Manager. Instances do not contain any SSH
key pairs, nor have SSH access allowed through security groups.

To connect, in the AWS console right click the instance and select "Connect". Choose the "Session Manager" tab
and then select "Connect"

## Installed Software

| Package          | Purpose                              |
| ---------------- | ------------------------------------ |
| awslogs          | AWS CloudWatch Logs Agent            |
| amazon-efs-utils | Amazon EFS Utils                     |
| nfs-utils        | NFS Utils                            |
| openvpn          | OpenVPN                              |
| easy-rsa         | EasyRSA - Certificate generation     |
| socat            | TCP listener for health checks       |
| yum-cron         | Scheduled automatic security updates |

## EC2 Assets

| Script                                    | Target Location               | Purpose                                  |
| ----------------------------------------- | ----------------------------- | ---------------------------------------- |
| source/assets/ec2/ovpn/init-instance      | /usr/share/init-instance      | Instance initialization                  |
| source/assets/ec2/ovpn/tcp-health-check   | /usr/share/tcp-health-check   | TCP Health Check when VPN is in UDP mode |
| source/assets/ec2/ovpn/gen-device-cert    | /usr/share/gen-device-cert    | Generate device cert/key/configuration   |
| source/assets/ec2/ovpn/revoke-device-cert | /usr/share/revoke-device-cert | Revoke a device cert/configuration       |

## Logging

| Log                            | CloudWatch Logs Location                         | Notes                     |
| ------------------------------ | ------------------------------------------------ | ------------------------- |
| /var/log/cloud-init-output.log | {STACK_NAME}/ec2/cloud-init-output/{INSTANCE_ID} | Server initialization log |
| /var/log/messages              | {STACK_NAME}/ec2/messages/{INSTANCE_ID}          | System messages log       |
| /var/log/openvpn.log           | {STACK_NAME}/ec2/openvpn/{INSTANCE_ID}           | OpenVPN log               |
| /var/log/yum.log               | {STACK_NAME}/ec2/yum/{INSTANCE_ID}               | yum updates log           |
