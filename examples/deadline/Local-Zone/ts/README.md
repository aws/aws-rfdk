# RFDK Sample Application - Local Zones - Typescript

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/Local-Zones/ts/` relative to the root of the RFDK package.

---
1. This sample app on the `mainline` branch may contain features that have not yet been officially released, and may not be available in the `aws-rfdk` package installed through npm from npmjs. To work from an example of the latest release, please switch to the `release` branch. If you would like to try out unreleased features, you can stay on `mainline` and follow the instructions for building and using the `aws-rfdk` from your local repository.

2.  You must read and accept the [AWS Thinkbox End-User License Agreement (EULA)](https://www.awsthinkbox.com/end-user-license-agreement) to deploy and run Deadline. To do so, change the value of the `acceptAwsThinkboxEula` in `bin/config.ts` like this:

    ```ts
    public readonly acceptAwsThinkboxEula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA;
    ```

3. Change the value of the `deadlineVersion` variable in `bin/config.ts` to specify the desired version of Deadline to be deployed to your render farm. RFDK is compatible with Deadline versions 10.1.9.x and later. To see the available versions of Deadline, consult the [Deadline release notes](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html). It is recommended to use the latest version of Deadline available when building your farm, but to pin this version when the farm is ready for production use. For example, to pin to the latest `10.1.15.x` release of Deadline, use:

    ```ts
    public readonly deadlineVersion: string = '10.1.15';
    ```

4. Change the value of the `deadlineClientLinuxAmiMap` variable in `bin/config.ts` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker. You can use the following AWS CLI command to look up AMIs, replacing the `<region>` and `<version>` to match the AWS region and Deadline version you're looking for:

    ```bash
    aws --region <region> ec2 describe-images --owners 357466774442 --filters "Name=name,Values=*Worker*" "Name=name,Values=*<version>*" --query 'Images[*].[ImageId, Name]' --output text
    ```

5. Also in `bin/config.ts`, you can set the `availabilityZonesStandard` and `availabilityZonesLocal` values to the availability zones you want to use. These values must all be from the same region. It's required that you use at least two standard zones, but you can use more if you'd like. For the local zones, you can use one or more.

6. Build the `aws-rfdk` package, and then build the sample app. The `tsconfig.json` for this example app contains a reference to the local `aws-rfdk` package and will link your build artifacts:

    ```bash
    # Navigate to the root directory of the RFDK repository (assumes you started in the example's directory)
    pushd ../../../..
    # Enter the Docker container, run the build, and then exit
    ./scripts/rfdk_build_environment.sh
    ./build.sh
    exit
    # Navigate back to the example directory
    popd
    # Run the example's build
    yarn build
    ```

7. Deploy all the stacks in the sample app:

    ```
    cdk deploy "*"
    ```
8. Once you are finished with the sample app, you can tear it down by running:

    ```
    cdk destroy "*"
    ```