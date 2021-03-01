# RFDK Sample Application - Deadline Spot Event Plugin

This is a sample RFDK application that deploys the basic infrastructure for a Deadline render farm that uses Deadline's Spot Event Plugin for auto scaling workers.

---

_**Note:** This application is an illustrative example to showcase some of the capabilities of the RFDK. **It is not intended to be used for production render farms**, which should be built with more consideration of the security and operational needs of the system._

---

## Architecture

This sample application deploys a basic Deadline Render farm that is configured to use Deadline's [Spot Event Plugin](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html).

### Components

All components in the render farm live within a [VPC](https://aws.amazon.com/vpc/).

#### Repository

The Repository component contains the database and file system that store persistent data used by Deadline. These resources are initialized by the Deadline Repository installer. The database in this example uses [Amazon DocumentDB](https://aws.amazon.com/documentdb/).

#### Render Queue

The Render Queue component contains the fleet of [Deadline Remote Connection Server](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/remote-connection-server.html) instances behind an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). This acts as the central service for Deadline applications and is the only component that interacts with the Repository. When comparing this component to the "All in AWS Infrastructure - Basic" example, it has been granted additional permissions in order to use the Spot Event Plugin.

#### Spot Event Plugin Configurations

Spot Event Plugin Configuration Setup component generates and saves the [Spot Fleet Request Configurations](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#spot-fleet-request-configurations). The Spot Workers that are created will be configured to connect to the Render Queue. The Spot Event Plugin requires additional Role for Deadline's Resource Tracker.

## Prerequisites

- The Spot Fleet Configuration requires an [Amazon Machine Image (AMI)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AMIs.html) with the Deadline Worker application installed. This AMI must have Deadline Installed and should be configured to connect to your repository. For additional information on setting up your AMI please see the [Spot Event Plugin Documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html).
- You have setup and configured the AWS CLI
- Your AWS account already has CDK bootstrapped in the desired region by running `cdk bootstrap`
- You must have NodeJS installed on your system
- You must have Docker installed on your system
- You must have Python 3.7+ installed on your system (Python app only)

## Typescript

[Continue to Typescript specific documentation.](ts/README.md)

## Python

[Continue to Python specific documentation.](python/README.md)