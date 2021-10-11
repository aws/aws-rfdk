/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CidrBlock,
  NetworkUtils,
} from '@aws-cdk/aws-ec2/lib/network-util';
import * as CloudFormation from 'aws-sdk/clients/cloudformation';
import * as SecretsManager from 'aws-sdk/clients/secretsmanager';
import * as AWS from 'aws-sdk/global';
import awaitSsmCommand from '../../common/functions/awaitSsmCommand';

// Name of testing stack is derived from env variable to ensure uniqueness
const testingStackName = 'RFDKInteg-SM-TestingTier' + process.env.INTEG_STACK_TAG?.toString();

const cloudformation = new CloudFormation({ apiVersion: '2017-10-17' });
const secretsManager = new SecretsManager({ apiVersion: '2017-10-17' });

const bastionRegex = /bastionId/;
const smSecretRegex = /deadlineSecretsManagementCredentialsSM(\d)/;

const renderQueueAlbSubnetIdsRegex = /renderQueueAlbSubnetIdsSM(\d)/;
const ublSubnetIdsRegex = /ublSubnetIdsSM(\d)/;
const sepFleetSubnetIdsRegex = /sepFleetSubnetIdsSM(\d)/;
const workerInstanceFleetSubnetIdsRegex = /workerInstanceFleetSubnetIdsSM(\d)/;

const renderQueueAlbSubnetCidrBlocksRegex = /renderQueueAlbSubnetCidrBlocksSM(\d)/;
const ublSubnetCidrBlocksRegex = /ublSubnetCidrBlocksSM(\d)/;
const sepFleetSubnetCidrBlocksRegex = /sepFleetSubnetCidrBlocksSM(\d)/;
const workerInstanceFleetSubnetCidrBlocksRegex = /workerInstanceFleetSubnetCidrBlocksSM(\d)/;

const identityRegistrationSettingsNameRegex = /RfdkSubnet\|(?<connectionSubnetId>subnet-[0-9a-z]+)\|(?<sourceSubnetId>subnet-[0-9a-z]+)/;

let bastionId: string;
let smSecretArn: string;

const renderQueueAlbSubnetIds: string[] = [];
const ublSubnetIds: string[] = [];
const sepFleetSubnetIds: string[] = [];
const workerInstanceFleetSubnetIds: string[] = [];

const renderQueueAlbSubnetCidrBlocks: string[] = [];
const ublSubnetCidrBlocks: string[] = [];
const sepFleetSubnetCidrBlocks: string[] = [];
const workerInstanceFleetSubnetCidrBlocks: string[] = [];

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
      smSecretArn = outputValue;

      // Subnet IDs
    } else if (renderQueueAlbSubnetIdsRegex.test(outputKey)) {
      renderQueueAlbSubnetIds.push(...JSON.parse(outputValue) as string[]);
    } else if (ublSubnetIdsRegex.test(outputKey)) {
      ublSubnetIds.push(...JSON.parse(outputValue) as string[]);
    } else if (sepFleetSubnetIdsRegex.test(outputKey)) {
      sepFleetSubnetIds.push(...JSON.parse(outputValue) as string[]);
    } else if (workerInstanceFleetSubnetIdsRegex.test(outputKey)) {
      workerInstanceFleetSubnetIds.push(...JSON.parse(outputValue) as string[]);

      // Subnet CIDR blocks
    } else if (renderQueueAlbSubnetCidrBlocksRegex.test(outputKey)) {
      renderQueueAlbSubnetCidrBlocks.push(...JSON.parse(outputValue) as string[]);
    } else if (ublSubnetCidrBlocksRegex.test(outputKey)) {
      ublSubnetCidrBlocks.push(...JSON.parse(outputValue) as string[]);
    } else if (sepFleetSubnetCidrBlocksRegex.test(outputKey)) {
      sepFleetSubnetCidrBlocks.push(...JSON.parse(outputValue) as string[]);
    } else if (workerInstanceFleetSubnetCidrBlocksRegex.test(outputKey)) {
      workerInstanceFleetSubnetCidrBlocks.push(...JSON.parse(outputValue) as string[]);
    }
  });

  // Assert the required outputs are found, failing if any are missing
  const errors = [];
  if (!bastionId) {
    errors.push('A stack output for "bastionId" is required but was not found');
  }
  if (!smSecretArn) {
    errors.push('A stack output for deadlineSecretsManagementCredentialsSM1 is required but was not found');
  }
  if (!renderQueueAlbSubnetIds.length) {
    errors.push('A stack output for renderQueueAlbSubnetIdsSM1 is required but was not found');
  }
  if (!ublSubnetIds.length) {
    errors.push('A stack output for ublSubnetIdsSM1 is required but was not found');
  }
  if (!sepFleetSubnetIds.length) {
    errors.push('A stack output for sepFleetSubnetIdsSM1 is required but was not found');
  }
  if (!workerInstanceFleetSubnetIds.length) {
    errors.push('A stack output for workerInstanceFleetSubnetIdsSM1 is required but was not found');
  }
  if (!renderQueueAlbSubnetCidrBlocks.length) {
    errors.push('A stack output for renderQueueAlbSubnetCidrBlocksSM1 is required but was not found');
  }
  if (!ublSubnetCidrBlocks.length) {
    errors.push('A stack output for ublSubnetCidrBlocksSM1 is required but was not found');
  }
  if (!sepFleetSubnetCidrBlocks.length) {
    errors.push('A stack output for sepFleetSubnetCidrBlocksSM1 is required but was not found');
  }
  if (!workerInstanceFleetSubnetCidrBlocks.length) {
    errors.push('A stack output for workerInstanceFleetSubnetCidrBlocksSM1 is required but was not found');
  }
  if (errors.length > 0) {
    throw new Error(`Test failed to initialize for the following reasons:\n${errors.join('\n')}`);
  }
});

