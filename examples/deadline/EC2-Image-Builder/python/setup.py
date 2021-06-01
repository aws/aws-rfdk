import setuptools


with open("README.md") as fp:
    long_description = fp.read()


setuptools.setup(
    name="all_in_farm_image_builder",
    version="0.0.1",

    description="RFDK Image Builder",
    long_description=long_description,
    long_description_content_type="text/markdown",

    package_dir={"": "package"},
    packages=setuptools.find_packages(where="package"),

    install_requires=[
        "aws-cdk.aws-iam==1.106.1",
        "aws-cdk.aws-imagebuilder==1.106.1",
        "aws-cdk.aws-ec2==1.106.1",
        "aws-cdk.aws-s3-assets==1.106.1",
        "aws-cdk.core==1.106.1",
        "aws-rfdk==0.33.0",
    ],

    python_requires=">=3.7",
)
