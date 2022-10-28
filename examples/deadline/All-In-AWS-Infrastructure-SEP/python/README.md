# RFDK Sample Application - Deadline Spot Event Plugin - Python

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-SEP/python/` relative to the root of the AWS-RFDK package.

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
    ./build.sh
    # Enter the Docker container to run thepack scripts
    ./scripts/rfdk_build_environment.sh
    ./pack.sh
    # Exit the Docker container
    exit
    # Navigate back to the example directory
    popd
    pip install ../../../../dist/python/aws-rfdk-<version>.tar.gz
    ```

4.  Change the value in the `deadline_client_linux_ami_map` variable in `package/config.py` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker. You can use the following AWS CLI query to find AMI ID's:
    ```bash
    aws --region <region> ec2 describe-images \
    --owners 357466774442 \
    --filters "Name=name,Values=*Worker*" "Name=name,Values=*<version>*" \
    --query 'Images[*].[ImageId, Name]' \
    --output text
    ```

    And enter it into this section of `package/config.py`:
    ```python
    # For example, in the us-west-2 region
    self.deadline_client_linux_ami_map: Mapping[str, str] = {
        'us-west-2': '<your ami id>'
    }
    ```

5. Stage the Docker recipes for `RenderQueue`:

    ```bash
    # Set this value to the version of RFDK your application targets
    RFDK_VERSION=<version_of_RFDK>

    # Set this value to the version of AWS Thinkbox Deadline you'd like to deploy to your farm. Deadline 10.1.12 and up are supported.
    RFDK_DEADLINE_VERSION=<version_of_deadline>

    npx --package=aws-rfdk@${RFDK_VERSION} stage-deadline --output stage ${RFDK_DEADLINE_VERSION}
    ```

6. Deploy all the stacks in the sample app:

    ```bash
    cdk deploy "*"
    ```

7. You can now [connect to the farm](https://docs.aws.amazon.com/rfdk/latest/guide/connecting-to-render-farm.html) and [submit rendering jobs](https://docs.aws.amazon.com/rfdk/latest/guide/first-rfdk-app.html#_optional_submit_a_job_to_the_render_farm).

    **Note:** In order for the Spot Event Plugin to create a Spot Fleet Request you need to:
    * Submit the job with the assigned Deadline Group and Deadline Pool. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/job-submitting.html#submitting-jobs).

    **Note:** Disable 'Allow Workers to Perform House Cleaning If Pulse is not Running' in the 'Configure Repository Options' when using Spot Event Plugin. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#prerequisites).

8. Once you are finished with the sample app, you can tear it down by running:

    **Note:** Any resources created by the Spot Event Plugin will not be deleted with `cdk destroy`. Make sure that all such resources (e.g. Spot Fleet Request or Fleet Instances) are cleaned up, before destroying the stacks. Disable the Spot Event Plugin by setting 'state' property to 'SpotEventPluginState.DISABLED' or via Deadline Monitor, ensure you shutdown all Pulse instances and then terminate any Spot Fleet Requests in the AWS EC2 Instance Console.

    ```bash
    cdk destroy "*"
    ```
