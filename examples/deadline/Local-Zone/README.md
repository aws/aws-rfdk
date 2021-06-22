# RFDK Sample Application - Local Zones

If you have large asset files that your Worker instances need to access from your on-prem infrastructure, deploying the Workers to a geographically close AWS Local Zone can reduce the latency and increase the speed of your renders. This example will walk you through setting up your workers in a local zone while leaving the rest of the render farm in standard availability zones. Currently Amazon has launched a local zone in Los Angeles that is a part of the us-west-2 region, but they have more on the way. For more information on where local zones are available, how to get access, and what services they provide, refer to the [AWS Local Zones about page](https://aws.amazon.com/about-aws/global-infrastructure/localzones/).

Before deploying your farm, you may want to read our [Connecting to the Render Farm](https://docs.aws.amazon.com/rfdk/latest/guide/connecting-to-render-farm.html#connecting-with-site-to-site-vpn) developer guide for guidance on how to create a connection from your local network to the farm using something like a VPN. All of the techniques listed in the guide require changes to the networking tier of your RFDK app to allow the connection. After your connection is set up, you will be able to configure your network file server to be available on your workers, so any local assets you have can be transferred as needed by the jobs they perform.

---

_**Note:** This application is an illustrative example to showcase some of the capabilities of the RFDK. **It is not intended to be used for production render farms**, which should be built with more consideration of the security and operational needs of the system._

---

## Architecture

This example app assumes you're familiar with the general architecture of an RFDK render farm. If not, please refer to the [All-In-AWS-Infrastructure-Basic](../All-In-AWS-Infrastructure-Basic/README.md) example for the basics.

### Components

#### Network Tier

The network tier sets up a [VPC](https://aws.amazon.com/vpc/) that spans across all of the standard availability zones and local zones that are used, but the NAT Gateway for the VPC is only added to the standard zones, as it is not available in any local zones at this time. In this tier we override the Stack's `availabilityZones()` method, which returns the list of availability zones the Stack can use. It's by this mechanism that we control which zones the VPC will be deployed to.

#### Security Tier

This holds the root CA certificate used for signing any certificates required by the farm, such as the one used by the render queue.

#### Service Tier

The service tier contains the repository and render queue, both of which are provided the selection of standard availability zone subnets to be deployed into. The DocumentDB and EFS filesystem are not available in the local zones at this time, so the repository cannot be moved there. Since the repository needs to be in a standard availability zone, there isn't any benefit to moving the render queue to a local zone.

#### Compute Tier

This tier holds the worker fleet and its health monitor. The health monitor contains a [Network Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html) used to perform application-level health checks and the worker fleet contains an [Auto Scaling Group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/AutoScalingGroup.html). Currently, these services are available in all launched local zones, so the construct can be placed in those zones.

## Typescript

[Continue to Typescript specific documentation.](ts/README.md)

## Python

[Continue to Python specific documentation.](python/README.md)