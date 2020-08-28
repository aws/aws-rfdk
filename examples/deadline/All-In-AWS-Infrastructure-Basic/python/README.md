# RFDK Sample Application - Deadline - Python

## Overview
[Back to overview](../README.md)

## Instructions

---
**NOTE**

These instructions assume that your working directory is `examples/deadline/All-In-AWS-Infrastructure-Basic-Tiered/python/` relative to the root of the AWS-RFDK package.

---

1. Install the dependencies of the sample app:
```bash
pip install -r requirements.txt
```
2. Change the value in the `deadline_client_linux_ami_map` variable in `package/config.py` to include the region + AMI ID mapping of your EC2 AMI(s) with Deadline Worker.
```python
# For example, in the us-west-2 region
self.deadline_client_linux_ami_map: Mapping[str, str] = {'us-west-2': '<your ami id'}

```
3. Create a binary secret in [SecretsManager](https://aws.amazon.com/secrets-manager/) that contains your [Usage-Based Licensing](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/aws-portal/licensing-setup.html?highlight=usage%20based%20licensing) certificates in a `.zip` file:
```bash
aws secretsmanager create-secret --name <name> --secret-binary fileb://<path-to-zip-file>
```
4. The output from the previous step will contain the secret's ARN. Change the value of the `ubl_certificate_secret_arn` variable in `package/config.py` to the secret's ARN:
```python
self.ubl_certificate_secret_arn: str = '<your secret arn>'
```
5. Choose your UBL limits and change the value of the `ubl_licenses` variable in `package/config.py` accordingly:
```python
self.ubl_licenses: List[UsageBasedLicense] = [<your-ubl-limits> (e.g. UsageBasedLicense.forMaya(10))]
```
---

**Note:** The next two steps are optional. You may skip these if you do not need SSH access into your render farm.

---
6. Create an EC2 key pair to give you SSH access to the render farm:
```bash
aws ec2 create-key-pair --key-name <key-name>
```
7.  Change the value of the `key_pair_name` variable in `package/config.py` to your value for `<key-name>` in the previous step: <br><br>**Note:** Save the value of the "KeyMaterial" field as a file in a secure location. This is your private key that you can use to SSH into the render farm.
```python
self.key_pair_name: Optional[str] = '<your key pair name>'
```
8. Choose the type of database you would like to deploy and change the value of the `deploy_mongo_db` variable in `package/config.py` accordingly:
```python
# True = MongoDB, False = Amazon DocumentDB
self.deploy_mongo_db: bool = False
```
9. If you set `deploy_mongo_db` to `True`, then you must accept the [SSPL license](https://www.mongodb.com/licensing/server-side-public-license) to successfully deploy MongoDB. To do so, change the value of `accept_sspl_license` in `package/config.py`:
```python
self.accept_sspl_license: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL
```
10. Stage the Docker recipes for `RenderQueue` and `UBLLicensing`:
```bash
# Set this value to the version of RFDK your application targets
RFDK_VERSION=
# Set this value to the version of AWS Thinkbox Deadline you'd like to deploy to your farm
RFDK_DEADLINE_VERSION=
npx --package=aws-rfdk@${RFDK_VERSION} stage-deadline \
    --deadlineInstallerURI s3://thinkbox-installers/Deadline/${RFDK_DEADLINE_VERSION}/Linux/DeadlineClient-${RFDK_DEADLINE_VERSION}-linux-x64-installer.run \
    --dockerRecipesURI s3://thinkbox-installers/DeadlineDocker/${RFDK_DEADLINE_VERSION}/DeadlineDocker-${RFDK_DEADLINE_VERSION}.tar.gz \
    --output stage
```
11. Deploy all the stacks in the sample app:
```bash
cdk deploy "*"
```
13. Once you are finished with the sample app, you can tear it down by running:
```bash
cdk destroy "*"
```