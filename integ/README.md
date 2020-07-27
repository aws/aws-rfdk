# RFDK Integration Tests

To run all test suites:

1. Build and install dependencies by running build.sh from the top-level AWS-RFDK directory

2. Configure AWS credentials (tests will use the default AWS profile, so either set up a default profile in .aws/credentials or use temporary credentials).

3. Configure test-config.sh. This script sets environment variables which are necessary for the tests. Currently this includes:
  * Options required for all Deadline test components:
    * DEADLINE_VERSION - version of the Deadline repository installer used for the test
    * DEADLINE_STAGING_PATH - Complete path to local staging folder for Deadline assets (see `packages/aws-rfdk/docs/DockerImageRecipes.md` for more information)
  * Options required for the Deadline repository test component:
    * USER_ACCEPTS_SSPL_FOR_RFDK_TESTS - should be set to true. Setting this variable is considered acceptance of the terms of the SSPL license. Follow [this link](https://www.mongodb.com/licensing/server-side-public-license) to read the terms of the SSPL license.  

4. Execute `yarn run e2e` from the `integ` directory. This will handle deploying the necessary stacks, run the appropriate tests on them, and then tear them down.

5. Test output is stored in the `test-output` folder, stamped with the same ID tag attached to the stacks created during the test.

# Example Output:

```bash
PASS components/deadline/repository/test/deadline-repository.test.ts (13.218 s)
  DocDB tests
    ✓ DL-1-1: Deadline DB is initialized (3 ms)
    ✓ DL-2-1: Deadline DB is initialized
  EFS tests
    ✓ DL-1-2: EFS is initialized (1 ms)
    ✓ DL-2-2: EFS is initialized
    ✓ DL-1-3: repository.ini version matches Deadline installer (1 ms)
    ✓ DL-2-3: repository.ini version matches Deadline installer
  CloudWatch LogGroup tests
    ✓ DL-1-4: Verify CloudWatch LogGroup contains two LogStreams
    ✓ DL-2-4: Verify CloudWatch LogGroup contains two LogStreams
    ✓ DL-1-5: Verify cloud-init-output LogStream (1622 ms)
    ✓ DL-2-5: Verify cloud-init-output LogStream (1608 ms)
    ✓ DL-1-6: Verify DeadlineRepositoryInstallationLogs LogStream (510 ms)
    ✓ DL-2-6: Verify DeadlineRepositoryInstallationLogs LogStream (672 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        13.803 s, estimated 19 s
```