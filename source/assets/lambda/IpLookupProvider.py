#
# Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License"). You may not use
# this file except in compliance with the License. A copy of the License is located at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# or in the "license" file accompanying this file. This file is distributed on an "AS IS"
# BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations under the License.
#

import boto3
import logging as log
from awsutil import get_client
import ipaddress

ga = get_client("globalaccelerator")
ec2 = get_client("ec2")
r53r = get_client("route53resolver")


def handler(event, context):
    request_type = event["RequestType"]
    if request_type == "Create":
        return on_create(event)
    if request_type == "Update":
        return on_update(event)
    if request_type == "Delete":
        return on_delete(event)
    raise Exception("Invalid request type: %s" % request_type)


def on_delete(event):
    return {"PhysicalResourceId": ""}


def on_update(event):
    return on_create(event)


def on_create(event):
    props = event["ResourceProperties"]

    if "AcceleratorArn" in props:
        acceleratorArn = props["AcceleratorArn"]
        ipIndex = int(props["IpIndex"])
        acc = ga.describe_accelerator(AcceleratorArn=acceleratorArn)["Accelerator"]
        ip = acc["IpSets"][0]["IpAddresses"][ipIndex]

    elif "NetworkInterfaceId" in props:
        networkInterdaceId = props["NetworkInterfaceId"]
        inf = ec2.describe_network_interfaces(NetworkInterfaceIds=[networkInterdaceId])
        ip = inf["NetworkInterfaces"][0]["PrivateIpAddress"]

    elif "EndpointId" in props:
        endpointId = props["EndpointId"]
        ipIndex = int(props["IpIndex"])
        res = r53r.list_resolver_endpoint_ip_addresses(ResolverEndpointId=endpointId)
        ip = res["IpAddresses"][ipIndex]["Ip"]

    elif "VpcCIDR" in props and "Index" in props:
        vpcCidr = props["VpcCIDR"]
        index = int(props["Index"])
        vpcMask = vpcCidr.split("/")[1]
        subnetMask = int(vpcMask) + 2  # i.e. /24 to 4x /26's
        subnets = list(ipaddress.ip_network(vpcCidr).subnets(new_prefix=subnetMask))
        ip = str(subnets[index])

    else:
        raise Exception(
            "Unknown IP to get, no AcceleratorArn, NetworkInterfaceId, EndpointId or VpcCIDR/Index arguments"
        )

    return {"PhysicalResourceId": ip}