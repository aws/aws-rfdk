# RFDK Sample Application - Deadline Spot Event Plugin - Typescript

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-SEP/ts/` relative to the root of the RFDK package.

---
1. This sample app on the `mainline` branch may contain features that have not yet been officially released, and may not be available in the `aws-rfdk` package installed through npm from npmjs. To work from an example of the latest release, please switch to the `release` branch. If you would like to try out unreleased features, you can stay on `mainline` and follow the instructions for building and using the `aws-rfdk` from your local repository.

2. Install the dependencies of the sample app:

    ```
    yarn install
    ```
3. Modify the `deadline_ver` field in the `config` block of `package.json` as desired (Deadline 10.1.12 and up are supported), then stage the Docker recipes for `RenderQueue`:

    ```
    yarn stage
    ```

4.  Change the value of the `deadlineClientLinuxAmiMap` variable in `bin/config.ts` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker. You can use the following AWS CLI query to find AMI ID's:
    ```
    aws --region <region> ec2 describe-images \
    --owners 357466774442 \
    --filters "Name=name,Values=*Worker*" "Name=name,Values=*<version>*" \
    --query 'Images[*].[ImageId, Name]' \
    --output text
    ```

    And enter it into this section of `bin/config.ts`:
    ```ts
    // For example, in the us-west-2 region
    public readonly deadlineClientLinuxAmiMap: Record<string, string> = {
      ['us-west-2']: '<your-ami-id>',
      // ...
      };
    ```

5. Build the `aws-rfdk` package, and then build the sample app. There is some magic in the way yarn workspaces and lerna packages work that will link the built `aws-rfdk` from the base directory as the dependency to be used in the example's directory:

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

6. Deploy all the stacks in the sample app:

    ```
    cdk deploy
    ```

7. You can now [connect to the farm](https://docs.aws.amazon.com/rfdk/latest/guide/connecting-to-render-farm.html) and [submit rendering jobs](https://docs.aws.amazon.com/rfdk/latest/guide/first-rfdk-app.html#_optional_submit_a_job_to_the_render_farm).

    **Note:** In order for the Spot Event Plugin to create a Spot Fleet Request you need to:
    * Create the Deadline Group associated with the Spot Fleet Request Configuration. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/pools-and-groups.html).
    * Create the Deadline Pools to which the fleet Workers are added. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/pools-and-groups.html).
    * Submit the job with the assigned Deadline Group and Deadline Pool. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/job-submitting.html#submitting-jobs).

    **Note:** Disable 'Allow Workers to Perform House Cleaning If Pulse is not Running' in the 'Configure Repository Options' when using Spot Event Plugin. See [Deadline Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#prerequisites).

8. Once you are finished with the sample app, you can tear it down by running:

    **Note:** Any resources created by the Spot Event Plugin will not be deleted with `cdk destroy`. Make sure that all such resources (e.g. Spot Fleet Request or Fleet Instances) are cleaned up, before destroying the stacks. Disable the Spot Event Plugin by setting 'state' property to 'SpotEventPluginState.DISABLED' or via Deadline Monitor, ensure you shutdown all Pulse instances and then terminate any Spot Fleet Requests in the AWS EC2 Instance Console.

    ```
    cdk destroy
    ```
