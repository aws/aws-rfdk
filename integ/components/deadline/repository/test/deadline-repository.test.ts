/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk';

// Name of testing stack is derived from env variable to ensure uniqueness
const testingStackName = 'RFDKInteg-DL-TestingTier' + process.env.INTEG_STACK_TAG?.toString();
const deadlineVersion = process.env.DEADLINE_VERSION?.toString();

jest.setTimeout(10000);

const cloudformation = new AWS.CloudFormation();
const ssm = new AWS.SSM();
const logs = new AWS.CloudWatchLogs();

const testCases: Array<number> = [1,2];
let bastionId: string;
let secretARNs: Array<string> = [];
let logGroupNames: Array<string> = [];

beforeAll( () => {
  // Query the TestingStack and await its outputs to use as test inputs
  return new Promise( (res,rej) => {
    var params = {
      StackName: testingStackName,
    };
    cloudformation.describeStacks(params, (err, data) => {
      if (err) {
        rej(err);
      }
      else {
        var stacks = data.Stacks as Array<any>;
        var stackOutput = stacks[0].Outputs;
        for(var i = 0; i < stackOutput.length; i++){
          switch(stackOutput[i].OutputKey){
            case 'bastionId':
              bastionId = stackOutput[i].OutputValue;
              break;
            case 'logGroupNameDL1':
              logGroupNames[1] = stackOutput[i].OutputValue;
              break;
            case 'secretARNDL1':
              secretARNs[1] = stackOutput[i].OutputValue;
              break;
            case 'logGroupNameDL2':
              logGroupNames[2] = stackOutput[i].OutputValue;
              break;
            case 'secretARNDL2':
              secretARNs[2] = stackOutput[i].OutputValue;
              break;
            default:
              break;
          }
        }
        res();
      }
    });
  });
});

describe('DocDB tests', () => {

  let ssmResponses: Array<any>;

  beforeAll( () => {
    // Send an SSM command to the Bastion to execute the test script for the DocDB tests, then wait for its result
    let ssmPromises = Array<any>();

    testCases.forEach( testCase => {
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script DL-read-docdb-response.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/DL-read-docdb-response.sh \'' + AWS.config.region + '\' \'' + secretARNs[testCase] + '\'',
          ],
        },
      };
      ssmPromises[testCase] = awaitSsmCommand(params);
    });

    return Promise.all(ssmPromises).then( values => {
      ssmResponses = values;
    });
  });

  test.each(testCases)('DL-%i-1: Deadline DB is initialized', async (testCase) => {
    /**********************************************************************************************************
     * TestID:          DL-1
     * Description:     Confirm that Deadline database is initialized on render farm
     * Input:           Output from mongo CLI "listDatabases" call delivered via SSM command
     * Expected result: Database list returned from bastion contains "deadline10db"
    **********************************************************************************************************/
    var output: any = ssmResponses[testCase].CommandPlugins[0].Output;
    var json = JSON.parse(<string> output);
    expect(json.databases[0].name).toBe('deadline10db');
  });
});

describe( 'EFS tests', () => {

  let ssmResponses: Array<any>;

  beforeAll( () => {
    // Send an SSM command to the Bastion to execute the test script for the DocDB tests, then wait for its result
    let ssmPromises = Array<any>();

    testCases.forEach( testCase => {
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script DL-read-repository-settings.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/DL-read-repository-settings.sh "' + testCase.toString() + '"',
          ],
        },
      };
      ssmPromises[testCase] = awaitSsmCommand(params);
    });

    return Promise.all(ssmPromises).then( values => {
      ssmResponses = values;
    });
  });

  test.each(testCases)('DL-%i-2: EFS is initialized', async (testCase) => {
    /**********************************************************************************************************
     * TestID:          DL-2
     * Description:     Confirm that EFS is initialized on render farm and contains files
     * Input:           Response code from command to print contents of repository.ini delivered via SSM command
     * Expected result: Response code 0, i.e. the script execution was successfuld and repository.ini exists
    **********************************************************************************************************/
    var responseCode = ssmResponses[testCase].CommandPlugins[0].ResponseCode;
    expect(responseCode).toEqual(0);
  });

  test.each(testCases)('DL-%i-3: repository.ini version matches Deadline installer', async (testCase) => {
    /**********************************************************************************************************
     * TestID:          DL-3
     * Description:     Confirm that the Deadline version installed matches the version of the passed-in installer
     * Input:           Output from command to print contents of repository.ini delivered via SSM command
     * Expected result: Contents of repository.ini matches a regex string indicating the correct version number
    **********************************************************************************************************/
    var output = ssmResponses[testCase].CommandPlugins[0].Output;
    var regex = new RegExp('\\[DeadlineRepository\\]\nVersion=' + deadlineVersion);
    expect(output).toEqual(expect.stringMatching(regex));
  });
});

