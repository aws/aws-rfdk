/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { CloudFormation } from '@aws-sdk/client-cloudformation';

import { ssmCommand } from '../../common/functions/awaitSsmCommand';

// Name of testing stack is derived from env variable to ensure uniqueness
const testingStackName = 'RFDKInteg-WFS-TestingTier' + process.env.INTEG_STACK_TAG!.toString();

const cloudformation = new CloudFormation({});

const bastionRegex = /bastionId/;
const rqRegex = /renderQueueEndpointWFS(\d)/;
const certRegex = /CertSecretARNWFS(\d)/;

const testCases: Array<Array<any>> = [
  [ 'Linux Worker HTTPS (TLS) mode', 1 ],
  [ 'Windows Worker HTTPS (TLS) mode', 2 ],
];
let bastionId: any;
let renderQueueEndpoints: Array<string> = [];
let secretARNs: Array<string> = [];

beforeAll( async () => {
  // Query the TestingStack and await its outputs to use as test inputs
  var params = {
    StackName: testingStackName,
  };
  var data = await cloudformation.describeStacks(params);
  var stackOutput = data.Stacks![0].Outputs!;
  stackOutput.forEach( output => {
    var outputKey = output.OutputKey!;
    var outputValue = output.OutputValue!;
    switch(true){
      case bastionRegex.test(outputKey):
        bastionId = outputValue;
        break;
      case rqRegex.test(outputKey):
        var testId = rqRegex.exec(outputKey)![1];
        renderQueueEndpoints[+testId] = outputValue;
        break;
      case certRegex.test(outputKey):
        var testId = certRegex.exec(outputKey)![1];
        secretARNs[+testId] = outputValue;
        break;
      default:
        break;
    }
  });
});

describe.each(testCases)('Deadline WorkerFleetHttps tests (%s)', (_, id) => {

  beforeAll( async () => {
    if(secretARNs[id]) {
      //If the secretARN has been provided for the auth certificate, this command will fetch it to the instance before continuing the tests
      const region = await cloudformation.config.region();
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script fetch-cert.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './utilScripts/fetch-cert.sh \'' + region + '\' \'' + secretARNs[id] + '\'',
          ],
        },
      };
      return await ssmCommand(bastionId, params);
    }
    else {
      throw new Error(`Did not find a secrect ARN for ${testingStackName}`);
    }
  });

  // This removes the certification file used to authenticate to the render queue
  afterAll( async () => {
    var params = {
      DocumentName: 'AWS-RunShellScript',
      Comment: 'Execute Test Script cleanup-cert.sh',
      InstanceIds: [bastionId],
      Parameters: {
        commands: [
          'sudo -i',
          'su - ec2-user >/dev/null',
          'cd ~ec2-user',
          './utilScripts/cleanup-cert.sh',
        ],
      },
    };
    return await ssmCommand(bastionId, params);
  });

  describe('Worker node tests', () => {

    // Before testing the render queue, send a command to configure the Deadline client to use that endpoint
    beforeAll( async () => {
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script configure-deadline.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './utilScripts/configure-deadline.sh \'' + renderQueueEndpoints[id] + '\'',
          ],
        },
      };
      return await ssmCommand(bastionId, params);
    });

    test(`WFS-${id}-1: Workers can be attached to the Render Queue`, async () => {
      /**********************************************************************************************************
       * TestID:          WFS-1
       * Description:     Confirm that workers can be attached to the farm's render queue
       * Input:           Output from `deadlinecommand Slaves` executed against the farm's render queue via SSM command
       * Expected result: Ouput should be a string beginning with ip- to indicate the worker node is attached to the farm
      **********************************************************************************************************/
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script WFS-report-workers.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/WFS-report-workers.sh',
          ],
        },
      };
      var response = await ssmCommand(bastionId, params);
      var responseOutput = response.output;
      expect(responseOutput).toMatch(/ip-.*/);
    });

    test(`WFS-${id}-2: Workers can be added to groups, pools and regions`, async () => {
      /**********************************************************************************************************
       * TestID:          WFS-2
       * Description:     Confirm that workers can be added to groups, pools, and regions when those parameters are passed to the constructor
       * Input:           Output from `deadline GetSlaveSetting` for each worker executed agains the farm's render queue via SSM command
       * Expected result: Output of the worker settings should indicate that 1 worker is assigned to group "testgroup", pool "testpool" and region "testregion"
      **********************************************************************************************************/
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script WFS-report-worker-sets.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/WFS-report-worker-sets.sh',
          ],
        },
      };
      var response = await ssmCommand(bastionId, params);
      var responseOutput = response.output;
      // Starting Deadline 10.1.11 regions that wasn't added do not apply to worker and returned as unrecognized.
      expect(responseOutput).toMatch(/testpool\ntestgroup\n(?:unrecognized|testregion)/);
    });

    const setConfigs: Array<Array<any>> = [
      [3,'group','-group testgroup'],
      [4,'pool','-pool testpool'],
    ];

    // eslint-disable-next-line @typescript-eslint/no-shadow
    test.each(setConfigs)(`WFS-${id}-%i: Workers can be assigned jobs submitted to a %s`, async (_, name, arg) => {
      /**********************************************************************************************************
       * TestID:          WFS-3, WFS-4
       * Description:     Confirm that jobs sent to a specified group/pool/region are routed to a worker in that set
       * Input:           Output from `deadline GetSlavesRenderingJob` for each test job executed agains the farm's render queue via SSM command
       * Expected result: Output of the worker lists should indicate that 1 worker was assigned a job in group "testgroup", pool "testpool", and region "testregion"
      **********************************************************************************************************/
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: `Execute Test Script WFS-submit-jobs-to-sets.sh for ${name}`,
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            `./testScripts/WFS-submit-jobs-to-sets.sh "${name}" "${arg}"`,
          ],
        },
      };
      var response = await ssmCommand(bastionId, params);
      var responseOutput = response.output;
      expect(+responseOutput).toBe(1);
    });
  });
});
