# RFDK Sample Application - Deadline - Python

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-Basic/python/` relative to the root of the AWS-RFDK package.

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
4.  You must read and accept the [AWS Thinkbox End-User License Agreement (EULA)](https://www.awsthinkbox.com/end-user-license-agreement) to deploy and run Deadline. To do so, change the value of the `accept_aws_thinkbox_eula` in `package/config.py`:

    ```py
    # Change this value to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA if you wish to accept the EULA
    # for Deadline and proceed with Deadline deployment. Users must explicitly accept the AWS Thinkbox EULA before
    # using the AWS Thinkbox Deadline container images.
    #
    # See https://www.awsthinkbox.com/end-user-license-agreement for the terms of the agreement.
    self.accept_aws_thinkbox_eula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA
    ```
5.  Change the value of the `deadline_version` variable in `package/config.py` to specify the desired version of Deadline to be deployed to your render farm. RFDK is compatible with Deadline versions 10.1.9.x and later. To see the available versions of Deadline, consult the [Deadline release notes](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html). It is recommended to use the latest version of Deadline available when building your farm, but to pin this version when the farm is ready for production use. For example, to pin to the latest `10.1.12.x` release of Deadline, use:

    ```python
    self.deadline_version: str = '10.1.12'
    ```
6.  Change the value of the `deadline_client_linux_ami_map` variable in `package/config.py` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker. You can use the following AWS CLI query to find AMI ID's:
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
7.  Create a binary secret in [SecretsManager](https://aws.amazon.com/secrets-manager/) that contains your [Usage-Based Licensing](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/aws-portal/licensing-setup.html?highlight=usage%20based%20licensing) certificates in a `.zip` file:

    ```bash
    aws secretsmanager create-secret --name <name> --secret-binary fileb://<path-to-zip-file>
    ```
8.  The output from the previous step will contain the secret's ARN. Change the value of the `ubl_certificate_secret_arn` variable in `package/config.py` to the secret's ARN:

    ```python
    self.ubl_certificate_secret_arn: str = '<your secret arn>'
    ```
9.  Choose your UBL limits and change the value of the `ubl_licenses` variable in `package/config.py` accordingly. For example:

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
10. Create an EC2 key pair to give you SSH access to the render farm:

    ```bash
    aws ec2 create-key-pair --key-name <key-name>
    ```
11. Change the value of the `key_pair_name` variable in `package/config.py` to your value for `<key-name>` in the previous step:

    **Note:** Save the value of the `"KeyMaterial"` field as a file in a secure location. This is your private key that you can use to SSH into the render farm.

    ```python
    self.key_pair_name: Optional[str] = '<your key pair name>'
    ```
12. Choose the type of database you would like to deploy (AWS DocumentDB or MongoDB).
    If you would like to use MongoDB, you will need to accept the Mongo SSPL (see next step).
    Once you've decided on a database type, change the value of the `deploy_mongo_db` variable in `package/config.py` accordingly:

    ```python
    # True = MongoDB, False = Amazon DocumentDB
    self.deploy_mongo_db: bool = False
    ```
13. If you set `deploy_mongo_db` to `True`, then you must accept the [SSPL license](https://www.mongodb.com/licensing/server-side-public-license) to successfully deploy MongoDB. To do so, change the value of `accept_sspl_license` in `package/config.py`:

    ```python
    # To accept the MongoDB SSPL, change from USER_REJECTS_SSPL to USER_ACCEPTS_SSPL
    self.accept_sspl_license: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL
    ```
14. Optionally configure alarm notifications. If you choose to configure alarms, change the value of the `alarm_email_address` variable in `package/config.py` to the desired email address to receive alarm notifications:

    ```python
    self.alarm_email_address: Optional[str] = 'username@yourdomain.com'
    ```
15. Deadline Secrets Management is a feature used to encrypt certain values in the database that need to be kept secret. Additional documentation about the feature and how it works in the RFDK can be found in the [RFDK README](../../../../packages/aws-rfdk/lib/deadline/README.md). By default, Deadline Secrets Management is enabled, but it can be disabled by changing the `enable_secrets_management` variable in `package/config.py`.

    ```python
    self.enable_secrets_management: bool = False
    ```

16. When you are using Deadline Secrets Management you can define your own admin credentials by creating a Secret in AWS SecretsManager in the following format:

    ```json
        {
            "username": "<admin user name>",
            "password": "<admin user password>",
        }
    ```
    The password must be at least 8 characters long and contain at least one lowercase, one uppercase, one digit, and one special character.

    Then the value of the `secrets_management_secret_arn` variable in `package/config.py` should be changed to this Secret's ARN:

    ```python
    self.secrets_management_secret_arn: Optional[str] = '<your secret arn>'
    ```
    
    It is highly recommended that you leave this parameter undefined to enable the automatic generation of a strong password.

17. Deploy all the stacks in the sample app:

    ```bash
    cdk deploy "*"
    ```
18. Once you are finished with the sample app, you can tear it down by running:

    ```bash
    cdk destroy "*"
    ```
