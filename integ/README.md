# RFDK Integration Tests

To run all test suites:

1. Build and install dependencies by running build.sh from the top-level RFDK directory

1. Configure AWS credentials (tests will use the default AWS profile, so either set up a default profile in .aws/credentials or use temporary credentials).

1. Set the environment variable CDK_DEFAULT_REGION to the region the test should be deployed in

1. Configure test-config.sh. This script configures which test modules will run and overrides certain default values. Currently these include:
    * Options required for all Deadline test components:
      * DEADLINE_VERSION - version of the Deadline repository installer used for the test
      * DEADLINE_STAGING_PATH - Complete path to local staging folder for Deadline assets (see `packages/aws-rfdk/docs/DockerImageRecipes.md` for more information)
    * Options required for the Deadline repository test component:
      * USER_ACCEPTS_SSPL_FOR_RFDK_TESTS - should be set to true. Setting this variable is considered acceptance of the terms of the SSPL license. Follow [this link](https://www.mongodb.com/licensing/server-side-public-license) to read the terms of the SSPL license.
    * Options required for the Deadline worker fleet test component (use `aws --region <region> ec2 describe-images --owners 357466774442 --filters "Name=name,Values=*Worker*" "Name=name,Values=*<version>*" --query 'Images[*].[ImageId, Name]' --output text` to discover AMI's):
      * LINUX_DEADLINE_AMI_ID - set to the ID of an available Linux worker fleet AMI with Deadline installed.
      * WINDOWS_DEADLINE_AMI_ID - set to the ID of an available Windows worker fleet AMI with Deadline installed.

1. Execute `yarn run e2e` from the `integ` directory. This will handle deploying the necessary stacks, run the appropriate tests on them, and then tear them down.

# Example Output:

```bash
Pretest setup runtime: 0m 8s
Infrastructure stack deploy runtime: 0m 9s
Infrastructure stack cleanup runtime: 1m 46s
Results for test component deadline_01_repository: 
  -Tests ran: 21
  -Tests passed: 21
  -Tests failed: 0
  -Deploy runtime:     0m 34s
  -Test suite runtime: 0m 30s
  -Cleanup runtime:    9m 0s
Results for test component deadline_02_renderQueue: 
  -Tests ran: 8
  -Tests passed: 8
  -Tests failed: 0
  -Deploy runtime:     23m 41s
  -Test suite runtime: 0m 55s
  -Cleanup runtime:    16m 2s
Results for test component deadline_03_workerFleet: 
  -Tests ran: 16
  -Tests passed: 16
  -Tests failed: 0
  -Deploy runtime:     49m 44s
  -Test suite runtime: 3m 3s
  -Cleanup runtime:    55m 34s
```
