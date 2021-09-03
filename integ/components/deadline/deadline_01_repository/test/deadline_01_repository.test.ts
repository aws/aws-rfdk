/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudFormation from 'aws-sdk/clients/cloudformation';
import * as CloudWatchLogs from 'aws-sdk/clients/cloudwatchlogs';
import * as AWS from 'aws-sdk/global';
import awaitSsmCommand from '../../common/functions/awaitSsmCommand';

// Name of testing stack is derived from env variable to ensure uniqueness
const testingStackName = 'RFDKInteg-DL-TestingTier' + process.env.INTEG_STACK_TAG?.toString();
const deadlineVersion = process.env.DEADLINE_VERSION?.toString();

const cloudformation = new CloudFormation();
const logs = new CloudWatchLogs();

const bastionRegex = /bastionId/;
const dbRegex = /DatabaseSecretARNDL(\d)/;
const logRegex = /logGroupNameDL(\d)/;
const certRegex = /CertSecretARNDL(\d)/;

const testCases: Array<Array<any>> = [
  [ 'RFDK-created DB and EFS', 1 ],
  [ 'User-created DB and EFS', 2 ],
  [ 'User-created MongoDB', 3],
];
let bastionId: string;
let dbSecretARNs: Array<any> = [];
let logGroupNames: Array<any> = [];
let certSecretARNs: Array<any> = [];


beforeAll( () => {
  // Query the TestingStack and await its outputs to use as test inputs
  return new Promise<void>( (res,rej) => {
    var params = {
      StackName: testingStackName,
    };
    cloudformation.describeStacks(params, (err, data) => {
      if (err) {
        rej(err);
      }
      else {
        var stackOutput = data.Stacks![0].Outputs!;
        stackOutput.forEach( output => {
          var outputKey = output.OutputKey!;
          var outputValue = output.OutputValue!;
          switch(true){
            case bastionRegex.test(outputKey):
              bastionId = outputValue;
              break;
            case dbRegex.test(outputKey):
              var testId = dbRegex.exec(outputKey)![1];
              dbSecretARNs[+testId] = outputValue;
              break;
            case logRegex.test(outputKey):
              var testId = logRegex.exec(outputKey)![1];
              logGroupNames[+testId] = outputValue;
              break;
            case certRegex.test(outputKey):
              var testId = certRegex.exec(outputKey)![1];
              certSecretARNs[+testId] = outputValue;
              break;
            default:
              break;
          }
        });
        res();
      }
    });
  });
});

describe.each(testCases)('Deadline Repository tests (%s)', (_, id) => {

  describe('DocumentDB tests', () => {

    beforeAll( () => {
      if( certSecretARNs[id]) {
        //If the secretARN has been provided for the auth certificate, this command will fetch it to the instance before continuing the tests
        var params = {
          DocumentName: 'AWS-RunShellScript',
          Comment: 'Execute Test Script fetch-cert.sh',
          InstanceIds: [bastionId],
          Parameters: {
            commands: [
              'sudo -i',
              'su - ec2-user >/dev/null',
              'cd ~ec2-user',
              './utilScripts/fetch-cert.sh \'' + AWS.config.region + '\' \'' + certSecretARNs[id] + '\'',
            ],
          },
        };
        return awaitSsmCommand(bastionId, params);
      }
      else {
        return;
      }
    });

    // This removes the certification file used to authenticate to the render queue
    afterAll( () => {
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
      return awaitSsmCommand(bastionId, params);
    });

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
            './testScripts/DL-read-docdb-response.sh \'' + AWS.config.region + '\' \'' + dbSecretARNs[id] + '\' \'' + certSecretARNs[id] + '\'',
          ],
        },
      };
      return awaitSsmCommand(bastionId, params).then( response => {
        var output = response.output;
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
      return awaitSsmCommand(bastionId, params).then( response => {
        responseCode = response.responseCode;
        output = response.output;
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
      let expectedVersion: string;
      switch (deadlineVersion) {
        // Special case for Deadline 10.1.18.5 since it appears as 10.1.18.4 due to known issues in Deadline's build pipeline
        case '10.1.18.5':
          expectedVersion = '10.1.18.4';
          break;

        default:
          expectedVersion = deadlineVersion!;
          break;
      }
      const regex = new RegExp('\\[DeadlineRepository\\]\nVersion=' + expectedVersion.replace('.', '\\.'));
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
      return new Promise<void>( (res,rej) => {
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
      });
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
        return new Promise<void>( (res, rej) => {
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
          },
        );
      });
    });

    describe('DeadlineRepositoryInstallationLogs LogStream tests', () => {

      let logEvents: Object;

      beforeAll( () => {
        return new Promise<void>( (res, rej) => {
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
          },
        );
      });
    });
  });
});
