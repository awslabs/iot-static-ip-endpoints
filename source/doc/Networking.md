# Networking

## IP Ranges

Where x.y.z is a stack input parameter.

| Range         | Purpose                     |
| ------------- | --------------------------- |
| x.y.z.0/24    | VPC CIDR                    |
| x.y.z.0/25    | VPC Public Subnets          |
| x.y.z.0/26    | VPC Public Subnet - Zone 1  |
| x.y.z.64/26   | VPC Public Subnet - Zone 2  |
| x.y.z.128/25  | VPC Private Subnets         |
| x.y.z.128/26  | VPC Private Subnet - Zone 1 |
| x.y.z.192/26  | VPC Private Subnet - Zone 2 |
| -             | -                           |
| 198.18.0.0/16 | VPN Connected Client Range  |

## NAT

You can choose to activate NAT gateways, or have EC2 instances use public IP addresses. Use NAT gateways when your devices needs to communicate with third party endpoints from a set of known IP addresses. Additionally, you can pass in existing Elastic IP addresses to use for the NAT gateways.

## UDP vs TCP

UDP is strongly recommended. Using TCP can result in [TCP Meltdown](https://openvpn.net/faq/what-is-tcp-meltdown)

"TCP Meltdown occurs when you stack one transmission protocol on top of another, like what happens when an OpenVPN TCP tunnel is transporting TCP traffic inside it."
