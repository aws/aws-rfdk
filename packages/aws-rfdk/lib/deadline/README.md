# AWS Thinkbox Deadline Construct Library

The `aws-rfdk/deadline` sub-module contains Deadline-specific constructs that can be used to deploy and manage a Deadline render farm in the cloud.

```ts nofixture
import * as deadline from 'aws-rfdk/deadline';
```

---

_**Note:** RFDK constructs currently support Deadline 10.1.9 and later, unless otherwise stated._

---
- [Configure Spot Event Plugin](#configure-spot-event-plugin) (supports Deadline 10.1.12 and later)
  - [Saving Spot Event Plugin Options](#saving-spot-event-plugin-options)
  - [Saving Spot Fleet Request Configurations](#saving-spot-fleet-request-configurations)
- [Deadline Secrets Management Considerations](#deadline-secrets-management-considerations)
  - [Using Dedicated Subnets for Deadline Components](#using-dedicated-subnets-for-deadline-components)
- [Render Queue](#render-queue)
  - [Docker Container Images](#render-queue-docker-container-images)
  - [Encryption](#render-queue-encryption)
  - [Health Monitoring](#render-queue-health-monitoring)
  - [Deletion Protection](#render-queue-deletion-protection)
  - [Subnet Placement](#render-queue-subnet-placement)
  - [Configuring Deadline Secrets Management](#configuring-deadline-secrets-management-on-the-render-queue)
- [Repository](#repository)
  - [Configuring Deadline Client Connections](#configuring-deadline-client-connections)
  - [Configuring Deadline Secrets Management](#configuring-deadline-secrets-management-on-the-repository)
- [Spot Event Plugin Fleet](#spot-event-plugin-fleet) (supports Deadline 10.1.12 and later)
  - [Changing Default Options](#changing-default-options)
  - [Subnet Placement](#spot-event-plugin-fleet-subnet-placement)
- [Stage](#stage)
  - [Staging Docker Recipes](#staging-docker-recipes)
- [ThinkboxDockerImages](#thinkbox-docker-images)
- [Usage Based Licensing](#usage-based-licensing-ubl)
  - [Docker Container Images](#usage-based-licensing-docker-container-images)
  - [Uploading Binary Secrets to SecretsManager](#uploading-binary-secrets-to-secretsmanager)
- [VersionQuery](#versionquery)
- [Worker Instance Fleet](#worker-instance-fleet)
  - [Health Monitoring](#worker-instance-fleet-health-monitoring)
  - [Custom Worker Instance Startup](#custom-worker-instance-startup)
  - [Subnet Placement](#worker-instance-fleet-subnet-placement)

## Configure Spot Event Plugin

![architecture diagram](../../docs/diagrams/deadline/ConfigureSpotEventPlugin.svg)

The [Spot Event Plugin](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html) can scale cloud-based EC2 Spot instances dynamically based on the queued Jobs and Tasks in the Deadline Database. It associates a Spot Fleet Request with named Deadline Worker Groups, allowing multiple Spot Fleets with different hardware and software specifications to be launched for different types of Jobs based on their Group assignment.

The `ConfigureSpotEventPlugin` construct has two main responsibilities:
- Construct a [Spot Fleet Request](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-fleet-requests.html) configuration from the list of [Spot Event Plugin Fleets](#spot-event-plugin-fleet).
- Modify and save the options of the Spot Event Plugin itself. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#event-plugin-configuration-options).

---

**Note:** This construct will configure the Spot Event Plugin, but the Spot Fleet Requests will not be created unless you:
- Submit the job with the assigned Deadline Group and Deadline Pool. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/job-submitting.html#submitting-jobs).

---

---

_**Note:** Disable 'Allow Workers to Perform House Cleaning If Pulse is not Running' in the 'Configure Repository Options' when using Spot Event Plugin. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#prerequisites)._

---

---

_**Note:** Any resources created by the Spot Event Plugin will not be deleted with `cdk destroy`. Make sure that all such resources (e.g. Spot Fleet Request or Fleet Instances) are cleaned up, before destroying the stacks. Disable the Spot Event Plugin by setting 'state' property to 'SpotEventPluginState.DISABLED' or via Deadline Monitor, ensure you shutdown all Pulse instances and then terminate any Spot Fleet Requests in the AWS EC2 Instance Console._

---

### Saving Spot Event Plugin Options

To set the Spot Event Plugin options use `configuration` property of the `ConfigureSpotEventPlugin` construct:

```ts
const vpc = new Vpc(/* ... */);
const renderQueue = new RenderQueue(stack, 'RenderQueue', /* ... */);

const spotEventPluginConfig = new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
  vpc,
  renderQueue: renderQueue,
  configuration: {
    enableResourceTracker: true,
  },
});
```

This property is optional, so if you don't provide it, the default Spot Event Plugin Options will be used.

### Saving Spot Fleet Request Configurations

Use the `spotFleets` property to construct the Spot Fleet Request Configurations from a given [Spot Event Plugin Fleet](#spot-event-plugin-fleet):

```ts
const fleet = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', /* ... */);

const spotEventPluginConfig = new ConfigureSpotEventPlugin(this, 'ConfigureSpotEventPlugin', {
  vpc,
  renderQueue: renderQueue,
  spotFleets: [
    fleet,
  ],
});
```

### Spot Event Plugin Fleet Subnet Placement

We highly recommend creating dedicated subnets for the Spot Event Plugin Fleets in your farm as it is considered best practice and is especially important if you are using
Deadline Secrets Management (see [Deadline Secrets Management Considerations](#using-dedicated-subnets-for-deadline-components)).

The following example creates a dedicated subnet group for a `SpotEventPluginFleet`:
```ts
const vpc = new Vpc(this, 'Vpc', {
  // ...
  subnetConfiguration: [
    // ...

    // Provide a subnet configuration for the SpotEventPluginFleet subnet group
    {
      name: 'SpotEventPluginFleetSubnets',
      subnetType: SubnetType.PRIVATE,
      cidrMask: 20,
    },

    // ...
  ],
  // ...
});

// ...

const fleet = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
  // ...
  vpc,

  // Select the dedicated WorkerInstanceFleet subnets to put the worker nodes in
  vpcSubnets: {
    subnetGroupName: "SpotEventPluginFleetSubnets",
  },

  // ...
});

new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
  vpc,
  spotFleets: [
    fleet,
  ],
  // ...
})
```

## Deadline Secrets Management Considerations

### Using Dedicated Subnets for Deadline Components

When Secrets Management is enabled on the `Repository` construct, RFDK will handle configuring [identity registration settings](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#automatically-registering-identities-and-adding-roles)
using the subnets of the RFDK constructs involved. Because a construct's resources can be assigned any IP address in the subnet range, RFDK must create rules that cover the entire subnet.
These identity registration settings work like an IP-address-based allowlist that give machines with IP addresses that match a rule access to secrets in Deadline, based on their [assigned role](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#assigned-roles).
The components that need identity registration settings created for them include, but are not limited to, the following:

- The Application Load Balancer of the [`RenderQueue`](#render-queue)
- Deadline workers in a [`WorkerInstanceFleet`](#worker-instance-fleet)
- Deadline workers created by the Spot Event Plugin, which are configured by the [`ConfigureSpotEventPlugin`](#configure-spot-event-plugin) construct.

RFDK creates auto-registration rules based on the Classless Inter-Domain Routing (CIDR) range of the subnet(s) that a component can be deployed into. Therefore, we highly recommend
creating a dedicated subnet for each component above for the following reasons:

1. RFDK automatically configures Deadline Secrets Management [identity registration settings](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#identity-management-registration-settings-ref-label).
These settings are configured such that the Render Queue will register identities that are created by Deadline Clients (e.g. `UsageBasedLicensing`, `WorkerInstanceFleet`, and `SpotEventPluginFleet`)
connecting via the Render Queue's Application Load Balancer (ALB). Deadline requires that you specify trusted load balancers when configuring identity registration settings by their connecting
IP address. Application Load Balancers can scale to use any available IP address in the subnets, so the full subnet IP range is used by RFDK. For this reason, we recommend dedicating subnets
exclusively for the Render Queue's ALB.
1. The size of the subnet can be limited to only what is necessary for your workload, avoiding an overly permissive auto-registration rule.

For more details on dedicated subnet placements, see:
- [Render Queue Subnet Placement](#render-queue-subnet-placement)
- [Worker Instance Fleet Subnet Placement](#worker-instance-fleet-subnet-placement)
- [Spot Event Plugin Fleet Subnet Placement](#spot-event-plugin-fleet-subnet-placement)

## Render Queue

![architecture diagram](../../docs/diagrams/deadline/RenderQueue.svg)

The `RenderQueue` is the central service of a Deadline render farm. It consists of the following components:

- **Deadline Repository** - The repository that initializes the persistent data schema used by Deadline such as job information, connected workers, rendered output files, etc.
- **Deadline Remote Connection Server (RCS)** - The central server that all Deadline applications connect to. The RCS contains the core business logic to manage the render farm.

The `RenderQueue` construct sets up the RCS and configures it to communicate with the Repository and to listen for requests using the configured protocol (HTTP or HTTPS). Docker container images are used to deploy the `RenderQueue` as a fleet of instances within an Elastic Container Service (ECS) cluster. This fleet of instances is load balanced by an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) which has built-in health monitoring functionality that can be configured through this construct.

The following example outlines how to construct a `RenderQueue`:

```ts
const version = VersionQuery.exactString(stack, 'Version', '1.2.3.4');
const images = new ThinkboxDockerImages(stack, 'Images', {
  version: version,
  // Change this to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA to accept the terms
  // of the AWS Thinkbox End User License Agreement
  userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA,
});
const repository = new Repository(stack, 'Repository', { /* ...*/});

const renderQueue = new RenderQueue(stack, 'RenderQueue', {
  vpc: vpc,
  images: images,
  version: version,
  repository: repository,
});
```

### Render Queue Docker Container Images

The `RenderQueue` currently requires only one Docker container image for the Deadline Remote Connection Server (RCS).

AWS Thinkbox provides Docker recipes and images that set these up for you. These can be accessed with the `ThinkboxDockerRecipes` and `ThinkboxDockerImages` constructs (see [Staging Docker Recipes](#staging-docker-recipes) and [Thinkbox Docker Images](#thinkbox-docker-images) respectively).

If you need to customize the Docker images of your Render Queue, it is recommended that you stage the recipes and modify them as desired. Once staged to a directory, consult the `README.md` file in the root for details on how to extend the recipes.

### Render Queue Encryption

The `RenderQueue` provides end-to-end encryption of communications and data at rest. However, it currently does not do any client validation or application authentication due to limitations with Application Load Balancers that made it necessary to disable Deadline Worker TLS certificate authentication.

---

_**Note:** Be extra careful when setting up security group rules that govern access to the `RenderQueue` and, for the machines that do have access to it, ensure you trust the Operating System as well as any software being used._

---

### Render Queue Health Monitoring

The `RenderQueue` construct leverages the built-in health monitoring functionality provided by Application Load Balancers. The health check grace period and interval can be configured by specifying the `healthCheckConfig` property of the construct. For more information, see [Application Load Balancer Health Checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html).

### Render Queue Deletion Protection

By default, the Load Balancer in the `RenderQueue` has [deletion protection](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#deletion-protection) enabled to ensure that it does not get accidentally deleted. This also means that it cannot be automatically destroyed by CDK when you destroy your stack and must be done manually (see [here](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#deletion-protection)).

You can specify deletion protection with a property in the `RenderQueue`:
```ts
const renderQueue = new RenderQueue(stack, 'RenderQueue', {
  //...
  deletionProtection: false
});
```

### Render Queue Subnet Placement

We highly recommend creating dedicated subnets for the Render Queue's [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
that will only be used by the load balancer. Using dedicated subnets for load balancers is considered best practice and is especially important if you are using
Deadline Secrets Management (see [Deadline Secrets Management Considerations](#using-dedicated-subnets-for-deadline-components)).

The following example creates a dedicated subnet group for the `RenderQueue` to use for its Application Load balancer:
```ts
const vpc = new Vpc(this, 'Vpc', {
  // ...
  subnetConfiguration: [
    // ...

    // Provide a subnet configuration for the Render Queue subnet group
    {
      name: 'RenderQueueALBSubnets',
      subnetType: SubnetType.PRIVATE,
      cidrMask: 27,
    },

    // ...
  ],
  // ...
});

// ...

const renderQueue = new RenderQueue(stack, 'RenderQueue', {
  // ...
  vpc,

  // Select the dedicated Render Queue subnets to put the ALB in
  vpcSubnetsAlb: vpc.selectSubnets({ subnetGroupName: 'RenderQueueALBSubnets' }),

  // ...
});
```

Application Load Balancers have requirements for the subnets they are deployed into, such as requiring that each subnet be from a different Availability Zone and that each subnet
have a CIDR block with at least a `/27` bitmask and at least 8 free IP addresses per subnet. For the full list of requirements, please see the
[Elastic Load Balancing documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#subnets-load-balancer).

### Configuring Deadline Secrets Management on the Render Queue

When [Deadline Secrets Management](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html) is enabled on the `Repository` construct,
the `RenderQueue` will automatically configure itself as a [Server role](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#assigned-roles) in Deadline Secrets Management.

For more information on using Deadline Secrets Management in RFDK, please see the [RFDK Developer Guide](https://docs.aws.amazon.com/rfdk/latest/guide/deadline-secrets-management-rfdk.html).

## Repository

![architecture diagram](../../docs/diagrams/deadline/Repository.svg)

The `Repository` contains the central database and file system used by Deadline. An EC2 instance is temporarily created to run the Deadline Repository installer which configures the database and file system. This construct has optional parameters for the database and file system to use, giving you the option to either provide your own resources or to have the construct create its own. Log messages emitted by the construct are forwarded to CloudWatch via a CloudWatch agent.

You can create a `Repository` like this:

```ts
const repository = new Repository(stack, 'Repository', {
  vpc: props.vpc,
  version: VersionQuery.exactString(stack, 'Version', '1.2.3.4')
});
```

### Configuring Deadline Client Connections

Deadline Clients can be configured to connect directly to the `Repository`, which will:
- Allow ingress traffic to database & file system Security Groups
- Create IAM Permissions for database & file system
- Mount the Repository file system via [UserData](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)

Deadline Clients can be configured either in ECS or EC2.

#### 1. Configure Deadline Client in ECS

An ECS Container Instance and Task Definition for deploying Deadline Client can be configured to directly connect to the `Repository`. A mapping of environment variables and ECS [`MountPoint`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecs.MountPoint.html)s are produced which can be used to configure a [`ContainerDefinition`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecs.ContainerDefinition.html) to connect to the `Repository`.

The example below demonstrates configuration of Deadline Client in ECS:
```ts
const taskDefinition = new Ec2TaskDefinition(stack, 'TaskDefinition');
const ecsConnection = repository.configureClientECS({
      containerInstances: /* ... */,
      containers: {
        taskDefinition
      },
    });

const containerDefinition = taskDefinition.addContainer('ContainerDefinition', {
  image: /* ... */,
  environment: ecsConnection.containerEnvironment
});
containerDefinition.addMountPoints(ecsConnection.readWriteMountPoint);
```
#### 2. Configure Deadline Client on EC2

An EC2 instance running Deadline Client can be configured to directly connect to the `Repository`.

The example below demonstrates configuration of Deadline Client in an EC2 instance:
```ts
const instance = new Instance(stack, 'Instance', {
  vpc,
  instanceType: new InstanceType(/* ... */),
  machineImage: MachineImage.latestAmazonLinux()
});
repository.configureClientInstance({
  host: instance,
  mountPoint: '/mnt/repository'
});
```

### Configuring Deadline Secrets Management on the Repository

When using Deadline 10.1.19 or higher, RFDK enables [Deadline Secrets Management](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html) on the `Repository` by default. To perform administrator functions for Deadline Secrets Management, credentials need to be created. You can either create your own in an AWS Secrets Manager Secret and have it imported into your RFDK app, or have RFDK generate the credentials and create the Secret for you.

When RFDK generates the administrator credentials, it sets the Secret's removal policy to `RETAIN` so that you will not lose them if you destroy the CloudFormation Stack that they are in. If you do want to delete this Secret, you will have to destroy it manually or change the `credentialsRemovalPolicy` to `DESTROY`. If you destroy the Stack that contains your Secret and its policy set to `RETAIN`, your existing Secret will be orphaned from your RFDK application and re-deploying the Stack will generate a new one. To help prevent orphaning a Secret that contains administrator credentials that are still in use, RFDK places it in the Stack that contains your database, so that their lifecycles are in sync.

If your database is imported into your RFDK app rather than being generated by it, RFDK will not generate credentials during deployment. You must create your own Secret with the credentials you'd like to use and [import it](https://docs.aws.amazon.com/cdk/api/latest/docs/aws-secretsmanager-readme.html#importing-secrets).

If you would like to use your own credentials for Deadline Secrets Management, you can do so by storing them in AWS Secrets Manager and providing them to the `Repository` construct. The Secret must be a JSON document with the following format:

```jsonc
{
  // Replace the values of these fields with your own values
  "username": "your_username",
  "password": "your_password"
}
```

---

_**Note:** The `password` should be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one symbol and one number._

---

You can then provide the ARN of the Secret containing your credentials to the `Repository` construct:

```ts
const secretsManagementCredentials = Secret.fromSecretCompleteArn(
  this,
  'DeadlineSecretsManagementCredentials',
  // Replace with your Secret ARN
  'yourSecretArn',
);

const repository = new Repository(this, 'Repository', {
  vpc,
  version,
  secretsManagementSettings: {
    enabled: true,
    credentials: secretsManagementCredentials,
  },
});
```

For further details, please consult the RFDK developer guide topic on [using Deadline Secrets Management in RFDK](https://docs.aws.amazon.com/rfdk/latest/guide/deadline-secrets-management-rfdk.html#using-deadline-secrets-management-in-rfdk). Please note that there is a specific process for [rotating your administrator credentials](https://docs.aws.amazon.com/rfdk/latest/guide/deadline-secrets-management-rfdk.html#rotating-deadline-secrets-management-administrator-credentials).

**WARNING:** Once the repository has been deployed and the administrator credentials are configured, changing the credential values in the Secret and re-deploying your RFDK app will not update the credentials in the Deadline Repository. You must first change the credentials in the Deadline Repository using the instructions linked above. Doing this incorrectly may cause the RFDK Render Queue to stop functioning. If you have done this and cannot recover the previous credentials, you will need to follow instructions for [forgotten Deadline Secrets Management administrator credentials](https://docs.aws.amazon.com/rfdk/latest/guide/deadline-secrets-management-rfdk.html#forgotten-deadline-secrets-management-administrator-credentials).


## Spot Event Plugin Fleet

![architecture diagram](../../docs/diagrams/deadline/SpotEventPluginFleet.svg)

This construct represents a Spot Fleet launched by the [Deadline's Spot Event Plugin](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html) from the [Spot Fleet Request Configuration](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#spot-fleet-request-configurations). The construct itself doesn't create a Spot Fleet Request, but creates all the required resources to be used in the Spot Fleet Request Configuration.

This construct is expected to be used as an input to the [ConfigureSpotEventPlugin](#configure-spot-event-plugin) construct. `ConfigureSpotEventPlugin` construct will generate a Spot Fleet Request Configuration from each provided `SpotEventPluginFleet` and will set these configurations to the Spot Event Plugin.

```ts
const vpc = new Vpc(/* ... */);
const renderQueue = new RenderQueue(stack, 'RenderQueue', /* ... */);

const fleet = new SpotEventPluginFleet(this, 'SpotEventPluginFleet', {
  vpc,
  renderQueue,
  deadlineGroups: [
    'group_name1',
    'group_name2',
  ],
  instanceTypes: [InstanceType.of(InstanceClass.T3, InstanceSize.LARGE)],
  workerMachineImage: new GenericLinuxImage(/* ... */),
  maxCapacity: 1,
});
```

### Changing Default Options

Here are a few examples of how you set some additional properties of the `SpotEventPluginFleet`:

#### Setting Allocation Strategy

Use `allocationStrategy` property to change the default allocation strategy of the Spot Fleet Request:

```ts
const fleet = new SpotEventPluginFleet(this, 'SpotEventPluginFleet', {
  vpc,
  renderQueue,
  deadlineGroups: [
    'group_name',
  ],
  instanceTypes: [InstanceType.of(InstanceClass.T3, InstanceSize.LARGE)],
  workerMachineImage: new GenericLinuxImage(/* ... */),
  maxCapacity: 1,
  allocationStrategy: SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
});
```

#### Adding Deadline Pools

You can add the Workers to Deadline's Pools providing a list of pools as following:

```ts
const fleet = new SpotEventPluginFleet(this, 'SpotEventPluginFleet', {
  vpc,
  renderQueue,
  deadlineGroups: [
    'group_name',
  ],
  instanceTypes: [InstanceType.of(InstanceClass.T3, InstanceSize.LARGE)],
  workerMachineImage: new GenericLinuxImage(/* ... */),
  maxCapacity: 1,
  deadlinePools: [
    'pool1',
    'pool2',
  ],
});
```

#### Setting the End Date And Time

By default, the Spot Fleet Request will be valid until you cancel it.
You can set the end date and time until the Spot Fleet request is valid using `validUntil` property:

```ts
const fleet = new SpotEventPluginFleet(this, 'SpotEventPluginFleet', {
  vpc,
  renderQueue,
  deadlineGroups: [
    'group_name',
  ],
  instanceTypes: [InstanceType.of(InstanceClass.T3, InstanceSize.LARGE)],
  workerMachineImage: new GenericLinuxImage(/* ... */),
  maxCapacity: 1,
  validUntil: Expiration.atDate(new Date(2022, 11, 17)),
});
```

## Stage

A stage is a directory that conforms to a [conventional structure](https://github.com/aws/aws-rfdk/blob/release/packages/aws-rfdk/docs/DockerImageRecipes.md#stage-directory-convention) that RFDK requires to deploy Deadline. This directory contains the Docker image recipes that RFDK uses to build Docker images.

### Staging Docker Recipes

Docker image recipes required by various constructs in Deadline (e.g. `RenderQueue`, `UsageBasedLicensing`, etc.) must be staged to a local directory that RFDK can consume. For information on what a Docker image recipe is and how it should be organized, see [Docker Image Recipes](https://github.com/aws/aws-rfdk/blob/release/packages/aws-rfdk/docs/DockerImageRecipes.md). You can either stage your own recipes or use ones provided by AWS Thinkbox via `ThinkboxDockerRecipes`.

#### Using Thinkbox Docker Recipes

---

_**Note:** The `ThinkboxDockerRecipes` class requires a [multi-stage Dockerfile](https://docs.docker.com/develop/develop-images/multistage-build/), so your version of Docker must meet the minimum version that supports multi-stage builds (version 17.05)._

_**Note:** Regardless of what language is consuming `aws-rfdk`, the Node.js package is required since the `stage-deadline` script is used by `ThinkboxDockerRecipes` when running `cdk synth` or `cdk deploy`._

---

AWS Thinkbox provides Docker recipes for use with Deadline constructs. To stage these recipes, use the `stage-deadline` script found in the `bin/` directory (e.g. `node_modules/aws-rfdk/bin/stage-deadline` for npm). The following example shows how to stage version 10.1.7.1 of Deadline:

```
npx stage-deadline \
  --deadlineInstallerURI s3://thinkbox-installers/Deadline/10.1.7.1/Linux/DeadlineClient-10.1.7.1-linux-x64-installer.run \
  --dockerRecipesURI s3://thinkbox-installers/DeadlineDocker/10.1.7.1/DeadlineDocker-10.1.7.1.tar.gz
```

This command will download the Deadline installers and Docker recipes for Deadline version 10.1.7.1 to a local subdirectory `stage`. The Deadline versions in the URIs **must** be equal. For more information, run `stage-deadline --help`.

In your typescript code, you can then create an instance of `ThinkboxDockerRecipes` from this stage directory like this:

```ts
const recipes = new ThinkboxDockerRecipes(scope, 'DockerRecipes', {
  stage: Stage.fromDirectory(/* <path-to-stage-directory> */),
});
```

#### Conveniently Run stage-deadline Script

Having to memorize the path conventions used in the URIs of the arguments to the `stage-deadline` can be cumbersome and error-prone. The following recommendations provide a more convenient way to use `stage-deadline`.

**Typescript/Javascript**

We recommend adding a `script` field in your `package.json` that runs the `stage-deadline` script with pre-populated parameters to ease the burden of having to remember the path conventions used in the thinkbox-installers S3 bucket. You can also leverage the built-in support for accessing the values of fields in `package.json` using the `${npm_package_<field1_innerfield1_...>}` syntax.

```json
{
  ...
  "config": {
    "deadline_ver": "10.1.7.1",
    "stage_path": "stage"
  },
  ...
  "scripts": {
    ...
    "stage": "stage-deadline -d s3://thinkbox-installers/Deadline/${npm_package_config_deadline_ver}/Linux/DeadlineClient-${npm_package_config_deadline_ver}-linux-x64-installer.run -c s3://thinkbox-installers/DeadlineDocker/${npm_package_config_deadline_ver}/DeadlineDocker-${npm_package_config_deadline_ver}.tar.gz -o ${npm_package_config_stage_path}",
  },
  ...
}
```

With this in place, staging the Deadline Docker recipes can be done simply by running `npm run stage`.

## Thinkbox Docker Images

Thinkbox publishes Docker images for use with RFDK to a public ECR repository. The `ThinkboxDockerImages` construct
simplifies using these images.

---

_**Note:** Deadline is licensed under the terms of the
[AWS Thinkbox End User License Agreement](https://www.awsthinkbox.com/end-user-license-agreement). Users of
`ThinkboxDockerImages` must explicitly signify their acceptance of the terms of the AWS Thinkbox EULA through
`userAwsThinkboxEulaAcceptance` property. By default, `userAwsThinkboxEulaAcceptance` is set to rejection._

---


To use it, simply create one:

```ts
// This will provide Docker container images for the latest Deadline release
const images = new ThinkboxDockerImages(scope, 'Images', {
  // Change this to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA to accept the terms
  // of the AWS Thinkbox End User License Agreement
  userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA,
});
```

If you desire a specific version of Deadline, you can supply a version with:

```ts
// Specify a version of Deadline
const version = new VersionQuery(scope, 'Version', {
  version: '10.1.12',
});

// This will provide Docker container images for the specified version of Deadline
const images = new ThinkboxDockerImages(scope, 'Images', {
  version: version,
  // Change this to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA to accept the terms
  // of the AWS Thinkbox End User License Agreement
  userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA,
});
```

To use these images, you can use the expressive methods or provide the instance directly to downstream constructs:

```ts
const renderQueue = new RenderQueue(scope, 'RenderQueue', {
  images: images,
  // ...
});
const ubl = new UsageBasedLicensing(scope, 'RenderQueue', {
  images: images,
  // ...
});

// OR

const renderQueue = new RenderQueue(scope, 'RenderQueue', {
  images: images.forRenderQueue(),
  // ...
});
const ubl = new UsageBasedLicensing(scope, 'RenderQueue', {
  images: images.forUsageBasedLicensing(),
  // ...
});
```

## Usage-Based Licensing (UBL)

![architecture diagram](../../docs/diagrams/deadline/UsageBasedLicensing.svg)

Usage-Based Licensing is an on-demand licensing model (see [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/licensing-usage-based.html)). The RFDK supports this type of licensing with the `UsageBasedLicensing` construct. This construct contains the following components:

- **Deadline License Forwarder** - Forwards licenses to Deadline Workers that are rendering jobs.

The `UsageBasedLicensing` construct sets up the License Forwarder, configures the defined license limits, and allows communication with the Render Queue. Docker container images are used to deploy the License Forwarder as a fleet of instances within an Elastic Container Service (ECS) cluster.

---

_**Note:** This construct does not currently implement the Deadline License Forwarder's Web Forwarding functionality._

_**Note:** This construct is not usable in any China region._

---

The following example outlines how to construct `UsageBasedLicensing`:

```ts
const version = new VersionQuery(stack, 'Version', '1.2.3.4');
const images = new ThinkboxDockerImages(stack, 'Images', {
  version: version,
  // Change this to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA to accept the terms
  // of the AWS Thinkbox End User License Agreement
  userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA,
});

const ubl = new UsageBasedLicensing(stack, 'UsageBasedLicensing', {
  vpc: vpc,
  renderQueue: renderQueue,
  images: images,
  licenses: [ UsageBasedLicense.forKrakatoa(/* ... */), /* ... */ ],
  certificateSecret: /* ... */, // This must be a binary secret (see below)
  memoryReservationMiB: /* ... */
});
```

### Usage-Based Licensing Docker Container Images

`UsageBasedLicensing` currently requires only one Docker container image for the Deadline License Forwarder.

AWS Thinkbox provides Docker recipes that sets these up for you. These can be accessed with the `ThinkboxDockerRecipes` and `ThinkboxDockerImages` constructs (see [Staging Docker Recipes](#staging-docker-recipes) and [Thinkbox Docker Images](#thinkbox-docker-images) respectively).

### Uploading Binary Secrets to SecretsManager

The `UsageBasedLicensing` construct expects a `.zip` file containing usage-based licenses stored as a binary secret in SecretsManager. The AWS web console does not provide a way to upload binary secrets to SecretsManager, but this can be done via [AWS CLI](https://aws.amazon.com/cli/). You can use the following command to upload a binary secret:
```
aws secretsmanager create-secret --name <secret-name> --secret-binary fileb://<path-to-file>
```

## VersionQuery

The `VersionQuery` construct encapsulates a version of Deadline and the location in Amazon S3 to retrieve the installers for that version. Deadline versions follow a `<major>.<minor>.<release>.<patch>` schema (e.g. `1.2.3.4`). Various constructs in this library use `VersionQuery` to determine the version of Deadline to work with.

You can specify a Deadline version as follows:
```ts
const version = VersionQuery.exact(stack, 'ExactVersion', {
  majorVersion: '1',
  minorVersion: '2',
  releaseVersion: '3',
  patchVersion: '4'
});
```

## Worker Instance Fleet

![architecture diagram](../../docs/diagrams/deadline/WorkerInstanceFleet.svg)

A `WorkerInstanceFleet` represents a fleet of instances that are the render nodes of your render farm. These instances are created in an [`AutoScalingGroup`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-autoscaling.AutoScalingGroup.html) with a provided AMI that should have Deadline Client installed as well as any desired render applications. Each of the instances will configure itself to connect to the specified [`RenderQueue`](#renderqueue) so that they are able to communicate with Deadline to pick up render jobs. Any logs emitted by the workers are sent to CloudWatch via a CloudWatch agent.

You can create a `WorkerInstanceFleet` like this:
```ts
const fleet = new WorkerInstanceFleet(stack, 'WorkerFleet', {
  vpc,
  renderQueue,
  workerMachineImage: /* ... */,
});
```

### Worker Instance Fleet Health Monitoring

The `WorkerInstanceFleet` uses Elastic Load Balancing (ELB) health checks with its `AutoScalingGroup` to ensure the fleet is operating as expected. ELB health checks have two components:

1. **EC2 Status Checks** - Amazon EC2 identifies any hardware or software issues on instances. If a status check fails for an instance, it will be replaced. For more information, see [here](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-system-instance-status-check.html).
2. **Load Balancer Health Checks** - Load balancers send periodic pings to instances in the `AutoScalingGroup`. If a ping to an instance fails, the instance is considered unhealthy. For more information, see [here](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-add-elb-healthcheck.html).

EC2 status checks are great for detecting lower level issues with instances and automatically replacing them. If you also want to detect any issues with Deadline on your instances, you can do this by configuring health monitoring options on the `WorkerInstanceFleet` along with a `HealthMonitor` (see [aws-rfdk](https://github.com/aws/aws-rfdk/blob/release/packages/aws-rfdk/lib/core/README.md)). The `HealthMonitor` will ensure that your `WorkerInstanceFleet` remains healthy by checking that a minimum number of hosts are healthy for a given grace period. If the fleet is found to be unhealthy, its capacity will set to 0, meaning that all instances will be terminated. This is a precaution to save on costs in the case of a misconfigured render farm.

Below is an example of setting up health monitoring in a `WorkerInstanceFleet`.
```ts
const healthMonitor = new HealthMonitor(stack, 'HealthMonitor', {
  vpc,
  elbAccountLimits: /* ... */
});

const workerFleet = new WorkerInstanceFleet(stack, 'WorkerFleet', {
  vpc,
  renderQueue: /* ... */,
  workerMachineImage: /* ... */,
  healthMonitor: healthMonitor,
  healthCheckConfig: {
    interval: Duration.minutes(5)
  }
});
```

### Custom Worker Instance Startup

You have possibility to run user data scripts at various points during the Worker configuration lifecycle.

To do this, subclass `InstanceUserDataProvider` and override desired methods:

```ts
class UserDataProvider extends InstanceUserDataProvider {
  preCloudWatchAgent(host: IHost): void {
    host.userData.addCommands('echo preCloudWatchAgent');
  }
}
const fleet = new WorkerInstanceFleet(stack, 'WorkerFleet', {
  vpc,
  renderQueue,
  workerMachineImage: /* ... */,
  userDataProvider: new UserDataProvider(stack, 'UserDataProvider'),
});
```

### Worker Instance Fleet Subnet Placement

We highly recommend creating dedicated subnets for the Worker Instance Fleets in your farm as it is considered best practice and is especially important if you are using
Deadline Secrets Management (see [Deadline Secrets Management Considerations](#using-dedicated-subnets-for-deadline-components)).

The following example creates a dedicated subnet group for a `WorkerInstanceFleet`:
```ts
const vpc = new Vpc(this, 'Vpc', {
  // ...
  subnetConfiguration: [
    // ...

    // Provide a subnet configuration for the WorkerInstanceFleet subnet group
    {
      name: 'WorkerInstanceFleetSubnets',
      subnetType: SubnetType.PRIVATE,
      cidrMask: 20,
    },

    // ...
  ],
  // ...
});

// ...

const workerInstanceFleet = new WorkerInstanceFleet(stack, 'WorkerInstanceFleet', {
  // ...
  vpc,

  // Select the dedicated WorkerInstanceFleet subnets to put the worker nodes in
  vpcSubnets: {
    subnetGroupName: "WorkerInstanceFleetSubnets",
  },

  // ...
});
```