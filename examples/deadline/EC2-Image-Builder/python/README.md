# RFDK Sample Application - EC2 Image Builder - Python

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/EC2-Image-Builder/python/` relative to the root of the AWS-RFDK package.

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

4.  You must read and accept the [AWS Thinkbox End-User License Agreement (EULA)](https://www.awsthinkbox.com/end-user-license-agreement) to deploy and run Deadline. To do so, change the value of the `accept_aws_thinkbox_eula` in `package/config.py` to `ACCEPTS` like this:

    ```py
    self.accept_aws_thinkbox_eula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA
    ```

5. Change the value of the `deadline_version` variable in `package/config.py` to specify the desired version of Deadline to be deployed to your render farm. RFDK is compatible with Deadline versions 10.1.9.x and later. To see the available versions of Deadline, consult the [Deadline release notes](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html). It is recommended to use the latest version of Deadline available when building your farm, but to pin this version when the farm is ready for production use. For example, to pin to the latest `10.1.13` release of Deadline, use `10.1.13.1`.

6. Also in `package/config.py`, you can set the version of your image recipe that you'll create by changing the value of `image_recipe_version`. The default value here should be fine to start. The image recipe version would only need to be changed if you're changing any inputs for the image creation that will cause a new image to be made.

7. Deploy all the stacks in the sample app:

    ```bash
    cdk deploy "*"
    ```

8. Once you are finished with the sample app, you can tear it down by running:

    ```bash
    cdk destroy "*"
    ```
