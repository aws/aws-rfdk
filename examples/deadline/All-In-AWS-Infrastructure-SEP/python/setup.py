import setuptools


with open("README.md") as fp:
    long_description = fp.read()


setuptools.setup(
    name="all_in_aws_infrastructure_sep",
    version="0.0.1",

    description="RFDK All In AWS Infrastructure SEP",
    long_description=long_description,
    long_description_content_type="text/markdown",

    package_dir={"": "package"},
    packages=setuptools.find_packages(where="package"),

    install_requires=[
        "aws-cdk-lib==2.54.0",
        "aws-rfdk==1.1.0"
    ],

    python_requires=">=3.7",
)
