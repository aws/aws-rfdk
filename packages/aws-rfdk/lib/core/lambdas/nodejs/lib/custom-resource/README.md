
## Storing Data

A CfnCustomResource does not come with built-in state that survives between
invocations of the CustomResource.
If the CustomResource creates AWS Resources (ex: an instance, or Secret) during 'Create',
then those Resources must be 'cleaned-up' (i.e. terminated/deleted) during 'Delete'.
To be able to do that, we must have some sort of external mechanism for tracking the
resources created by the CustomResource.

We store information about what resources were created by a CustomResource
in a DynamoDB Table. A suggested schema of that table is as follows:

+---------------------------------+---------+
|  ==Attribute==                  |  Type   |
+---------------------------------+---------+
| PropertiesHash (Partition Key)  | string  |
+---------------------------------+---------+
| Purpose (Sort Key)              | string  |
+---------------------------------+---------+
| ResourceARN                     | string  |
+---------------------------------+---------+

Table attribute descriptions:
 * PropertiesHash
     - A hash for the specific 'ResourceProperties' of the CfnCustomResource when
       the item's AWS Resource was created. Use the calculate_property_hash(dict)
       function in this module to calculate this value.
 * Purpose
     - An application-defined string that the application can use to disambiguate
       resources.
 * ResourceARN
     - The ARN of a resource created by this CustomResource

A suggestion is that the Name of this table will be given to the lambda in
the form of an environment variable.

## Information on CfnCustomResources

Custom Resource Request fields:
  https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-requests.html

Custom Resource Response fields:
  https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-responses.html

Custom Resource Best Practices:
  https://aws.amazon.com/premiumsupport/knowledge-center/best-practices-custom-cf-lambda/

## CfnCustomResource Resource Replacement

From: https://aws.amazon.com/premiumsupport/knowledge-center/best-practices-custom-cf-lambda/

When an update triggers replacement of a physical resource, AWS CloudFormation compares the PhysicalResourceId returned by your Lambda function to the previous PhysicalResourceId. If the IDs differ, AWS CloudFormation assumes the resource has been replaced with a new physical resource.

However, the old resource is not implicitly removed to allow a rollback if necessary. When the stack update is completed successfully, a Delete event request is sent with the old physical ID as an identifier. If the stack update fails and a rollback occurs, the new physical ID is sent in the Delete event.

Carefully consider when you return a new PhysicalResourceId. Use PhysicalResourceId to uniquely identify resources so that only the correct resources are deleted during a replacement update when a Delete event is received.

## CfnCustomResource Idempotency

From: https://aws.amazon.com/premiumsupport/knowledge-center/best-practices-custom-cf-lambda/

An idempotent function can be repeated any number of times with the same inputs, and the result will be the same as if it had been done only once. Idempotency is valuable when working with AWS CloudFormation to ensure that retries, updates, and rollbacks don't create duplicate resources or introduce errors.

For example, assume AWS CloudFormation invokes your function to create a resource, but doesn't receive a response that the resource was created successfully. AWS CloudFormation might invoke the function again and create a second resource. The first resource may become orphaned.