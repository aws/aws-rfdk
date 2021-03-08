import setuptools


with open("README.md") as fp:
    long_description = fp.read()


setuptools.setup(
    name="all_in_aws_local_zones",
    version="0.0.1",

    description="RFDK All In AWS using Local Zones",
    long_description=long_description,
    long_description_content_type="text/markdown",

    package_dir={"": "package"},
    packages=setuptools.find_packages(where="package"),

    install_requires=[
        "aws-cdk.aws-ec2==1.91.0",
        "aws-cdk.aws-elasticloadbalancingv2==1.91.0",
        "aws-cdk.aws-route53==1.91.0",
        "aws-cdk.core==1.91.0",
        "aws-rfdk==0.26.0",
        "jsii==1.24.0",
    ],

    python_requires=">=3.7",
)
