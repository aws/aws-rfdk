# Core Construct Library

The `aws-rfdk/core` directory contains general constructs that can be used to deploy and manage a render farm in the cloud.

```ts
import * as core from 'aws-rfdk';
```

- [CloudWatchAgent](#cloudwatchagent)
  * [Generating Configuration String](#generating-configuration-string)
- [ExportingLogGroup](#exportingloggroup)
- [HealthMonitor](#healthmonitor)
  * [Registering A Fleet](#registering-a-fleet)
  * [Registering Multiple Fleets](#registering-multiple-fleets)
  * [Sending Encrypted Messages](#sending-encrypted-messages)
  * [Elastic Load Balancing Limits](#elastic-load-balancing-limits)
  * [Deletion Protection](#deletion-protection)
- [MongoDbInstaller](#mongodbinstaller)
  * [Installing MongoDB On An Instance](#installing-mongodb-on-an-instance)
- [MongoDbInstance](#mongodbinstance)
  * [Changing Instance Type](#changing-instance-type)
  * [Connecting To A MongoDB Instance](#connecting-to-a-mongodb-instance)
  * [Database Admin User](#database-admin-user)
  * [Assigning A Security Group](#assigning-a-security-group)
  * [Associating An IAM Role](#associating-an-iam-role)
  * [Storing MongoDB Data](#storing-mongodb-data)
  * [Streaming Logs](#streaming-logs)
- [MongoDbPostInstallSetup](#mongodbpostinstallsetup)
  * [Password-Authenticated Users](#password-authenticated-users)
  * [X509-Authenticated Users](#x509-authenticated-users)
  * [Creating Users](#creating-users)
- [ScriptAsset](#scriptasset)
  * [RFDK Script Directory Structure Convention](#rfdk-script-directory-structure-convention)
- [StaticPrivateIpServer](#staticprivateipserver)
  * [Connect To An Instance](#connect-to-an-instance)
- [X509 Certificates](#x509-certificates)
  * [X509CertificatePem](#x509certificatepem)
    + [Self-Signed Certificate](#self-signed-certificate)
    + [Chain Of Trust](#chain-of-trust)
    + [Encryption](#encryption)
    + [Granting Permissions](#granting-permissions)
  * [X509CertificatePkcs12](#x509certificatepkcs12)
  * [ImportedAcmCertificate](#importedacmcertificate)
- [Connecting To An Instance](#connecting-to-an-instance)
  * [Session Manager](#session-manager)
  * [SSH Access](#ssh-access)
  * [Amazon EC2 Instance Connect](#amazon-ec2-instance-connect)


## CloudWatchAgent

The [CloudWatch Agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html) is a software component that can be used to stream logs and metrics from a server to CloudWatch. To simplify the installation and configuration of the CloudWatch Agent, you can create an instance of `CloudWatchAgent` construct provided by RFDK:

```ts
const instance = new Instance(stack, 'Instance', /* ... */);
const cloudWatchConfig: string = /* ... */;

const cloudWatchAgent = new CloudWatchAgent(stack, 'CloudWatchAgent', {
  cloudWatchConfig,
  instance,
});
```

Here, `cloudWatchConfig` is a CloudWatch Agent configuration string in json format. It is recommended to use [CloudWatchConfigBuilder](#generating-configuration-string) to create this configuration string. You can also learn how to [Manually Create or Edit the CloudWatch Agent Configuration File](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html) .

### Generating Configuration String

Generating CloudWatch configuration with `CloudWatchConfigBuilder` is very simple:

```ts
const configBuilder = new CloudWatchConfigBuilder();
const cloudWatchConfig = configBuilder.generateCloudWatchConfiguration();
```

By default, the maximum amount of time that logs remain in the memory buffer before being sent to the CloudWatch service is *60 seconds*. If you would prefer to change this interval, specify a different value during construction:

```ts
const configBuilder = new CloudWatchConfigBuilder(Duration.minutes(2));
```

_**Note:** No matter the setting you provide during construction, if the size of the logs in the buffer reaches 1 MB, the logs are immediately sent to the server._

---

To add the file which needs to be streamed to cloud watch logs use `addLogsCollectList()` method:

```ts
configBuilder.addLogsCollectList('logGroupName',
  'logStreamPrefix',
  '/var/log/logFile.log');
```

---

_**Note:** `CloudWatchAgent` by default will validate the `CloudWatch Agent` installer. If your deployments are failing due to a validation failure, but you have verified that the failure is benign, then you can set a context variable ```SKIP_CWAGENT_VALIDATION_CTX_VAR = 'RFDK_SKIP_CWAGENT_VALIDATION'``` to skip the validation step. Read more how to [set and get a value from a context variable](https://docs.aws.amazon.com/cdk/latest/guide/get_context_var.html)._

---

_**Note:** The `CloudWatch Agent` installer is downloaded via the Amazon S3 API, thus, this construct can be used on instances that have no access to the internet as long as the [VPC contains an VPC Gateway Endpoint for S3](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-endpoints-s3.html)._

---

## ExportingLogGroup

`ExportingLogGroup` is an extension of a standard CloudWatch log group with a feature to automatically export logs older than a specified threshold to an S3 bucket for cost savings.

In order to create an instance of `ExportingLogGroup` you need to provide a name of the log group and a name of the existing S3 bucket that will store archived logs:

```ts
const exportingLogGroup = new ExportingLogGroup(stack, 'ExportingLogGroup', {
  bucketName: 'bucketName',
  logGroupName: 'logGroupName',
});
```

---

_**Note:** If the LogGroup with a given name doesn't exist, then it will be created._

---

_**Note:** The bucket must have read/write privileges enabled for *logs.amazonaws.com*. Please check how to [set permissions on an Amazon S3 bucket](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/S3ExportTasksConsole.html#S3PermissionsConsole) if you want to learn more._

---

By default, the `ExportingLogGroup` will keep logs in the CloudWatch for *3 days*. If you would prefer to change this period, specify a different value for the `retention` property, as follows:

```ts
const exportingLogGroup = new ExportingLogGroup(stack, 'ExportingLogGroup', {
  bucketName: 'bucketName',
  logGroupName: 'logGroupName',
  retention: RetentionDays.ONE_WEEK,
});
```

## HealthMonitor

![architecture diagram](../../docs/diagrams/core/HealthMonitor.svg)

In order to monitor a heartbeat reported by each render node and to automatically reboot instances that are failing, which will help to avoid extra costs, you can use `HealthMonitor` instance:

```ts
const vpc = new Vpc(/* ... */);
const healthMonitor = new HealthMonitor(stack, 'HealthMonitor', {
    vpc,
});
```

`HealthMonitor` also monitors the health of your whole fleet, and when the amount of instances that fail their health checks exceeds the fleet termination threshold (35% by default), it cancels that fleet and prevents new fleet launches. You can adjust this threshold to fit your needs when [registering a fleet](#registering-a-fleet).

---

_**Note:** Although, using `HealthMonitor` adds up additional costs for monitoring, it is highly recommended using this construct to help avoid / minimize runaway costs for compute instances._

---

### Registering A Fleet

Use the `HealthMonitor.registerFleet()` method to register a fleet for monitoring:

```ts
const fleet: IMonitorableFleet  = new /* ... */;
healthMonitor.registerFleet(fleet, {});
```

The default monitoring settings can be overridden when registering a fleet:

```
  healthMonitor.registerFleet(fleet, {
    interval: Duration.minutes(5),
    healthyFleetThresholdPercent: 80,
    port: 7171,
  });
```

### Registering Multiple Fleets

You can register multiple fleets to the same `HealthMonitor`:

```ts
const fleetOne: IMonitorableFleet = new /* ... */;
const fleetTwo: IMonitorableFleet = new /* ... */;

healthMonitor.registerFleet(fleetOne, {});
healthMonitor.registerFleet(fleetTwo, {});
```

### Sending Encrypted Messages

The `HealthMonitor` deploys multiple resources that communicate together. By default, these communications are encrypted using a key managed by the `HealthMonitor`. If you would prefer to use your own encryption key, specify a different value for the `encryptionKey` property, as follows:

```ts
const healthMonitor = new HealthMonitor(stack, 'HealthMonitor', {
  vpc,
  encryptionKey: Key.fromKeyArn(stack, 'ImportedKey', 'arn:aws:kms:...'),
});
```

---

_**Note:** When suspending the fleet, `HealthMonitor` sets the `maxCapacity` property of the auto-scaling group to 0. This should be reset manually after fixing the issue._

---

### Elastic Load Balancing Limits

The fleets are attached to a load balancer and health checks are made against an HTTP endpoint being served by the fleet instances ( see [Health checks for your target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html) ). There are certain AWS service limits for each load balancer, hence an array of load balancers and listeners is created internally based on the size of the registered fleets.

By default, the load balancers array is created with default limits for AWS account. Since these limits can differ (can be increased by requesting AWS support), RFDK provides an option to modify them using `elbAccountLimits` property.

The object you assign to `elbAccountLimits` should be the output of the [describeAccountLimits API](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#describeAccountLimits-property). We provide a `Limit` interface which consists of the name of the limit and its value. You can find the whole list of possible names at [API_Limit documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_Limit.html).

Here is an examples of how to use ELB limits with `HealthMonitor`:

```ts
const healthMonitor = new HealthMonitor(stack, 'HealthMonitor', {
  vpc,
  elbAccountLimits: [
  {
    name: 'listeners-per-application-load-balancer',
    max: 1,
  },
  {
    name: 'target-groups-per-action-on-application-load-balancer',
    max: 1,
  }],
});
```

### Deletion Protection

To prevent the load balancer from being deleted accidentally, `HealthMonitor` enables deletion protection for the load balancer. Hence, you will first need to disable deletion protection using AWS Console or CLI before deleting the stack ( see [deletion protection](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#deletion-protection) to learn how to do it ).

In order to disable deletion protection, you can use `deletionProtection` property:

```ts
const healthMonitor = new HealthMonitor(stack, 'HealthMonitor', {
  deletionProtection: false,
  /* ... */
});
```

## MongoDbInstaller

To install the specified version of MongoDB during an initial launch of the instance you can use `MongoDbInstaller`.

MongoDB is installed from the official sources using the system package manger (yum). It installs the mongodb-org metapackage which will install the following packages:
 * mongodb-org-mongos
 * mongodb-org-server
 * mongodb-org-shell
 * mongodb-org-tools

Successful installation of MongoDB with this class requires:
1) Explicit acceptance of the terms of the SSPL license, under which MongoDB is distributed
2) The instance on which the installation is being performed is in a subnet that can access the official MongoDB sites: https://repo.mongodb.org/ and https://www.mongodb.org

```ts
const installer = new MongoDbInstaller(stack, {
  version: MongoDbVersion.COMMUNITY_3_6,
  userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL,
};
```

---

_**Note:** MongoDB Community edition is licensed under the terms of the SSPL (see: https://www.mongodb.com/licensing/server-side-public-license ). Users of `MongoDbInstaller` must explicitly signify their acceptance of the terms of the SSPL through `userSsplAcceptance` property. By default, `userSsplAcceptance` is set to rejection._

---

### Installing MongoDB On An Instance

To install MongoDb on the instance you should use `installOnLinuxInstance()` method:

```ts
const instance = new Instance(stack, 'Instance', {
  instanceType: new InstanceType('t3.small'),
  machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_}),
  /* ... */
});

const installer = new MongoDbInstaller(stack, {
  version: MongoDbVersion.COMMUNITY_3_6,
  userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
});

installer.installOnLinuxInstance(instance);
```

---

_**Note:** At this time, this method only supports installation onto instances that are running an operating system that is compatible with x86-64 RedHat 7. This includes Amazon Linux 2, RedHat 7, and CentOS 7._

---

## MongoDbInstance

RFDK provides `MongoDbInstance` construct to simplify creation of instances hosting MongoDB. 

When hosting instance is launched, it will use [MongoDbInstaller](#mongodbinstaller) to automatically install the specified version of MongoDB, from the official Mongo Inc. sources. You have to provide settings for the MongoDB application that will be running on this instance:

```ts
const dnsZone = new PrivateHostedZone(/* ... */);
const serverCertificate = new X509CertificatePem(/* ... */);

const mongoDb = {
  version: MongoDbVersion.COMMUNITY_3_6,
  hostname : 'hostname',
  userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL,
  dnsZone,
  serverCertificate,
},
```

---

_**Note:** MongoDB Community edition is licensed under the terms of the SSPL (see: https://www.mongodb.com/licensing/server-side-public-license ). Users of `MongoDbInstance` must explicitly signify their acceptance of the terms of the SSPL through `userSsplAcceptance` property. By default, `userSsplAcceptance` is set to rejection._

---

You also need to specify a VPC in which to create a MongoDb instance. When you have everything ready, you can instantiate `MongoDbInstance`, as follows: 

```ts
vpc = new Vpc(/* ... */);
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  mongoDb,
  vpc,
});
```

### Changing Instance Type

It is possible to change an instance type on which MongoDB is running. To learn more on instance types please visit https://aws.amazon.com/ec2/instance-types. By default, Amazon EC2 R5 Large instance will is used. You can change it through `instanceType` property:

```ts
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  mongoDb,
  vpc,
  instanceType: new InstanceType('c5.xlarge'),
});
```

### Connecting To A MongoDB Instance

See [Connecting To An Instance](#connecting-to-an-instance) for more details.

### Database Admin User

If you don't provide the Secret that contains credentials for the *admin user*, then `MongoDbInstance` will create the admin user for you and store the credentials in the `adminUser` property of `MongoDbInstance`. The admin user will have a database role `[ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ]`.

If you provide your own Secret containing the credentials for the admin user, then the contents of the Secret must be a JSON document with the keys "username" and "password":

```
{
    "username": <admin user name>,
    "password": <admin user password>,
}
```

---

_**Note** If this user already exists in the database, then its credentials will not be modified in any way to match the credentials in the Secret._

---

Here is an example how to provide the Secret with admin user credentials:

```ts
const myAdminUser = Secret.fromSecretAttributes(/* ... */);

const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  mongoDb: {
    adminUser: myAdminUser,
    /* ... */
  },
  /* ... */
});
```

### Assigning A Security Group

A new security group is created for MongoDB instance if not provided. To assign an existing security group to the instance, use `securityGroup` property:

```ts
const existingSecurityGroup = new SecurityGroup(/* ... */);
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  securityGroup: existingSecurityGroup,
  /* ... */
};
```

### Associating An IAM Role

A new IAM role associated with the instance profile that is assigned to this instance is automatically created, by default. It can be accessed via the `role` property. You can associate an existing role during instantiation. The role must be assumable by the service principal `ec2.amazonaws.com`:

```ts
const existingRole = new Role(stack, 'Role', {
  assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
  roleName: 'ExistingRole',
});

const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  role: existingRole,
  /* ... */
}
```

### Storing MongoDB Data

A new encrypted Amazon Elastic Block Storage (EBS) Volume is created to store the MongoDB database data, by default.

You can also provide an existing EBS Volume during instantiation of `MongoDbInstance`:

```ts
const existingVolume = new Volume(/* ... */);
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  mongoDb: {
    mongoDataVolume: {
      volume: existingVolume,
    },
  /* ... */
  },
  /* ... */
}
```

---

_**Note** The Volume must not be partitioned. The volume will be mounted to /var/lib/mongo on this instance, and all files on it will be changed to be owned by the mongod user on the instance._

---

If you don't provide your own EBS Volume, your default service-owned KMS key is used to encrypt a newly created Volume. You can also provide a custom KMS key to encrypt the Volume's data:

```ts
const customEncryptionKey = new Key(/* ... */);
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  mongoDb: {
    mongoDataVolume: {
      volumeProps: {
        encryptionKey: customEncryptionKey,
      },
    },
    /* ... */
  },
  /* ... */
};
```

The size of the newly created EBS Volume is 20 GiB, by default. You can set your custom size in GibiBytes, as follows:

```ts
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  mongoDb: {
    mongoDataVolume: {
      volumeProps: {
        size: Size.gibibytes(50),
      },
    },
    /* ... */
  },
  /* ... */
};
```

### Streaming Logs

`MongoDbInstance` will stream the cloud-init log and the MongoDB application log to a new CloudWatch log group. The LogGroup will be created with the default values for all the properties, so no export to S3 will be performed. You just need to provide the name of the S3 bucket in order to enable exporting logs from CloudWatch to that bucket:

```ts
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  logGroupProps: {
    bucketName: 'bucketName',
  },
  /* ... */
};
```

It is also possible to modify the `logGroupPrefix` property, which is defaulted to `/renderfarm/` and also the default retention period of 3 days:

```ts
const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
  logGroupProps: {
    retention: RetentionDays.ONE_WEEK,
    logGroupPrefix: 'custom-prefix/',
  },
  /* ... */
};
```

## MongoDbPostInstallSetup

You can perform post-installation setup on a MongoDB database using `MongoDbPostInstallSetup`.

Presently, the only post-installation action that this construct can perform is creating users. There are two types of users that it can create:
1. *Password-authenticated users* - these users will be created within the 'admin' database.
2. *X.509-authenticated users* - these users will be created within the '$external' database.

### Password-Authenticated Users
Credentials and specifications for *password-authenticated users* should be stored in Secrets. Each Secret must be a Json document with the following structure:

```
{
    "username": <username of the user>,
    "password": <password of the user>,
    "roles": <a list of roles that the user is being given>
}
```

For examples of the roles list, see the MongoDB user creation documentation, like [Add Users](https://docs.mongodb.com/manual/tutorial/create-users/) tutorial.

We will later create these these 2 *password-authenticated users* in the admin database:

```ts
const pwUser1 = Secret.fromSecretArn(/* ... */);
const pwUser2 = Secret.fromSecretArn(/* ... */);
```

### X509-Authenticated Users

To create an *X.509-authenticated user* you need to provide a `certificate` of the user used for authentication and a JSON-encoded string with the `roles` this user should be given:

```ts
const x509User1 = {
  certificate: Secret.fromSecretArn(/* ... */),
  roles: JSON.stringify([ { role: 'readWrite', db: 'testdb1' } ]),
};
const x509User2 = {
  certificate: Secret.fromSecretArn(/* ... */),
  roles: JSON.stringify([ { role: 'readWrite', db: 'testdb2' } ]),
};
```

The `certificate` must be a secret containing the plaintext string contents of the certificate in PEM format.

---

_**Note:** MongoDB **requires** that this username differ from the MongoDB server certificate in at least one of: Organization (O), Organizational Unit (OU), or Domain Component (DC). See: https://docs.mongodb.com/manual/tutorial/configure-x509-client-authentication/._

---

_**Note:** The client certificate must be signed by the same Certificate Authority (CA) as the server certificate that is being used by the MongoDB application._

---

### Creating Users

Internally, `MongoDbPostInstallSetup` will create an AWS Lambda function that is granted the ability to connect to the given MongoDB database using its administrator credentials and execute commands against it. This lambda is run automatically when you deploy or update the stack containing this construct. Logs for all AWS Lambdas are automatically recorded in Amazon CloudWatch. You need to provide a VPC in which the network endpoint for this lambda function will be created.

You also need to provide the `MongoDbInstance` in order to create an instance of `MongoDbPostInstallSetup`. Having everything prepared, you can add both types of users to the database, as follows:

```ts
const vpc = new Vpc(/* ... */);
const mongoDb = new MongoDbInstance(/* ... */);

const postInstallSetup = new MongoDbPostInstallSetup(stack, 'MongoPostInstall', {
  vpc,
  mongoDb,
  users: {
    passwordAuthUsers: [ pwUser1, pwUser2 ],
    x509AuthUsers: [ x509User1, x509User2 ],
  },
});
```

## ScriptAsset

It is often useful to run commands on your instance at launch. This is done using scripts that are executed through instance [user data](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html).

RFDK includes a `ScriptAsset` class that generalizes the concept of the script (bash or powershell) that executes on an instance. `ScriptAsset` is a wrapper around the [CDK's S3 Asset construct](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-s3-assets.Asset.html):

```ts
const scriptAsset = new ScriptAsset(stack, 'ScriptAsset', {
  path: path.join(__dirname, '../scripts/bash/scriptName.sh'),
});
```

In order to execute the script on the instance use method `executeOn()`:

```ts
const instance = new Instance(stack, 'Instance', /* ... */);
scriptAsset.executeOn({ host: instance });
```

If you need to pass arguments to your script, use `args` property, as follows:

```ts
scriptAsset.executeOn({
  host: instance,
  args: ['arg1'],
});
```

---

_**Note:** The arguments are not escaped in any way and you will have to escape them for the target platform's userdata language (bash/powershell) if needed._

---

### RFDK Script Directory Structure Convention

In RFDK, by convention, scripts are kept in a `scripts` directory in each `aws-rfdk/*` sub-module. The scripts are organized based on target shell (and implicitly target operating system). The directory structure looks like:

```
scripts/
  bash/
    script-one.sh
    script-two.sh
  powershell/
    script-one.ps1
    script-one.ps1
```

For such structure, you can use `fromPathConvention()` function to create a `ScriptAsset` instance that automatically selects the appropriate script based on operating system:

```ts
const scriptAsset = ScriptAsset.fromPathConvention(stack, 'ScriptAsset', {
  osType: instance.osType,
  baseName: 'scriptName',
  rootDir: path.join(
    __dirname,
    '..',
    'scripts',
  ),
});
```

This will select the script `../scripts/bash/scriptName.sh` if the `osType` is Linux, and `../scripts/powershell/scriptName.ps1` if the `osType` is Windows.

## StaticPrivateIpServer

If you need to create an instance with an unchanging private IP address that will automatically recover from termination (e.g., a license server, that must always be reachable by the same IP address), then you can use an instance of `StaticPrivateIpServer`:

```ts
const vpc = new Vpc(/* ... */);
const server = new StaticPrivateIpServer(stack, 'Instance', {
  vpc,
  instanceType: new InstanceType('t3.small'),
  machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_}),
});
```

There are many useful settings that you can change when creating a new `StaticPrivateIpServer`. For example, by using `resourceSignalTimeout` property, you can set the time to wait for the instance to signal successful deployment during the initial deployment, or update, of your stack:

```ts
const server = new StaticPrivateIpServer(stack, 'Instance', {
  resourceSignalTimeout: Duration.hours(12),
  /* ... */,
});
```

_**Note:** The deployment does not require a success signal from the instance, by default._

### Connect To An Instance

See [Connecting To An Instance](#connecting-to-an-instance) for more details.

## X509 Certificates

RFDK provides the following constructs for working with X509 certificates: `X509CertificatePem`, `X509CertificatePkcs12`, and `ImportedAcmCertificate`.

### X509CertificatePem

![architecture diagram](../../docs/diagrams/core/X509CertificatePem.svg)

`X509CertificatePem` provides a mechanism for generating X.509 certificates. This construct will create the following resources as secrets in Secret Manager:
1. An X509 certificate in PEM format
2. A private key in PEM format
3. A passphrase in plain-text
4. A chain of trust in PEM format (if the [signingCertificate](#chain-of-trust) is passed)

#### Self-Signed Certificate

In order to generate a sef-signed certificate you need to provide an identification for a self-signed CA ( see [rfc1779](https://tools.ietf.org/html/rfc1779) or [the X.520 specification](https://www.itu.int/itu-t/recommendations/rec.aspx?rec=X.520) ) using the `subject` property:

```ts
const cert = new X509CertificatePem(stack, 'X509CertificatePem', {
  subject: {
    cn: 'identityName',
    o: 'organizationName',
    ou: 'organizationUnit',
},
});
```

#### Chain Of Trust

You can provide another `X509CertificatePem` certificate with `signingCertificate` property to sign the generated certificate forming a chain of trust:

```ts
const signingCertificate = new X509CertificatePem(/* ... */);

const cert = new X509CertificatePem(stack, 'Cert', {
  subject: {
    cn: 'identityName',
},
  signingCertificate,
});
```

#### Encryption

`X509CertificatePem` will use the default AWS KMS Customer Master Key (CMK) for the account (named aws/secretsmanager) to secure the cert, key, and passphrase.

---
_**Note:** If an AWS KMS CMK with that name doesn't yet exist, then Secrets Manager creates it for you automatically the first time it needs to encrypt a version's SecretString or SecretBinary fields._

---

You can also provide your own KMS key using `encryptionKey` property if needed:

```ts
const encryptionKey = new Key(/* ... */);

const cert = new X509CertificatePem(stack, 'Cert', {
  encryptionKey,
  /* ... */
});
```

#### Granting Permissions

To grant read permissions for the certificate use `grantCertRead()` method:

```ts
const instance = new Instance(/* ... */);
cert.grantCertRead(instance.grantPrincipal);
```

And to grant read permissions for the certificate, key, and passphrase use `grantFullRead()` method instead:

```ts
const instance = new Instance(/* ... */);
cert.grantFullRead(instance.grantPrincipal);
```

### X509CertificatePkcs12

![architecture diagram](../../docs/diagrams/core/X509CertificatePkcs12.svg)

In order to generate a PKCS #12 file from an X.509 certificate in PEM format you can use `X509CertificatePkcs12` construct:

```ts
const sourceCertificate = new X509CertificatePem(/* ... */);
const pkcs12Cert = new X509CertificatePkcs12(stack, 'CertPkcs12', {
  sourceCertificate: sourceCertificate,
});
```

Similar to `X509CertificatePem`, you can also provide your own encryption key:

```ts
const sourceCertificate = new X509CertificatePem(/* ... */);
const encryptionKey = new Key(/* ... */);

const pkcs12Cert = new X509CertificatePkcs12(stack, 'CertPkcs12', {
  sourceCertificate,
  encryptionKey,
});
```

### ImportedAcmCertificate

![architecture diagram](../../docs/diagrams/core/ImportedAcmCertificate.svg)

You might need to import your X.509 certificate stored as a Secret into the AWS Certificate Manager. In this case, you can use `ImportedAcmCertificate` to do that:

```ts
const secretCert = new X509CertificatePem(/* ... */);
const importedCertificate = new ImportedAcmCertificate(stack, 'ImportedAcmCertificate', {
  cert: secretCert.cert,
  certChain: secretCert.certChain,
  key: secretCert.key,
  passphrase: secretCert.passphrase,
});
```

## Connecting To An Instance

The RFDK provides a few constructs that can create instances (for example, [StaticPrivateIpServer](#staticprivateipserver) or [MongoDbInstance](#mongodbinstance)) and there are multiple ways to connect to these instances.

### Session Manager

[AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) provides a secure way of creating and managing remote terminal sessions to instances. In order to use it, you will need to add the managed police to the `role` of your instance and to install the [SSM Agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html) on the instance using `userData`:

```ts
instance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

instance.userData.addCommands('yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm');
```

After deploying, you can follow the AWS System Manager user guide on how to [Start a session](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html).


### SSH Access

It is not possible to access the instance via SSH, by default. You need to allow ingress access on port 22 from the machine(s)/IP(s) that you want to ssh from ( see [Authorizing inbound traffic for your Linux instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/authorizing-access-to-an-instance.html) ).

Also, you need to provide the name of the EC2 SSH keypair to grant access to the instance:

```ts
const sshKeyName = 'sshKeyName';
const mongoDbInstance = new MongoDbInstance(stack, 'MongoDbInstance', {
  keyName: sshKeyName,
  /* ... */
});

const server = new StaticPrivateIpServer(stack, 'StaticPrivateIpServer', {
  keyName: sshKeyName,
  /* ... */
});
```

### Amazon EC2 Instance Connect

You can also use an [Amazon EC2 Instance Connect](https://aws.amazon.com/about-aws/whats-new/2019/06/introducing-amazon-ec2-instance-connect/). Please see [Connecting to your Linux instance using EC2 Instance Connect](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Connect-using-EC2-Instance-Connect.html) for more details.
