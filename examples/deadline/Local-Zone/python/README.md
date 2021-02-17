# RFDK Sample Application - Local Zones - Python

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/Local-Zones/python/` relative to the root of the AWS-RFDK package.

---

1.  This sample app on the `mainline` branch may contain features that have not yet been officially released, and may not be available in the `aws-rfdk` package installed through pip from PyPI. To work from an example of the latest release, please switch to the `release` branch. If you would like to try out unreleased features, you can stay on `mainline` and follow the instructions for building, packing, and installing the `aws-rfdk` from your local repository.

2.  Install the dependencies of the sample app:

    ```bash
    pip install -r requirements.txt
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
    pip install ../../../../dist/python/aws-rfdk-<version>.tar.gz
    ```

4.  You must read and accept the [AWS Thinkbox End-User License Agreement (EULA)](https://www.awsthinkbox.com/end-user-license-agreement) to deploy and run Deadline. To do so, change the value of the `accept_aws_thinkbox_eula` in `package/lib/config.py` to `ACCEPTS` like this:

    ```py
    self.accept_aws_thinkbox_eula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA
    ```

5. Change the value of the `deadline_version` variable in `package/lib/config.py` to specify the desired version of Deadline to be deployed to your render farm. RFDK is compatible with Deadline versions 10.1.9.x and later. To see the available versions of Deadline, consult the [Deadline release notes](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html). It is recommended to use the latest version of Deadline available when building your farm, but to pin this version when the farm is ready for production use. For example, to pin to the latest `10.1.13` release of Deadline, use `10.1.13.1`.

6. Change the value of the `deadline_client_linux_ami_map` variable in `package/config.py` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker.

7. Also in `package/lib/config.py`, you can set the `availability_zones_standard` and `availability_zones_local` values to the availability zones you want to use. These values must all be from the same region. It's recommended you use at least two standard zones, but you can use more if you'd like. For the local zones you can use as many as you'd like.

8. Deploy all the stacks in the sample app:

    ```bash
    cdk deploy "*"
    ```

9. Once you are finished with the sample app, you can tear it down by running:

    ```bash
    cdk destroy "*"
    ```