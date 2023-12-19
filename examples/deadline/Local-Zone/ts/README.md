# RFDK Sample Application - Local Zones - Typescript

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/Local-Zones/ts/` relative to the root of the RFDK package.

---
1. This sample app on the `mainline` branch may contain features that have not yet been officially released, and may not be available in the `aws-rfdk` package installed through npm from npmjs. To work from an example of the latest release, please switch to the `release` branch. If you would like to try out unreleased features, you can stay on `mainline` and follow the instructions for building and using the `aws-rfdk` from your local repository.

2.  By downloading or using the Deadline software, you agree to the [AWS Customer Agreement](https://aws.amazon.com/agreement/)
    and [AWS Intellectual Property License](https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
    is AWS Content as defined in those Agreements.
    To accept these terms, change the value of `acceptAwsCustomerAgreementAndIpLicense` in `bin/config.ts`:

    ```ts
    public readonly acceptAwsCustomerAgreementAndIpLicense: AwsCustomerAgreementAndIpLicenseAcceptance = AwsCustomerAgreementAndIpLicenseAcceptance.USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE;
    ```

3. Change the value of the `deadlineVersion` variable in `bin/config.ts` to specify the desired version of Deadline to be deployed to your render farm. RFDK is compatible with Deadline versions 10.1.9.x and later. To see the available versions of Deadline, consult the [Deadline release notes](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/release-notes.html). It is recommended to use the latest version of Deadline available when building your farm, but to pin this version when the farm is ready for production use. For example, to pin to the latest `10.1.15.x` release of Deadline, use:

    ```ts
    public readonly deadlineVersion: string = '10.1.15';
    ```

4. Change the value of the `deadlineClientLinuxAmiMap` variable in `bin/config.ts` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker. You can use the following AWS CLI command to look up AMIs, replacing the `<region>` and `<version>` to match the AWS region and Deadline version you're looking for:

    ```bash
    aws --region <region> ec2 describe-images --owners 357466774442 --filters "Name=name,Values=*Worker*" "Name=name,Values=*<version>*" --query 'Images[*].[ImageId, Name]' --output text
    ```

5. Also in `bin/config.ts`, you can set the `availabilityZonesStandard` and `availabilityZonesLocal` values to the availability zones you want to use. These values must all be from the same region. It's required that you use at least two standard zones, but you can use more if you'd like. For the local zones, you can use one or more.

6. To gain the benefits of putting your workers in a local zone close to your asset server, you are going to want to set up a connection from your local network to the one you're creating in AWS.
   1. You should start by reading through the [Connecting to the Render Farm](https://docs.aws.amazon.com/rfdk/latest/guide/connecting-to-render-farm.html) documentation and implementing one of the methods for connecting your network to your AWS VPC described there.
   2. With whichever option you choose, you'll want to make sure you are propagating the worker subnets to your local network. All the options in the document show how to propagate all the private subnets, which will include the ones used by the workers.
   3. Ensure your worker fleet's security group allows traffic from your network on the correct ports that your NFS requires to be open. The documentation shows how to [allow connections to the Render Queue](https://docs.aws.amazon.com/rfdk/latest/guide/connecting-to-render-farm.html#allowing-connection-to-the-render-queue), which you may also want to enable if you plan on connecting any of your local machines to your render farm, but you would also want to do something similar for the worker fleet, for example, ports `22` and `2049` are commonly required for NFS, so this code could be added to the `ComputeTier`:

    ```ts
    // The customer-prefix-cidr-range needs to be replaced by the CIDR range for your local network that you used when configuring the VPC connection
    this.workerFleet.connections.allowFrom(Peer.ipv4('customer-prefix-cidr-range'), Port.tcp(22));
    this.workerFleet.connections.allowFrom(Peer.ipv4('customer-prefix-cidr-range'), Port.udp(22));
    this.workerFleet.connections.allowFrom(Peer.ipv4('customer-prefix-cidr-range'), Port.tcp(2049));
    this.workerFleet.connections.allowFrom(Peer.ipv4('customer-prefix-cidr-range'), Port.tcp(2049));
    ```

   4. Add user-data to mount the NFS on the compute tier. This can be provided in the `UserDataProvider` in the `ComputeTier`.
   5. (optional) Set up [path mapping rules in Deadline](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/cross-platform.html).

7. Build the `aws-rfdk` package, and then build the sample app. The `tsconfig.json` for this example app contains a reference to the local `aws-rfdk` package and will link your build artifacts:

    ```bash
    # Navigate to the root directory of the RFDK repository (assumes you started in the example's directory)
    pushd ../../../..
    yarn build
    # Navigate back to the example directory
    popd
    # Run the example's build
    yarn build
    ```

8. Deploy all the stacks in the sample app:

    ```
    cdk deploy "*"
    ```
9. Once you are finished with the sample app, you can tear it down by running:

    ```
    cdk destroy "*"
    ```