# RFDK Sample Application - Deadline - Typescript

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-SEP/ts/` relative to the root of the RFDK package.

---
1. This sample app on the mainline branch may contain features that have not yet been officially released, and may not be available in the aws-rfdk package installed through npm from npmjs. To work from an example of the latest release, please switch to the release branch. If you would like to try out unreleased features, you can stay on mainline and follow the instructions for building, packing, and installing the aws-rfdk from your local repository.
2. Install the dependencies of the sample app:

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
4. Modify the `deadline_ver` field in the `config` block of `package.json` as desired (Deadline 10.1.9 and up are supported), then stage the Docker recipes for `RenderQueue`:

    ```
    yarn stage
    ```
5. Build the sample app:

    ```
    yarn build
    ```
6. Deploy all the stacks in the sample app:

    ```
    cdk deploy
    ```

7. Connect to your Render Farm and open up the Deadline Monitor.

8. Configure the Spot event plugin by following the directions in the [Spot Event Plugin documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html) with the following considerations:

    Use the default security credentials by using turning "Use Local Credentials" to False and leaving both "Access Key ID" and "Secret Access Key" blank.
    Ensure that the Region your Spot workers will be launched in is the same region as your CDK application.
    When Creating your Spot Fleet Requests, set the IAM instance profile to "DeadlineSpotWorkerRole" and set the security group to "DeadlineSpotSecurityGroup".
    Configure your instances to connect to the Render Queue by either creating your AMI after launching your app and preconfiguring the AMI or by setting up a userdata in the Spot Fleet Request. (see the Spot Event Plugin documentation for additional information on configuring this connection.)

9. Once you are finished with the sample app, you can tear it down by running:

    ```
    cdk destroy
    ```
