/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation } from '@aws-sdk/client-cloudformation';
import { ssmCommand } from '../../common/functions/awaitSsmCommand';

// Name of testing stack is derived from env variable to ensure uniqueness
const testingStackName = 'RFDKInteg-WF-TestingTier' + process.env.INTEG_STACK_TAG?.toString();

const cloudformation = new CloudFormation({});

const bastionRegex = /bastionId/;
const rqRegex = /renderQueueEndpointWF(\d)/;

const testCases: Array<Array<any>> = [
  [ 'Linux Worker HTTP mode', 1 ],
  [ 'Windows Worker HTTP mode', 2 ],
];
let bastionId: any;
let renderQueueEndpoints: Array<string> = [];

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
      default:
        break;
    }
  });
});

describe.each(testCases)('Deadline WorkerFleet tests (%s)', (_, id) => {
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

    test(`WF-${id}-1: Workers can be attached to the Render Queue`, async () => {
      /**********************************************************************************************************
       * TestID:          WF-1
       * Description:     Confirm that workers can be attached to the farm's render queue
       * Input:           Output from `deadlinecommand Slaves` executed against the farm's render queue via SSM command
       * Expected result: Ouput should be a string beginning with ip- to indicate the worker node is attached to the farm
      **********************************************************************************************************/
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script WF-report-workers.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/WF-report-workers.sh',
          ],
        },
      };
      var response = await ssmCommand(bastionId, params);
      var responseOutput = response.output;
      expect(responseOutput).toMatch(/ip-.*/);
    });

    test(`WF-${id}-2: Workers can be added to groups, pools and regions`, async () => {
      /**********************************************************************************************************
       * TestID:          WF-2
       * Description:     Confirm that workers can be added to groups, pools, and regions when those parameters are passed to the constructor
       * Input:           Output from `deadline GetSlaveSetting` for each worker executed agains the farm's render queue via SSM command
       * Expected result: Output of the worker settings should indicate that 1 worker is assigned to group "testgroup", pool "testpool" and region "testregion"
      **********************************************************************************************************/
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script WF-report-worker-sets.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/WF-report-worker-sets.sh',
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
    test.each(setConfigs)(`WF-${id}-%i: Workers can be assigned jobs submitted to a %s`, async (_, name, arg) => {
      /**********************************************************************************************************
       * TestID:          WF-3, WF-4
       * Description:     Confirm that jobs sent to a specified group/pool/region are routed to a worker in that set
       * Input:           Output from `deadline GetSlavesRenderingJob` for each test job executed agains the farm's render queue via SSM command
       * Expected result: Output of the worker lists should indicate that 1 worker was assigned a job in group "testgroup", pool "testpool", and region "testregion"
      **********************************************************************************************************/
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: `Execute Test Script WF-submit-jobs-to-sets.sh for ${name}`,
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            `./testScripts/WF-submit-jobs-to-sets.sh "${name}" "${arg}"`,
          ],
        },
      };
      var response = await ssmCommand(bastionId, params);
      var responseOutput = response.output;
      expect(+responseOutput).toBe(1);
    });
  });
});
