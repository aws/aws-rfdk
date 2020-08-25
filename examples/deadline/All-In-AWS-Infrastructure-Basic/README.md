# RFDK Sample Application - Deadline

This is a sample RFDK application that deploys the basic infrastructure for a Deadline render farm. This application is structured in tiers, each representing a CloudFormation stack. The tiers are:

1. **Network Tier** - Foundational networking required by all components.
1. **Security Tier** - Contains resources that keep the render farm secure (e.g. certificates).
1. **Storage Tier** - Persistent storage (e.g. database, file system).
1. **Service Tier** - Business logic (e.g. central server, licensing).
1. **Compute Tier** - Compute power to render jobs.

Each deployment tier is deployed as a separate CloudFormation Stack, and is dependent upon the ones before it. 
The main benefit of this deployment structure is that the later tiers can be brought down (i.e. stacks destroyed)
to save costs while keeping the earlier tiers. For instance, we could destroy the Service & Compute tiers to 
reduce the cost to maintain the farm when we know it will be idle while retaining all of our data;
we could re-deploy the Service & Compute tiers at a later date to restore service to exactly the same state we left it in.

---

_**Note:** This application is an illustrative example to showcase some of the capabilities of the RFDK. **It is not intended to be used for production render farms**, which should be built with more consideration of the security and operational needs of the system._

---

## Architecture

This sample application deploys a basic Deadline Render farm using Usage-Based Licensing. Below is a diagram of the architecture.

```
+------------------------------------------------------------------------------------------------------------------------+
|                                                                                                                        |
| Private Hosted Zone                                                                                                    |
|                                                                                                                        |
| +--------------------------------------------------------------------------------------------------------------------+ |
| |                                                                                                                    | |
| |  VPC                                                                                                               | |
| |                                                                                                                    | |
| | +------------------------------+              +-----------------------+            +-----------------------------+ | |
| | |                              |              |                       |            |                             | | |
| | |         Repository           |              |     Render Queue      |            |    Usage-Based Licensing    | | |
| | |                              +-------------->                       +------------>                             | | |
| | | +----------+ +-------------+ |   Backend    | +-------------------+ |  Deadline  | +-------------------------+ | | |
| | | |          | |             | |     API      | |                   | |    API     | |                         | | | |
| | | | Database | | File System | <--------------+ |     RCS Fleet     | <------------+ | License Forwarder Fleet | | | |
| | | |          | |             | |              | |                   | |            | |                         | | | |
| | | +----------+ +-----+-------+ |              | |     +-------+     | |            | |        +-------+        | | | |
| | |                    |         |              | |     |  ALB  |     | |            | |        |  ALB  |        | | | |
| | +------------------------------+              | |     +---+---+     | |            | |        +---+---+        | | | |
| |                      |                        | |         |         | |            | |            |            | | | |
| |                      |                        | |   +-----------+   | |            | |      +-----------+      | | | |
| |                      |                        | |   |     |     |   | |            | |      |     |     |      | | | |
| |                      |Mounts                  | |   v     v     v   | |            | |      v     v     v      | | | |
| |                      |onto                    | | +-++         ++-+ | |            | |    +-++         ++-+    | | | |
| |                      |                        | | |  |   ...   |  | | |            | |    |  |   ...   |  |    | | | |
| |                      |                        | | +--+         +--+ | |            | |    +--+         +--+    | | | |
| |                      |                   +----> |                   | |            | |                         | | | |
| |                      |                   |    | +-------------------+ |            | +-------------------------+ | | |
| |          +-----------v--+                |    |                       |            |                             | | |
| |          |              +----------------+    +-----^--------+--------+            +------^--------+-------------+ | |
| |          | Bastion Host |  Can connect to           |        |                            |        |               | |
| |          |              |                           |        |                            |        |               | |
| |          +------------+-+                           |Deadline|                            |        |               | |
| |                       |                             |  API   |                            |        |               | |
| |                       |                             |        |                            |  Get   |               | |
| |                       |                             |        |                            |Licenses|               | |
| |                       |                           +-+--------v--------+                   |        |               | |
| |                       |                           |                   |                   |        |               | |
| |                       |                           |   Worker Fleet    |                   |        |               | |
| |                       |  Can connect to           |                   |                   |        |               | |
| |                       +--------------------------->     +-------+     +-------------------+        |               | |
| |                                                   |     |  ALB  |     |                            |               | |
| |                                                   |     +---+---+     <----------------------------+               | |
| |                                                   |         |         |                                            | |
| |                                                   |   +-----------+   |              +----------------+            | |
| |                                                   |   |     |     |   |              |                |            | |
| |                                                   |   v     v     v   |              | Health Monitor |            | |
| |                                                   | +-++         ++-+ |              |                |            | |
| |                                                   | |  |   ...   |  | |    Monitors  |   +-------+    |            | |
| |                                                   | +--+         +--+ <--------------+   |  NLB  |    |            | |
| |                                                   |                   |              |   +-------+    |            | |
| |                                                   +-------------------+              |                |            | |
| |                                                                                      +----------------+            | |
| |                                                                                                                    | |
| +--------------------------------------------------------------------------------------------------------------------+ |
|                                                                                                                        |
+------------------------------------------------------------------------------------------------------------------------+

```

