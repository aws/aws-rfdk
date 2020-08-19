# AWS Thinkbox Deadline Construct Library

The `aws-rfdk/deadline` sub-module contains Deadline-specific constructs that can be used to deploy and manage a Deadline render farm in the cloud.

```ts nofixture
import * as deadline from 'aws-rfdk/deadline';
```

- [Render Queue](#render-queue)
  - [Docker Container Images](#render-queue-docker-container-images)
  - [Encryption](#render-queue-encryption)
  - [Health Monitoring](#render-queue-health-monitoring)
  - [Deletion Protection](#render-queue-deletion-protection)
- [Repository](#repository)
  - [Configuring Deadline Client Connections](#configuring-deadline-client-connections)
- [Stage](#stage)
  - [Staging Docker Recipes](#staging-docker-recipes)
- [Usage Based Licensing](#usage-based-licensing-ubl)
  - [Docker Container Images](#usage-based-licensing-docker-container-images)
  - [Uploading Binary Secrets to SecretsManager](#uploading-binary-secrets-to-secretsmanager)
- [VersionQuery](#versionquery)
- [Worker Fleet](#worker-fleet)
  - [Health Monitoring](#worker-fleet-health-monitoring)

## Render Queue

The `RenderQueue` is the central service of a Deadline render farm. It consists of the following components:

- **Deadline Repository** - The repository that initializes the persistent data schema used by Deadline such as job information, connected workers, rendered output files, etc.
- **Deadline Remote Connection Server (RCS)** - The central server that all Deadline applications connect to. The RCS contains the core business logic to manage the render farm.

The `RenderQueue` construct sets up the RCS and configures it to communicate with the Repository and to listen for requests using the configured protocol (HTTP or HTTPS). Docker container images are used to deploy the `RenderQueue` as a fleet of instances within an Elastic Container Service (ECS) cluster. This fleet of instances is load balanced by an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) which has built-in health monitoring functionality that can be configured through this construct.

---

_**Note:** The number of instances running the Render Queue is currently limited to a maximum of one._

---

The following example outlines how to construct a `RenderQueue`:

```ts
const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
  stage: Stage.fromDirectory(/* ... */)
});
const version = VersionQuery.exactString(stack, 'Version', '1.2.3.4');
const repository = new Repository(stack, 'Repository', { /* ...*/});

const renderQueue = new RenderQueue(stack, 'RenderQueue', {
  vpc: vpc,
  images: recipes.renderQueueImages,
  version: version,
  repository: repository,
});
```

### Render Queue Docker Container Images

The `RenderQueue` currently requires only one Docker container image for the Deadline Remote Connection Server (RCS). An RCS image must satisfy the following criteria to be compatible with RFDK:

- Deadline Client must be installed
- The port the RCS will be listening on must be exposed
- The default command must launch the RCS

AWS Thinkbox provides Docker recipes that set these up for you. These can be accessed with the `ThinkboxDockerRecipes` class (see [Staging Docker Recipes](#staging-docker-recipes)).

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

## Repository

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

## Stage

A stage is a directory that conforms to a [conventional structure](../../docs/DockerImageRecipes.md#stage-directory-convention) that RFDK requires to deploy Deadline. This directory contains the Docker image recipes that RFDK uses to build Docker images.

### Staging Docker Recipes

Docker image recipes required by various constructs in Deadline (e.g. `RenderQueue`, `UsageBasedLicensing`, etc.) must be staged to a local directory that RFDK can consume. For information on what a Docker image recipe is and how it should be organized, see [Docker Image Recipes](../../docs/DockerImageRecipes.md). You can either stage your own recipes or use ones provided by AWS Thinkbox via `ThinkboxDockerRecipes`.

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

## Usage-Based Licensing (UBL)

Usage-Based Licensing is an on-demand licensing model (see [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/licensing-usage-based.html)). The RFDK supports this type of licensing with the `UsageBasedLicensing` construct. This construct contains the following components:

- **Deadline License Forwarder** - Forwards licenses to Deadline Workers that are rendering jobs.

The `UsageBasedLicensing` construct sets up the License Forwarder, configures the defined license limits, and allows communication with the Render Queue. Docker container images are used to deploy the License Forwarder as a fleet of instances within an Elastic Container Service (ECS) cluster.

---

_**Note:** This construct does not currently implement the Deadline License Forwarder's Web Forwarding functionality._

_**Note:** This construct is not usable in any China region._

---

The following example outlines how to construct `UsageBasedLicensing`:

```ts
const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
  stage: Stage.fromDirectory(/* ... */)
});

const ubl = new UsageBasedLicensing(stack, 'UsageBasedLicensing', {
  vpc: vpc,
  renderQueue: renderQueue,
  images: recipes.ublImages,
  licenses: [ UsageBasedLicense.forKrakatoa(/* ... */), /* ... */ ],
  certificateSecret: /* ... */, // This must be a binary secret (see below)
  memoryReservationMiB: /* ... */
});
```

### Usage-Based Licensing Docker Container Images

`UsageBasedLicensing` currently requires only one Docker container image for the Deadline License Forwarder. A License Forwarder image must satisfy the following criteria to be compatible with AWS RFDK:

- Deadline Client must be installed
- The default command must launch the License Forwarder

AWS Thinkbox provides Docker recipes that sets these up for you. These can be accessed with the `ThinkboxDockerRecipes` class (see [Staging Docker Recipes](#staging-docker-recipes)).

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

## Worker Fleet

A `WorkerInstanceFleet` represents a fleet of instances that are the render nodes of your render farm. These instances are created in an [`AutoScalingGroup`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-autoscaling.AutoScalingGroup.html) with a provided AMI that should have Deadline Client installed as well as any desired render applications. Each of the instances will configure itself to connect to the specified [`RenderQueue`](#renderqueue) so that they are able to communicate with Deadline to pick up render jobs. Any logs emitted by the workers are sent to CloudWatch via a CloudWatch agent.

You can create a `WorkerInstanceFleet` like this:
```ts
const fleet = new WorkerInstanceFleet(stack, 'WorkerFleet', {
  vpc,
  renderQueue,
  workerMachineImage: /* ... */,
});
```

### Worker Fleet Health Monitoring

The `WorkerInstanceFleet` uses Elastic Load Balancing (ELB) health checks with its `AutoScalingGroup` to ensure the fleet is operating as expected. ELB health checks have two components:

1. **EC2 Status Checks** - Amazon EC2 identifies any hardware or software issues on instances. If a status check fails for an instance, it will be replaced. For more information, see [here](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-system-instance-status-check.html).
2. **Load Balancer Health Checks** - Load balancers send periodic pings to instances in the `AutoScalingGroup`. If a ping to an instance fails, the instance is considered unhealthy. For more information, see [here](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-add-elb-healthcheck.html).

EC2 status checks are great for detecting lower level issues with instances and automatically replacing them. If you also want to detect any issues with Deadline on your instances, you can do this by setting up a health monitoring options on the `WorkerInstanceFleet` along with a `HealthMonitor` (see [`aws-rfdk`](../core/README.md)). The `HealthMonitor` will ensure that your `WorkerInstanceFleet` remains healthy by checking that a minimum number of hosts are healthy for a given grace period. If the fleet is found to be unhealthy, its capacity will set to 0, meaning that all instances will be terminated. This is a precaution to save on costs in the case of a misconfigured render farm.

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
