# RFDK Sample Application - Deadline - Python

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-Basic-Tiered/python/` relative to the root of the AWS-RFDK package.

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
4.  Change the value in the `deadline_client_linux_ami_map` variable in `package/config.py` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker.

    ```python
    # For example, in the us-west-2 region
    self.deadline_client_linux_ami_map: Mapping[str, str] = {
        'us-west-2': '<your ami id>'
    }
    ```
5.  Create a binary secret in [SecretsManager](https://aws.amazon.com/secrets-manager/) that contains your [Usage-Based Licensing](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/aws-portal/licensing-setup.html?highlight=usage%20based%20licensing) certificates in a `.zip` file:

    ```bash
    aws secretsmanager create-secret --name <name> --secret-binary fileb://<path-to-zip-file>
    ```
6.  The output from the previous step will contain the secret's ARN. Change the value of the `ubl_certificate_secret_arn` variable in `package/config.py` to the secret's ARN:

    ```python
    self.ubl_certificate_secret_arn: str = '<your secret arn>'
    ```
7.  Choose your UBL limits and change the value of the `ubl_licenses` variable in `package/config.py` accordingly. For example:

    ```python
    self.ubl_licenses: List[UsageBasedLicense] = [
        # your UBL limits, for example:

        # up to 10 concurrent Maya licenses used at once
        UsageBasedLicense.for_maya(10),

        # unlimited Arnold licenses
        UsageBasedLicense.for_arnold()
    ]
    ```

    ---

    **Note:** The next two steps are optional. You may skip these if you do not need SSH access into your render farm.

    ---
8.  Create an EC2 key pair to give you SSH access to the render farm:

    ```bash
    aws ec2 create-key-pair --key-name <key-name>
    ```
9.  Change the value of the `key_pair_name` variable in `package/config.py` to your value for `<key-name>` in the previous step:

    **Note:** Save the value of the `"KeyMaterial"` field as a file in a secure location. This is your private key that you can use to SSH into the render farm.

    ```python
    self.key_pair_name: Optional[str] = '<your key pair name>'
    ```
10. Choose the type of database you would like to deploy (AWS DocumentDB or MongoDB).
    If you would like to use MongoDB, you will need to accept the Mongo SSPL (see next step).
    Once you've decided on a database type, change the value of the `deploy_mongo_db` variable in `package/config.py` accordingly:

    ```python
    # True = MongoDB, False = Amazon DocumentDB
    self.deploy_mongo_db: bool = False
    ```
11. If you set `deploy_mongo_db` to `True`, then you must accept the [SSPL license](https://www.mongodb.com/licensing/server-side-public-license) to successfully deploy MongoDB. To do so, change the value of `accept_sspl_license` in `package/config.py`:

    ```python
    # To accept the MongoDB SSPL, change from USER_REJECTS_SSPL to USER_ACCEPTS_SSPL
    self.accept_sspl_license: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL
    ```
12. Stage the Docker recipes for `RenderQueue` and `UBLLicensing`:

    ```bash
    # Set this value to the version of RFDK your application targets
    RFDK_VERSION=<version_of_RFDK>

    # Set this value to the version of AWS Thinkbox Deadline you'd like to deploy to your farm. Deadline 10.1.9 and up are supported.
    RFDK_DEADLINE_VERSION=<version_of_deadline>

    npx --package=aws-rfdk@${RFDK_VERSION} stage-deadline \
        --deadlineInstallerURI s3://thinkbox-installers/Deadline/${RFDK_DEADLINE_VERSION}/Linux/DeadlineClient-${RFDK_DEADLINE_VERSION}-linux-x64-installer.run \
        --dockerRecipesURI s3://thinkbox-installers/DeadlineDocker/${RFDK_DEADLINE_VERSION}/DeadlineDocker-${RFDK_DEADLINE_VERSION}.tar.gz \
        --output stage
    ```
12. Deploy all the stacks in the sample app:

    ```bash
    cdk deploy "*"
    ```
13. Once you are finished with the sample app, you can tear it down by running:

    ```bash
    cdk destroy "*"
    ```