### Components

All components in the render farm live within a [VPC](https://aws.amazon.com/vpc/), which is within a [Private Hosted Zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-private.html).

#### Repository

The Repository component contains the database and file system that store persistent data used by Deadline. These resources are initialized by the Deadline Repository installer. The database can either be [MongoDB](https://www.mongodb.com/) or [Amazon DocumentDB](https://aws.amazon.com/documentdb/).

#### Render Queue

The Render Queue component contains the fleet of [Deadline Remote Connection Server](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/remote-connection-server.html) instances behind an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). This acts as the central service for Deadline applications and is the only component that interacts with the Repository.

#### Usage-Based Licensing

The Usage-Based Licensing component contains the fleet of [Deadline License Forwarder](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/license-forwarder.html) instances behind an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). This provides [usage-based licenses](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/licensing-usage-based.html) to Deadline Workers that are rendering jobs and communicates with the Render Queue to store/retrieve licensing information.

#### Worker Fleet

The Worker Fleet component contains the fleet of [Deadline Worker](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/worker.html) instances behind an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). These are the compute power of the render farm that perform render jobs. They communicate with the Render Queue to carry out render jobs and with the Usage-Based Licensing component to obtain any licenses required for the jobs.

#### Health Monitor

The Health Monitor component contains a [Network Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html) used to perform application-level health checks on the Worker Fleet instances. These health checks ensure that the Deadline Worker application is operating properly. In the event that the Worker Fleet is deemed unhealthy, the Health Monitor will scale down the Worker Fleet to 0 to prevent unnecessary cost accrual.

#### Bastion Host

The Bastion Host is a `BastionHostLinux` construct that allows you to connect to the Render Queue and Worker Fleet if you would like to take a look at the state of these components. It is not an essential component to the render farm, so it can be omitted without side effects, if desired. To connect to it, please refer to [Bastion Hosts CDK documentation](https://docs.aws.amazon.com/cdk/api/latest/docs/aws-ec2-readme.html#bastion-hosts).

## Best Practices

### VPC Flow Logs
We recommend enabling VPC Flow Logs for networks containing sensitive information. For example, in this application, we have enabled flow logs on the VPC created in the Network Tier. These logs capture information about the IP traffic going in and out of your VPC, which can be useful to detect malicious activity. For more information, see [VPC Flow Logs documentation](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html).

### VPC Network ACLs

Network ACLs act as a firewall for controlling traffic in or out of your VPC subnets. We recommend creating custom network ACLs on your VPC to restrict traffic so that only necessary traffic is allowed. The default network ACLs that are created with a new VPC allow all inbound and outbound traffic, whereas custom network ACLs deny all inbound and outbound traffic by default, unless rules are added that explicitly allow traffic. This is a security best-practice to help defend against malicious actions against your render farm. For more information, see [Network ACLs documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html).

## Prerequisites

- The WorkerInstanceFleet construct requires an [Amazon Machine Image (AMI)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AMIs.html) with the Deadline Worker application installed. The code below has an invalid AMI ID your-ami-id which must be replaced with your desired AMI ID. Conveniently, AWS Thinkbox creates public AWS Portal AMIs you can use for this. Follow the steps in the Deadline guide for [finding AWS Portal AMIs](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/aws-custom-ami.html#finding-which-ami-to-start-from) (these steps instruct you to specifically search for "Deadline Worker Base" images, but you can use any Linux-based Deadline Worker image for this tutorial) and copy over your desired AMI ID.
- You have setup and configured the AWS CLI
- Your AWS account already has CDK bootstrapped in the desired region by running `cdk bootstrap`
- You must have NodeJS installed on your system
- You must have Docker installed on your system
- You must have Python 3.7+ installed on your system (Python app only)

## Typescript

[Continue to Typescript specific documentation.](ts/README.md)

## Python

[Continue to Python specific documentation.](python/README.md)