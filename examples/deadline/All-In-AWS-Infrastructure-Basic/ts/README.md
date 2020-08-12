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

- You have an EC2 Amazon Machine Image (AMI) with the Deadline Worker application to run the worker nodes in the compute tier. Make note of the AMI ID as it will be used in this guide. You can use AWS Portal AMIs which can be found in Deadline's amis.json file (see https://awsportal.s3.amazonaws.com/10.1.9/Release/amis.json). **Note:** The link to the amis.json file contains the Deadline version (10.1.9), which you should change if you are using a different version of Deadline.
- You have setup and configured the AWS CLI
- Your AWS account already has CDK bootstrapped in the desired region by running `cdk bootstrap`

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-Basic-Tiered/ts/` relative to the root of the AWS-RFDK package.

---

1. Install the dependencies of the sample app:
```
yarn install
```
2. Change the value in the `deadlineClientLinuxAmiMap` variable in `bin/config.ts` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker.
```ts
// For example, in the us-west-2 region
public readonly deadlineClientLinuxAmiMap: Record<string, string> = {
  ['us-west-2']: '<your-ami-id>',
  // ...
  };
```
3. Create a binary secret in [SecretsManager](https://aws.amazon.com/secrets-manager/) that contains your [Usage-Based Licensing](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/aws-portal/licensing-setup.html?highlight=usage%20based%20licensing) certificates in a `.zip` file:
```
aws secretsmanager create-secret --name <name> --secret-binary fileb://<path-to-zip-file>
```
4. The output from the previous step will contain the secret's ARN. Change the value of the `ublCertificatesSecretArn` variable in `bin/config.ts` to the secret's ARN:
```ts
public readonly ublCertificatesSecretArn: string = '<your-secret-arn>';
```
5. Choose your UBL limits and change the value of the `ublLicenses` variable in `bin/config.ts` accordingly:
```ts
public readonly ublLicenses: UsageBasedLicense[] = [ /* <your-ubl-limits> (e.g. UsageBasedLicense.forMaya(10)) */ ];
```
---

**Note:** The next two steps are optional. You may skip these if you do not need SSH access into your render farm.

---
6. Create an EC2 key pair to give you SSH access to the render farm:
```
aws ec2 create-key-pair --key-name <key-name>
```
7.  Change the value of the `keyPairName` variable in `bin/config.ts` to your value for `<key-name>` in the previous step: <br><br>**Note:** Save the value of the "KeyMaterial" field as a file in a secure location. This is your private key that you can use to SSH into the render farm.
```ts
public readonly keyPairName: string = '<key-name>';
```
8. Choose the type of database you would like to deploy and change the value of the `deployMongoDB` variable in `bin/config.ts` accordingly:
```ts
// true = MongoDB, false = Amazon DocumentDB
public readonly deployMongoDB: boolean = false;
```
9. If you set `deployMongoDB` to `true`, then you must accept the [SSPL license](https://www.mongodb.com/licensing/server-side-public-license) to successfully deploy MongoDB. To do so, change the value of `acceptSsplLicense` in `bin/config.ts`:
```ts
public readonly acceptSsplLicense: MongoDbSsplLicenseAcceptance = <value>;
```
10. Modify the `deadline_ver` field in the `config` block of `package.json` as desired, then stage the Docker recipes for `RenderQueue` and `UBLLicensing`:
```
yarn stage
```
11. Build the sample app:
```
yarn build
```
12. Deploy all the stacks in the sample app:
```
cdk deploy "*"
```
13. Once you are finished with the sample app, you can tear it down by running:
```
cdk destroy "*"
```