describe('CloudWatch LogGroup tests', () => {

  interface CloudWatchOutput {
    logStreamCount: number;
    cloudInitLogName: string;
    deadlineLogName: string;
  }
  let logResponses: Array<CloudWatchOutput> = [];

  beforeAll( () => {

    let logPromises = Array<any>();

    testCases.forEach(testCase => {
      logPromises[testCase] = new Promise( async (res,rej) => {
        var params = {
          logGroupName: logGroupNames[testCase],
        };
        logs.describeLogStreams(params, (err, data) => {
          if (err) {
            rej(err);
          }
          else {
            res(data);
          }
        });
      });
    });

    return Promise.all(logPromises).then( values => {
      testCases.forEach( testCase => {

        var response = values[testCase];
        let cloudInitLogName: any;
        let deadlineLogName: any;

        response.logStreams.forEach( (logStream: any) => {

          var logStreamName = logStream.logStreamName;

          if (/cloud-init-output/.test(logStreamName)) {
            cloudInitLogName = logStreamName;
          }
          else if( /deadlineRepositoryInstallationLogs/.test(logStreamName) ) {
            deadlineLogName = logStreamName;
          }
        });

        logResponses[testCase] = {
          logStreamCount: response.logStreams.length,
          cloudInitLogName,
          deadlineLogName,
        };
      });
    });
  });

  test.each(testCases)('DL-%i-4: Verify CloudWatch LogGroup contains two LogStreams', async (testCase) => {
    /**********************************************************************************************************
     * TestID:          DL-4
     * Description:     Confirm that CloudWatch LogGroup has been created with two LogStreams
     * Input:           Output from cli call to describe LogGroup created during cdk deploy
     * Expected result: LogGroup contains exactly two LogStreams
    **********************************************************************************************************/
    expect(logResponses[testCase].logStreamCount).toEqual(2);
  });

  test.each(testCases)('DL-%i-5: Verify cloud-init-output LogStream', (testCase) => {
    /**********************************************************************************************************
     * TestID:          DL-5
     * Description:     Confirm that cloud-init-output contains log events from cdk initizialization
     * Input:           Output from sdk call to describe cloud-init-output LogStream created during cdk deploy
     * Expected result: Event log contains at least one entry where the message property matches a regex string
     *                  indicating the cloud-init version used
    **********************************************************************************************************/
    return new Promise( (res, rej) => {
      var params = {
        logGroupName: logGroupNames[testCase],
        logStreamName: logResponses[testCase].cloudInitLogName,
      };
      logs.getLogEvents(params, (err,data) => {
        if (err) {
          rej(err);
        }
        else {
          const cloudInitLogEvents = data;
          res(cloudInitLogEvents.events);
        }
      });
    }).then( data => {
      expect(data).toContainEqual(
        {
          ingestionTime: expect.anything(),
          message: expect.stringMatching( /Cloud-init v. / ),
          timestamp: expect.anything(),
        },
      );
    });
  });

  test.each(testCases)('DL-%i-6: Verify DeadlineRepositoryInstallationLogs LogStream', (testCase) => {
    /**********************************************************************************************************
     * TestID:          DL-6
     * Description:     Confirm that deadlineRepositoryInstallationLogs contains log events from Deadline installation
     * Input:           Output from cli call to describe deadlineRepositoryInstallationLogs LogStream created during cdk deploy
     * Expected result: Event log contains at least one entry where the message property matches a regex string
     *                  indicating that the deadlinecommand.exe command was run during installation
    **********************************************************************************************************/
    return new Promise( (res, rej) => {
      var params = {
        logGroupName: logGroupNames[testCase],
        logStreamName: logResponses[testCase].deadlineLogName,
      };
      logs.getLogEvents(params, (err,data) => {
        if (err) {
          rej(err);
        }
        else {
          const deadlineLogEvents = data;
          res(deadlineLogEvents.events);
        }
      });
    }).then( data => {
      expect(data).toContainEqual(
        {
          ingestionTime: expect.anything(),
          message: expect.stringMatching( /Executing \/tmp\/repoinstalltemp\/deadlinecommand.exe/ ),
          timestamp: expect.anything(),
        },
      );
    });
  });
});

/*
  Custom function to send SSM command to run a particular script on the bastion instance,
  wait for it to finish executing, then return the response.
*/
function awaitSsmCommand(params:AWS.SSM.SendCommandRequest){
  return new Promise<AWS.SSM.CommandInvocation>( async (res) => {

    // Send the command
    // eslint-disable-next-line no-shadow
    const ssmCommandId = await new Promise<AWS.SSM.CommandId> ( (res, rej) => {
      ssm.sendCommand(params, (err, data) => {
        if (err) {
          rej(err);
        }
        else {
          var command = data.Command as AWS.SSM.Command;
          res(command.CommandId);
        }
      });
    });
    await getCommandStatus().then( commandInvocation => {
      res(commandInvocation);
    });

    function getCommandStatus() {
      // eslint-disable-next-line no-shadow
      return new Promise<AWS.SSM.CommandInvocation>( (res, rej) => {
        // eslint-disable-next-line no-shadow
        var params = {
          CommandId: ssmCommandId,
          InstanceId: bastionId,
          Details: true,
        };
        ssm.listCommandInvocations(params, (err, data) => {
          if (err) {
            rej(err);
          }
          else {
            var commandInvocations: any = data.CommandInvocations as AWS.SSM.CommandInvocationList;
            if(!commandInvocations[0]) {
              setTimeout( () => {
                getCommandStatus().then(res, rej);
              }, 1000);
            }
            else{
              var commandInvocation: any = commandInvocations[0] as AWS.SSM.CommandInvocation;
              switch(commandInvocation.Status){
                case 'Success':
                  res(commandInvocation);
                  break;
                case 'Failed':
                  rej(commandInvocation);
                  break;
                default:
                  setTimeout( () => {
                    getCommandStatus().then(res, rej);
                  }, 1000);
                  break;
              }
            }
          }
        });
      });
    }
  });
}
