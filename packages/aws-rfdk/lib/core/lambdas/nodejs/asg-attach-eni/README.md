# Contents

This directory contains the implementation of the EC2_LAUNCH_INSTANCE Lifecycle Hook handler for the RFDK StaticIpServer construct.

This lambda is responsible for attaching an Elastic Network Interface (ENI) to the single instance in the StaticIpServer's Auto Scaling Group when that
instance is launched. The ID for the ENI is required to be passed to it in the NotificationMetadata of the lifecycle hook event. Specifically, NotificationMetadata
is required to be stringified JSON of the following:

```ts
{
    eniId: string
}
```
