# RFDK Sample Application - Deadline - Typescript

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-Basic-Tiered/ts/` relative to the root of the RFDK package.

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
