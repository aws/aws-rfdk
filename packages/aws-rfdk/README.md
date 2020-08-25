# Render Farm Deployment Kit on AWS

The Render Farm Deployment Kit on AWS (RFDK) is an open-source software development kit (SDK) that can be used to deploy, configure, and manage your render farm
infrastructure in the cloud. The RFDK is built to operate with the AWS Cloud Development Kit (CDK) and provides a library of classes, called constructs, that each
deploy and configure a component of your cloud-based render farm. The current version of the RFDK supports render farms built using AWS Thinkbox Deadline
render management software, and provides the ability for you to easily go from nothing to a production-ready render farm in the cloud.

You can model, deploy, configure, and update your AWS render farm infrastructure by writing an application, in Python or Node.js, for the CDK toolkit using the
libraries provided by the CDK and RFDK together and with other CDK-compatible libraries. Your application is written in an object-oriented style where creation of
an object from the CDK and RFDK libraries represents the creation of a resource, or collection of resources, in your AWS account when the application is deployed
via AWS CloudFormation by the CDK toolkit. The parameters of an object’s creation control the configuration of the resource.

Please see the following sources for additional information:
* The [RFDK Developer Guide](https://docs.aws.amazon.com/rfdk/latest/guide/what-is-rfdk.html)
* The [RFDK API Documentation](https://docs.aws.amazon.com/rfdk/api/latest/docs/aws-rfdk-construct-library.html)
* The [README for the main module](https://github.com/aws/aws-rfdk/blob/mainline/packages/aws-rfdk/lib/core/README.md)
* The [README for the Deadline module](https://github.com/aws/aws-rfdk/blob/mainline/packages/aws-rfdk/lib/deadline/README.md)