describe('Deadline Secrets Management tests', () => {
  test('SM-1-1: Deadline Repository configures Secrets Management', async () => {
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
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArn}' ListAllAdminUsers`,
        ],
      },
    };
    const secret = await secretsManager.getSecretValue({ SecretId: smSecretArn }).promise();
    const smCreds = JSON.parse(secret.SecretString!);
    const adminUserRegex = new RegExp(`${smCreds.username}\\s+Registered`);

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // THEN
    expect(response.output).toMatch(adminUserRegex);
  });

  test('SM-1-2: Deadline Render Queue has a Server role', async () => {
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
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArn}' ListAllMachines "*" Server`,
        ],
      },
    };

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // THEN
    // Assert there is exactly one Server identity (the RCS)
    expect(response.output).toMatchTimes(/ec2-user\s+\[Server\]\s+Registered/g, 1);
  });

  test.each<[number, string, string[]]>([
    [3, 'Usage Based Licensing', ublSubnetIds],
    [4, 'Worker Instance Fleet', workerInstanceFleetSubnetIds],
    [5, 'Spot Event Plugin Fleet', sepFleetSubnetIds],
  ])('SM-1-%s: Deadline %s has an identity registration setting', async (_testId, _componentName, clientSubnetIdMap) => {
    /**********************************************************************************************************
     * Description:     Confirm that a Deadline client has an identity registration settings created for it
     * Input:           Output from "deadlinecommand secrets GetLoadBalancerIdentityRegistrationSettings" call
     *                  delivered via SSM command
     * Expected result: List of identity registration settings contains an entry for the Deadline client
     *                  machine's subnet and it has the Client role assigned to it
    **********************************************************************************************************/
    // GIVEN
    const params = {
      DocumentName: 'AWS-RunShellScript',
      Comment: 'Execute GetLoadBalancerIdentityRegistrationSettings via test script SM-run-secrets-command.sh',
      InstanceIds: [bastionId],
      Parameters: {
        commands: [
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArn}' GetLoadBalancerIdentityRegistrationSettings`,
        ],
      },
    };
    const rqAlbSubnetIds = renderQueueAlbSubnetIds;
    const expectedSubnetPairs: { connectionSubnetId: string, sourceSubnetId: string }[] = [];
    rqAlbSubnetIds.forEach(albSubnetId => {
      clientSubnetIdMap.forEach(clientSubnetId => {
        expectedSubnetPairs.push(expect.objectContaining({
          connectionSubnetId: albSubnetId,
          sourceSubnetId: clientSubnetId,
        }));
      });
    });

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // Parse the output into connection and source subnet ID pairs
    const result = JSON.parse(response.output) as any[];
    const settingSubnetPairs = result.filter(setting =>
      'SettingsName' in setting &&
      identityRegistrationSettingsNameRegex.test(setting.SettingsName),
    ).map(setting => {
      const matches = identityRegistrationSettingsNameRegex.exec(setting.SettingsName);
      return {
        connectionSubnetId: matches!.groups!.connectionSubnetId,
        sourceSubnetId: matches!.groups!.sourceSubnetId,
      };
    });

    // THEN
    // Verify that the identity registration settings received contain the expected settings
    expect(settingSubnetPairs).toEqual(expect.arrayContaining(expectedSubnetPairs));
  });

  test.each<[number, string, string[]]>([
    [6, 'Usage Based Licensing', ublSubnetCidrBlocks],
    [7, 'Worker Instance Fleet', workerInstanceFleetSubnetCidrBlocks],
    // TODO: In the future, we should add the ability to submit Deadline jobs so that a SEP fleet can be spun up and used for this test
    // [8, 'Spot Event Plugin Fleet', sepFleetSubnetCidrBlocks],
  ])('SM-1-%s: Deadline %s is automatically registered as a Client', async (_testId, _componentName, clientSubnetCidrBlockMap) => {
    /**********************************************************************************************************
     * Description:     Confirm that a Deadline client is automatically registered as a Client role.
     * Input:           Output from "deadlinecommand secrets "ListAllMachines" call delivered via SSM command
     * Expected result: List of identities contains an entry where the source IP and connection IP are within the
     *                  Deadline client machine's subnet CIDR and the Render Queue ALB subnet CIDR, respectively.
     *                  Also assert that this entry shows the Deadline client is registered as a Client role.
    **********************************************************************************************************/
    // GIVEN
    const params = {
      DocumentName: 'AWS-RunShellScript',
      Comment: 'Execute ListAllMachines via test script SM-run-secrets-command.sh',
      InstanceIds: [bastionId],
      Parameters: {
        commands: [
          `sudo -u ec2-user ~ec2-user/testScripts/SM-run-secrets-command.sh '${AWS.config.region}' '${smSecretArn}' ListAllMachines "*" Client`,
        ],
      },
    };
    const rqAlbSubnetCidrBlocks = renderQueueAlbSubnetCidrBlocks;
    const expectedSubnetCidrPairs: { connectionSubnetCidrBlock: string, sourceSubnetCidrBlock: string }[] = [];
    rqAlbSubnetCidrBlocks.forEach(albSubnetCidrblock => {
      clientSubnetCidrBlockMap.forEach(clientSubnetCidrBlock => {
        expectedSubnetCidrPairs.push({
          connectionSubnetCidrBlock: albSubnetCidrblock,
          sourceSubnetCidrBlock: clientSubnetCidrBlock,
        });
      });
    });

    // WHEN
    const response = await awaitSsmCommand(bastionId, params);

    // Parse the output into connection and source subnet ID pairs
    const lines = response.output.split('\n').slice(2);
    const identityInfos = lines.filter(line => line).map(line => parseListAllMachinesLine(line));

    // THEN
    // Verify that there exists at least one identity that is registered for this component by checking that its
    // source IP and connection IP are within the expected subnet CIDR blocks.
    expect(identityInfos.some(identityInfo => {
      return expectedSubnetCidrPairs.some(expected => {
        const connectionIpNum = NetworkUtils.ipToNum(identityInfo.connectionIpAddress);
        const connectionSubnetCidr = new CidrBlock(expected.connectionSubnetCidrBlock);

        const sourceIpNum = NetworkUtils.ipToNum(identityInfo.sourceIpAddress);
        const sourceIpSubnetCidr = new CidrBlock(expected.sourceSubnetCidrBlock);

        return sourceIpSubnetCidr.minAddress() <= sourceIpNum && sourceIpNum <= sourceIpSubnetCidr.maxAddress() &&
          connectionSubnetCidr.minAddress() <= connectionIpNum && connectionIpNum <= connectionSubnetCidr.maxAddress();
      });
    })).toBeTruthy();
  });
});

/**
 * Parses a line containing data from the ListAllMachines Deadline Secrets Command into an object.
 * @param line The line to parse.
 * @returns An object containing the data from a Deadline Secrets Command ListAllMachines output line.
 * @see https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#listallmachines
 */
function parseListAllMachinesLine(line: string): {
  readonly machineName: string,
  readonly sourceIpAddress: string,
  readonly connectionIpAddress: string,
  readonly osUser: string,
  readonly roles: string[],
  readonly status: string,
  readonly id: string,
} {
  const tokens = line.split(/\s+/).filter(token => token.trim().length > 0);
  return {
    machineName: tokens[0],
    sourceIpAddress: tokens[1],
    connectionIpAddress: tokens[2],
    osUser: tokens[3],
    // Parse the list of roles that are presented as an array of unquoted strings
    roles: tokens[4].substring(1, tokens[4].length - 1).split(', '),
    status: tokens[5],
    id: tokens[6],
  };
}
