# AWS Render Farm Deployment Kit

The AWS Render Farm Deployment Kit (RFDK) is an open-source software development kit (SDK) that can be used to deploy, configure, and manage your render farm
infrastructure in the cloud. The RFDK is built to operate with the AWS Cloud Development Kit (CDK) and provides a library of classes, called constructs, that each
deploy and configure a component of your cloud-based render farm. The current version of the RFDK supports render farms built using AWS Thinkbox Deadline
render management software, and provides the ability for you to easily go from nothing to a production-ready render farm in the cloud.

You can model, deploy, configure, and update your AWS render farm infrastructure by writing an application, in Python or Node.js, for the CDK toolkit using the
libraries provided by the CDK and RFDK together and with other CDK-compatible libraries. Your application is written in an object-oriented style where creation of
an object from the CDK and RFDK libraries represents the creation of a resource, or collection of resources, in your AWS account when the application is deployed
via AWS CloudFormation by the CDK toolkit. The parameters of an object’s creation control the configuration of the resource.

## Contents of this package

* The root module/namespace (`aws-rfdk` in Typescript/Javascript, or `aws_rfdk` in Python) contains constructs that are not particular to any specific
 render management software. They are common building blocks that may be used in any deployed render farm. For more detailed information on the contents of this module, please see:
  1. The [official API documentation](https://docs.aws.amazon.com/rfdk/api/latest/docs/aws-rfdk-construct-library.html)
  2. Sample usage snipits in the [README](https://github.com/aws/aws-rfdk/blob/mainline/packages/aws-rfdk/lib/core/README.md)
* The `deadline` module/namespace (`aws-rfdk/deadline` in Typescript/Javascript, or `aws_rfdk.deadline` in Python) contains constructs that are specific to
 deploying a render farm that is operated by [AWS Thinkbox](https://www.awsthinkbox.com/) [Deadline software](https://www.awsthinkbox.com/deadline). For more detailed information on the contents of this module, please see:
   1. The [official API documentation](https://docs.aws.amazon.com/rfdk/api/latest/docs/aws-rfdk-construct-library.html)
   2. Sample usage snipits in the [README](https://github.com/aws/aws-rfdk/blob/mainline/packages/aws-rfdk/lib/deadline/README.md)