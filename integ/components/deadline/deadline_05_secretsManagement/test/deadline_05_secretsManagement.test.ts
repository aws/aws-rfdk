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

const testCases: Array<Array<any>> = [
  [ 'Secrets Management is enabled', 1 ],
];
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
});

describe.each(testCases)('Deadline Secrets Management tests (%s)', (_, id) => {
  test(`SM-${id}-1: Deadline Repository configures Secrets Management`, async () => {
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
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArns[id]}' ListAllAdminUsers`,
        ],
      },
    };
    const secret = await secretsManager.getSecretValue({ SecretId: smSecretArns[id] }).promise();
    const smCreds = JSON.parse(secret.SecretString!);
    const adminUserRegex = new RegExp(`${smCreds.username}\\s+Registered`);

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // THEN
    expect(response.output).toMatch(adminUserRegex);
  });

  test(`SM-${id}-2: Deadline Render Queue has a Server role`, async () => {
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
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArns[id]}' ListAllMachines "*" Server`,
        ],
      },
    };

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // THEN
    // Assert there is exactly one Server identity (the RCS)
    expect(response.output.match(/ec2-user\s+\[Server\]\s+Registered/)?.length).toBe(1);
  });
});
