# RFDK Sample Application - EC2 Image Builder - Typescript

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/EC2-Image-Builder/ts/` relative to the root of the RFDK package.

---
1. This sample app on the `mainline` branch may contain features that have not yet been officially released, and may not be available in the `aws-rfdk` package installed through npm from npmjs. To work from an example of the latest release, please switch to the `release` branch. If you would like to try out unreleased features, you can stay on `mainline` and follow the instructions for building and using the `aws-rfdk` from your local repository.

2.  By downloading or using the Deadline software, you agree to the [AWS Customer Agreement](https://aws.amazon.com/agreement/)
    and [AWS Intellectual Property License](https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
    is AWS Content as defined in those Agreements.
    To accept these terms, change the value of `acceptAwsCustomerAgreementAndIpLicense` in `bin/config.ts`:

    ```ts
    public readonly acceptAwsCustomerAgreementAndIpLicense: AwsCustomerAgreementAndIpLicenseAcceptance = AwsCustomerAgreementAndIpLicenseAcceptance.USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE;
    ```

3.  Change the value of the `deadlineVersion` variable in `bin/config.ts` to specify the desired version of Deadline to be deployed to your render farm. RFDK is compatible with Deadline versions 10.1.9.x and later. To see the available versions of Deadline, consult the [Deadline release notes](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html). It is recommended to use the latest version of Deadline available when building your farm, but to pin this version when the farm is ready for production use. For example, to pin to the `10.1.13` release of Deadline, use `10.1.13.2`.

4. Set the values of `deadlineLinuxParentAmiId` and `deadlineWindowsParentAmiId` in `bin/config.ts` to the AMI ID's that you'd like to use as the parents EC2 Image Builder will use to install Deadline onto. There is a field for Linux and another for Windows because the `ComputeStack` creates an image and a worker fleet for both OSes.

5. Also in `bin/config.ts`, you can set the version of your image recipe that you'll create by changing the value of `imageRecipeVersion`. The default value here should be fine to start. The image recipe version would only need to be changed if you're changing any inputs for the image creation that will cause a new image to be made.

6. Build the `aws-rfdk` package, and then build the sample app. The `tsconfig.json` for this example app contains a reference to the local `aws-rfdk` package and will link your build artifacts:

    ```bash
    # Navigate to the root directory of the RFDK repository (assumes you started in the example's directory)
    pushd ../../../..
    ./build.sh
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
