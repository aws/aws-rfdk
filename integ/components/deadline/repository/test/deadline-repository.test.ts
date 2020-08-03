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

const testCases: Array<Array<any>> = [
  [ 'RFDK-created DB and EFS', 1 ],
  [ 'User-created DB and EFS', 2 ],
]
let bastionId: string;
let secretARNs: Array<any> = [];
let logGroupNames: Array<any> = [];

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
            case 'secretARNDL1':
              secretARNs[1] = stackOutput[i].OutputValue;
              break;
            case 'logGroupNameDL1':
              logGroupNames[1] = stackOutput[i].OutputValue;
              break;
            case 'secretARNDL2':
              secretARNs[2] = stackOutput[i].OutputValue;
              break;
            case 'logGroupNameDL2':
              logGroupNames[2] = stackOutput[i].OutputValue;
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

describe.each(testCases)('Deadline Repository tests (%s)', (_, id) => {
  
  describe('DocumentDB tests', () => {

    test(`DL-${id}-1: Deadline DB is initialized`, async () => {
      /**********************************************************************************************************
       * TestID:          DL-1
       * Description:     Confirm that Deadline database is initialized on render farm
       * Input:           Output from mongo CLI "listDatabases" call delivered via SSM command
       * Expected result: Database list returned from bastion contains "deadline10db"
      **********************************************************************************************************/  
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script DL-read-docdb-response.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/DL-read-docdb-response.sh \'' + AWS.config.region + '\' \'' + secretARNs[id] + '\'',
          ],
        },
      };
      return awaitSsmCommand(params).then( response => {
        var output = response.CommandPlugins![0].Output!
        var json = JSON.parse(<string> output);
        expect(json.databases[0].name).toBe('deadline10db');
      });
    });
  });

  describe( 'EFS tests', () => {
    
    let responseCode: number;
    let output: string;

    beforeAll( () => {
      var params = {
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Execute Test Script DL-read-repository-settings.sh',
        InstanceIds: [bastionId],
        Parameters: {
          commands: [
            'sudo -i',
            'su - ec2-user >/dev/null',
            'cd ~ec2-user',
            './testScripts/DL-read-repository-settings.sh "' + id.toString() + '"',
          ],
        },
      };
      return awaitSsmCommand(params).then( response => {
        responseCode = response.CommandPlugins![0].ResponseCode!;
        output = response.CommandPlugins![0].Output!;
      });
    });

    test(`DL-${id}-2: EFS is initialized`, () => {
      /**********************************************************************************************************
       * TestID:          DL-2
       * Description:     Confirm that EFS is initialized on render farm and contains files
       * Input:           Response code from command to print contents of repository.ini delivered via SSM command
       * Expected result: Response code 0, i.e. the script execution was successfuld and repository.ini exists
      **********************************************************************************************************/
        expect(responseCode).toEqual(0);
    });

    test(`DL-${id}-3: repository.ini version matches Deadline installer`, () => {
      /**********************************************************************************************************
       * TestID:          DL-3
       * Description:     Confirm that the Deadline version installed matches the version of the passed-in installer
       * Input:           Output from command to print contents of repository.ini delivered via SSM command
       * Expected result: Contents of repository.ini matches a regex string indicating the correct version number
      **********************************************************************************************************/
      var regex = new RegExp('\\[DeadlineRepository\\]\nVersion=' + deadlineVersion);
      expect(output).toEqual(expect.stringMatching(regex));
    });
  });

  describe('CloudWatch LogGroup tests', () => {

    let logStreamCount: number;
    let cloudInitLogName: string;
    let deadlineLogName: string;

    beforeAll( () => {

      var params = {
        logGroupName: logGroupNames[id],
      };
      return new Promise( (res,rej) => {
        logs.describeLogStreams(params, (err, data) => {
          if (err) {
            rej(err);
          }
          else {
            var logStreams = data.logStreams!;
            logStreamCount = logStreams.length;
            logStreams.forEach( logStream => {
              var logStreamName = logStream.logStreamName!;
              if(/cloud-init-output/.test(logStreamName)) {
                cloudInitLogName = logStreamName;
              }
              else if( /deadlineRepositoryInstallationLogs/.test(logStreamName)) {
                deadlineLogName = logStreamName;
              }
            });
          }
          res();
        });
      })
    });

    test(`DL-${id}-4: CloudWatch LogGroup contains two LogStreams`, () => {
      /**********************************************************************************************************
       * TestID:          DL-4
       * Description:     Confirm that CloudWatch LogGroup has been created with two LogStreams
       * Input:           Output from cli call to describe LogGroup created during cdk deploy
       * Expected result: LogGroup contains exactly two LogStreams
      **********************************************************************************************************/
      expect(logStreamCount).toEqual(2);
    });

    describe('cloud-init-output LogStream tests', () => {

      let logEvents: Object;

      beforeAll( () => {
        return new Promise( (res, rej) => {
          var params = {
            logGroupName: logGroupNames[id],
            logStreamName: cloudInitLogName,
          };
          logs.getLogEvents(params, (err,data) => {
            if (err) {
              rej(err);
            }
            else {
              logEvents = data.events!;
            }
            res();
          });
        });
      });

      test(`DL-${id}-5: cloud-init-output is initialized`, () => {
        /**********************************************************************************************************
         * TestID:          DL-5
         * Description:     Confirm that cloud-init-output contains log events from cdk initizialization
         * Input:           Output from sdk call to describe cloud-init-output LogStream created during cdk deploy
         * Expected result: Event log contains at least one entry where the message property matches a regex string
         *                  indicating the cloud-init version used
        **********************************************************************************************************/
        expect(logEvents).toContainEqual(
          {
            ingestionTime: expect.anything(),
            message: expect.stringMatching( /Cloud-init v. / ),
            timestamp: expect.anything(),
          },
        );
      });
    
      test(`DL-${id}-6: cloud-init-output does not contain INSTALLER_DB_ARGS`, () => {
        /**********************************************************************************************************
         * TestID:          DL-6
         * Description:     Confirm that cloud-init-output does not contain INSTALLER_DB_ARGS; this environment
         *                  variable contains sensitive info that should not be exposed. 
         * Input:           Output from sdk call to describe cloud-init-output LogStream created during cdk deploy
         * Expected result: There is one expected instance of the INSTALLER_DB_ARGS variable so the test will fail
         *                  if the variable appears outside of the specificed string
        **********************************************************************************************************/
       expect(logEvents).toContainEqual(
          {
            ingestionTime: expect.anything(),
            message: expect.not.stringMatching( /\w*(?<!declare -A )INSTALLER_DB_ARGS/ ),
            timestamp: expect.anything(),
          }
        );
      });
    });

    describe('DeadlineRepositoryInstallationLogs LogStream tests', () => {

      let logEvents: Object;

      beforeAll( () => {
        return new Promise( (res, rej) => {
          var params = {
            logGroupName: logGroupNames[id],
            logStreamName: deadlineLogName,
          };
          logs.getLogEvents(params, (err,data) => {
            if (err) {
              rej(err);
            }
            else {
              logEvents = data.events!;
            }
            res();
          });
        });
      });

      test(`DL-${id}-7: DeadlineRepositoryInstallationLogs is initialized`, () => {
        /**********************************************************************************************************
         * TestID:          DL-7
         * Description:     Confirm that deadlineRepositoryInstallationLogs contains log events from Deadline installation
         * Input:           Output from cli call to describe deadlineRepositoryInstallationLogs LogStream created during cdk deploy
         * Expected result: Event log contains at least one entry where the message property matches a regex string
         *                  indicating that the deadlinecommand.exe command was run during installation
        **********************************************************************************************************/
        expect(logEvents).toContainEqual(
          {
            ingestionTime: expect.anything(),
            message: expect.stringMatching( /Executing \/tmp\/repoinstalltemp\/deadlinecommand.exe/ ),
            timestamp: expect.anything(),
          }
        );
      });
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
