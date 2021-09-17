/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudFormation from 'aws-sdk/clients/cloudformation';
import * as SecretsManager from 'aws-sdk/clients/secretsmanager';
import * as AWS from 'aws-sdk/global';
import awaitSsmCommand from '../../common/functions/awaitSsmCommand';

// Name of testing stack is derived from env variable to ensure uniqueness
const testingStackName = 'RFDKInteg-SM-TestingTier' + process.env.INTEG_STACK_TAG?.toString();

const cloudformation = new CloudFormation();
const secretsManager = new SecretsManager();

const bastionRegex = /bastionId/;
const smSecretRegex = /deadlineSecretsManagementCredentialsSM(\d)/;

const testSuiteId = 1;

let bastionId: string;
let smSecretArns: Array<any> = [];

beforeAll(async () => {
  // Query the TestingStack and await its outputs to use as test inputs
  const describeStacksResponse = await cloudformation.describeStacks({ StackName: testingStackName }).promise();
  let stackOutput = describeStacksResponse.Stacks![0].Outputs!;
  stackOutput.forEach(output => {
    let outputKey = output.OutputKey!;
    let outputValue = output.OutputValue!;

    if (bastionRegex.test(outputKey)) {
      bastionId = outputValue;
    } else if (smSecretRegex.test(outputKey)) {
      let testId = smSecretRegex.exec(outputKey)![1];
      smSecretArns[+testId] = outputValue;
    }
  });

  // Assert the required outputs are found, failing if any are missing
  const errors = [];
  if (!bastionId) {
    errors.push('A stack output for "bastionId" is required but was not found');
  }
  if (!smSecretArns[testSuiteId]) {
    errors.push(`A stack output for deadlineSecretsManagementCredentialsSM${testSuiteId} is required but was not found`);
  }
  if (errors.length > 0) {
    throw new Error(`Test failed to initialize for the following reasons:\n${errors.join('\n')}`);
  }
});

describe('Deadline Secrets Management tests', () => {
  test(`SM-${testSuiteId}-1: Deadline Repository configures Secrets Management`, async () => {
    /**********************************************************************************************************
     * TestID:          SM-1
     * Description:     Confirm that Deadline Repository configures Secrets Management
     * Input:           Output from "deadlinecommand secrets ListAllAdminUsers" call delivered via SSM command
     * Expected result: List of admin users which shows that the user created by RFDK is registered
    **********************************************************************************************************/
    // GIVEN
    const params = {
      DocumentName: 'AWS-RunShellScript',
      Comment: 'Execute ListAllAdminUsers via test script SM-run-secrets-command.sh',
      InstanceIds: [bastionId],
      Parameters: {
        commands: [
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArns[testSuiteId]}' ListAllAdminUsers`,
        ],
      },
    };
    const secret = await secretsManager.getSecretValue({ SecretId: smSecretArns[testSuiteId] }).promise();
    const smCreds = JSON.parse(secret.SecretString!);
    const adminUserRegex = new RegExp(`${smCreds.username}\\s+Registered`);

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // THEN
    expect(response.output).toMatch(adminUserRegex);
  });

  test(`SM-${testSuiteId}-2: Deadline Render Queue has a Server role`, async () => {
    /**********************************************************************************************************
     * TestID:          SM-2
     * Description:     Confirm that Deadline Render Queue configures itself as a Server role
     * Input:           Output from "deadlinecommand secrets ListAllMachines" call delivered via SSM command
     * Expected result: List of machine identities contains an entry for the Render Queue machine and it has
     *                  the Server role assigned to it
    **********************************************************************************************************/
    // GIVEN
    const params = {
      DocumentName: 'AWS-RunShellScript',
      Comment: 'Execute ListAllMachines via test script SM-run-secrets-command.sh',
      InstanceIds: [bastionId],
      Parameters: {
        commands: [
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArns[testSuiteId]}' ListAllMachines "*" Server`,
        ],
      },
    };

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // THEN
    // Assert there is exactly one Server identity (the RCS)
    expect(response.output).toMatchTimes(/ec2-user\s+\[Server\]\s+Registered/g, 1);
  });
});
