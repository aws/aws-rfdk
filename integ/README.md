# RFDK Integration Tests

To run all test suites:

1. Build and install dependencies by running build.sh from the top-level RFDK directory
1. Configure AWS credentials. There are a few options for this:
    *   Configure credentials [using environment variables](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html)
    *   Run the integration tests on an [EC2 Instance with an IAM role](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-iam.html)
    *   Configure credentials using the [shared credentials file](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html)
1. *[Optional]* Set the environment variable `CDK_DEFAULT_REGION` to the region the test should be deployed in (defaults to `us-west-2`)
1. Modify the `test-config.sh` configuration file. Alternatively, the same variables can be set using environment
   variables, but the `SKIP_TEST_CONFIG` environment variable must be set to `true`. In bash, this can done with the
   following command:

   ```sh
   export SKIP_TEST_CONFIG=true
   ```

   Currently the following options can be configured:
    * **REQUIRED:** for the Deadline repository test component:
      *   `USER_ACCEPTS_SSPL_FOR_RFDK_TESTS`

          Should be set to `true` to accept the MongoDB SSPL. Setting this variable is
          considered acceptance of the terms of the
          [SSPL license](https://www.mongodb.com/licensing/server-side-public-license).
    * *[Optional]* configuration for **all** Deadline test components:
      *   `DEADLINE_VERSION`  

          Version of the Deadline repository installer used for the test
      *   `DEADLINE_STAGING_PATH`

          Complete path to local staging folder for Deadline assets (see
          [DockerImageRecipes](../packages/aws-rfdk/docs/DockerImageRecipes.md) for more information)
    * *[Optional]* configuration for the Deadline worker fleet test component:
      *   `LINUX_DEADLINE_AMI_ID`

          The ID of a Linux AMI that has the Deadline client installed. The Deadline version should match the version
          specified in `DEADLINE_VERSION`.
      *   `WINDOWS_DEADLINE_AMI_ID`

          The ID of a Windows AMI that has the Deadline client installed. The Deadline version should match the version
          specified in `DEADLINE_VERSION`.

1.  From the `integ` directory, run:

        yarn e2e

    This will orchestrate the integration tests including:

    1.  Deploying the CloudFormation stacks
    1.  Execute tests against the stacks
    1.  Tear down the CloudFormation stacks
    1.  Output the results

    Testing artifacts will be persisted in the `integ/.e2etemp` directory.
    Subsequent executions of the integration tests will delete this directory,
    so take care to persist the artifacts if desired.

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
