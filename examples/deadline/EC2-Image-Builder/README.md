# RFDK Sample Application - EC2 Image Builder

Keeping software updated on custom AMIs can be a pain if you're creating them manually. The EC2 Image Builder service is an option for automating this process. The CDK constructs for Image Builder can be worked into an RFDK app to build the required AMIs for the worker fleet on the fly.

This is a sample RFDK application that utilizes [EC2 Image Builder](https://docs.aws.amazon.com/imagebuilder/latest/userguide/what-is-image-builder.html) to install and configure the Deadline client onto an AMI that can then be used as the image for a worker fleet. The process of creating an AMI can be lengthy, sometimes extending the deployment of a render farm by 30 minutes, but if you have multiple custom AMI's that you maintain, you may find it easier to let your RFDK application install new versions of the Deadline client onto them, rather than having to do it manually.

Another option is using EC2 Image Builder from the AWS Console to create an image pipeline. We don't touch on that here, but you may want to see the [Create an image pipeline user guide](https://docs.aws.amazon.com/imagebuilder/latest/userguide/start-build-image-pipeline.html) and see if this option would be a better fit for you.

---

_**Note:** This application is an illustrative example to showcase some of the capabilities of the RFDK. **It is not intended to be used for production render farms**, which should be built with more consideration of the security and operational needs of the system._

---

## Architecture

This sample application uses an [EC2 ImageBuilder Image](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-imagebuilder-image.html) to create an AMI in the DeadlineMachineImage stack that is used by the WorkerInstanceFleet in the same stack.

### BaseFarmStack

The contents of the BaseFarmStack include all the required components for a render farm, without any worker nodes. To learn more about these components, refer to the [All-In-AWS-Infrastructure-Basic](../All-In-AWS-Infrastructure-Basic/README.md) example.

### ComputeStack

The ComputeStack holds the images being created as well as the worker fleets the images get used by. It's important to keep the image and worker fleet in the same stack if you want to be able to do updates to the image. If you were to move the worker fleet into a dependent stack, the update wouldn't be able to be performed while it was currently in use in a different stack. In this case, the worker fleet would need to be taken down first.

### DeadlineMachineImage

This construct creates all the infrastructure required by Image Builder to install Deadline onto an existing AMI and then create a WorkerInstanceFleet that uses it. The configuration for the image creation is as simple as providing the Deadline version, a parent AMI, the OS of the parent AMI, and a version number for your AMI. The parent AMI can be supplied by anything that supplied an `IMachineImage`, such as `MachineImage.genericLinux()` or `MachineImage.lookup()`. An image version also needs to be supplied. One strategy to use with versioning your image is to start with version `1.0.0` and bump the version if you need to change any of the input parameters, such as changing the parent AMI or Deadline version. Images for different OSes can be versioned separately.

CDK does not have L2 constructs for Image Builder yet, so we are using the L1 constructs. An L1 construct is generated directly from the CloudFormation definition of the service, so referring to the [AWS CloudFormation user guide](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/AWS_ImageBuilder.html) will provide more details. You can read more about L1 vs L2 constructs in the [CDK Constructs user guide](https://docs.aws.amazon.com/cdk/latest/guide/constructs.html#constructs_lib).

#### Updates

If you would like to upgrade the version of Deadline your worker fleet is using, you will need to bump the image version to a value such as `1.0.1` along with changing the Deadline version. Since the worker fleet is backed by an auto scaling group, the new image will get built and the auto scaling group's launch configuration will get updated; however, this doesn't replace existing instances, it will only affect new ones that get deployed. To have current workers get replaced with the new version, you have a few options:

1. Set your `desiredCapacity` and `minCapacity` on the worker fleet to `0` before you perform the redeployment that will create your new AMI, and then do a follow up deployment with these fields set to their previous values (or removed).
1. Before performing your redeployment that will generate the new AMI, manually terminate the worker instances from the console. This will cause new ones to get started during the redeployment.

#### AMI Storage

When performing an update to, or deletion of, the DeadlineMachineImage construct, any AMI that was created by a previous deployment of the construct will not be deleted. They are still available in EC2 and can be seen under `Images > AMIs` in the EC2 console or in the `My AMIs` section of the Launch instance wizard. You can continue to use them like any other AMI, or deregister them if you no longer require them. The cost of storing these AMIs depends on the size of the disk you took a snapshot of to create them, for EBS-backed AMIs you can find snapshot costs on their [EBS pricing page](https://aws.amazon.com/ebs/pricing/). For S3-backed AMI's, you'll pay for the storage fees of the data that needs to be stored based on [S3 pricing](https://aws.amazon.com/s3/pricing/), whether you have an instance running or not.

## EC2 Image Builder Pipeline

An alternative to creating single images during the deployment of your render farm is to create an [EC2 Image Builder pipeline](https://docs.aws.amazon.com/imagebuilder/latest/userguide/start-build-image-pipeline.html) that would run on a specified schedule. You can choose to either only create an image if any components have new versions released since the last run, or create a new image regardless.

At this point in time, we do not provide Amazon-managed Deadline components for you to consume, so if you do choose to go this route, you would need to create a new version of your Deadline component for each release of Deadline, but you may decide this is worthwhile, depending on how many image variations you use for your workers. Due to the Image Builder pipeline still being an L1 construct in CDK, the AWS Console is recommended for building your pipeline.

Once you have an image created from a pipeline, it can be consumed in your RFDK application using a [LookupMachineImage](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.LookupMachineImage.html). The result of this lookup will always pick the most recent image if there are multiple matches, so you can always be sure that when your pipeline creates a newer image, your RFDK app deployment will pick it up. Note that the lookup stores the selected image in the CDK context, so if you would like to try and pick up a new image on an update deployment, you'll have to [clear the context](https://docs.aws.amazon.com/cdk/latest/guide/context.html#context_viewing) to get it.

## Typescript

[Continue to Typescript specific documentation.](ts/README.md)

## Python

[Continue to Python specific documentation.](python/README.md)