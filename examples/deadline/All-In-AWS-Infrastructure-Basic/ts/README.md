# RFDK Sample Application - Deadline - Typescript

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-Basic-Tiered/ts/` relative to the root of the RFDK package.

---

1. This sample app on the `mainline` branch may contain features that have not yet been officially released, and may not be available in the `aws-rfdk` package installed through npm from npmjs. To work from an example of the latest release, please switch to the `release` branch. If you would like to try out unreleased features, you can stay on `mainline` and follow the instructions for building, packing, and installing the `aws-rfdk` from your local repository.
2.  Install the dependencies of the sample app:

    ```
    yarn install
    ```
3.  If working on the `release` branch, this step can be skipped. If working on `mainline`, navigate to the base directory where the build and packaging scripts are, then run them and install the result over top of the `aws-rfdk` version that was installed in the previous step:
    ```bash
    # Navigate to the root directory of the RFDK repository
    pushd ../../../..
    # Enter the Docker container to run the build and pack scripts
    ./scripts/rfdk_build_environment.sh
    ./build.sh
    ./pack.sh
    # Exit the Docker container
    exit
    # Navigate back to the example directory
    popd
    npm install ../../../../dist/js/aws-rfdk\@<version>.jsii.tgz
    ```
4.  Change the value in the `deadlineClientLinuxAmiMap` variable in `bin/config.ts` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker.

    ```ts
    // For example, in the us-west-2 region
    public readonly deadlineClientLinuxAmiMap: Record<string, string> = {
      ['us-west-2']: '<your-ami-id>',
      // ...
      };
    ```
5.  Create a binary secret in [SecretsManager](https://aws.amazon.com/secrets-manager/) that contains your [Usage-Based Licensing](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/aws-portal/licensing-setup.html?highlight=usage%20based%20licensing) certificates in a `.zip` file:

    ```
    aws secretsmanager create-secret --name <name> --secret-binary fileb://<path-to-zip-file>
    ```
6.  The output from the previous step will contain the secret's ARN. Change the value of the `ublCertificatesSecretArn` variable in `bin/config.ts` to the secret's ARN:

    ```ts
    public readonly ublCertificatesSecretArn: string = '<your-secret-arn>';
    ```
7.  Choose your UBL limits and change the value of the `ublLicenses` variable in `bin/config.ts` accordingly. For example:

    ```ts
    public readonly ublLicenses: UsageBasedLicense[] = [
      // your UBL limits, for example:

      // up to 10 concurrent Maya licenses used at once
      UsageBasedLicense.forMaya(10),

      // unlimited Arnold licenses
      UsageBasedLicense.forArnold()
    ];
    ```

    ---

    **Note:** The next two steps are optional. You may skip these if you do not need   SSH access into your render farm.

    ---
8.  Create an EC2 key pair to give you SSH access to the render farm:

    ```
    aws ec2 create-key-pair --key-name <key-name>
    ```
9.  Change the value of the `keyPairName` variable in `bin/config.ts` to your value for `<key-name>` in the previous step:

    **Note:** Save the value of the `"KeyMaterial"` field as a file in a secure location. This is your private key that you can use to SSH into the render farm.

    ```ts
    public readonly keyPairName: string = '<key-name>';
    ```
10. Choose the type of database you would like to deploy (AWS DocumentDB or MongoDB).
    If you would like to use MongoDB, you will need to accept the Mongo SSPL (see next step).
    Once you've decided on a database type, change the value of the `deployMongoDB` variable in `bin/config.ts` accordingly:

    ```ts
    // true = MongoDB, false = Amazon DocumentDB
    public readonly deployMongoDB: boolean = false;
    ```
11. If you set `deployMongoDB` to `true`, then you must accept the [SSPL license](https://www.mongodb.com/licensing/server-side-public-license) to successfully deploy MongoDB. To do so, change the value of `acceptSsplLicense` in `bin/config.ts`:

    ```ts
    // To accept the MongoDB SSPL, change from USER_REJECTS_SSPL to USER_ACCEPTS_SSPL
    public readonly acceptSsplLicense: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL;
    ```
12. Modify the `deadline_ver` field in the `config` block of `package.json` as desired (Deadline 10.1.9 and up are supported), then stage the Docker recipes for `RenderQueue` and `UBLLicensing`:

    ```
    yarn stage
    ```
13. Build the sample app:

    ```
    yarn build
    ```
14. Deploy all the stacks in the sample app:

    ```
    cdk deploy "*"
    ```
15. Once you are finished with the sample app, you can tear it down by running:

    ```
    cdk destroy "*"
    ```
