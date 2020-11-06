/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as SSM from 'aws-sdk/clients/ssm';

const ssm = new SSM;

interface CommandResponse {
  output: string;
  responseCode: number;
}

// Custom function to send SSM command to run a particular script on the bastion instance,
// wait for it to finish executing, then return the response.
export default function awaitSsmCommand(bastionId: string, params: SSM.SendCommandRequest){
  return new Promise<CommandResponse>( async (res) => {

    // Send the command
    // eslint-disable-next-line no-shadow
    const ssmCommandId = await new Promise<SSM.CommandId> ( (_res, rej) => {
      // eslint-disable-next-line no-shadow
      ssm.sendCommand(params, (err, data) => {
        if (err) {
          rej(err);
        }
        else {
          var command = data.Command as SSM.Command;
          _res(command.CommandId);
        }
      });
    });
    await getCommandStatus().then( commandInvocation => {
      res(commandInvocation);
    });

    function getCommandStatus() {
      // Wait for the command to return a valid status
      // eslint-disable-next-line no-shadow
      return new Promise<CommandResponse>( (_res, rej) => {
        // eslint-disable-next-line no-shadow
        var listParams = {
          CommandId: ssmCommandId,
          InstanceId: bastionId,
          Details: true,
        };
        ssm.listCommandInvocations(listParams, (err, data) => {
          if (err) {
            rej(err);
          }
          else {
            var commandInvocations = data.CommandInvocations!;
            if(!commandInvocations[0]) {
              setTimeout( () => {
                getCommandStatus().then(_res, rej);
              }, 1000);
            }
            else{
              var commandInvocation = commandInvocations[0];
              switch(commandInvocation.Status){
                case 'Success':
                  // Workaround: if the output of the script execution is very long, it is truncated by `listCommandInvocations`
                  // If the truncation string is present, this will get the full output from `getCommandInvocation`
                  if( /---Output truncated---/.test(commandInvocation.CommandPlugins![0].Output!) ) {
                    var getParams = {
                      CommandId: ssmCommandId,
                      InstanceId: bastionId,
                    };
                    ssm.getCommandInvocation(getParams, (getErr, getData) => {
                      if (getErr) {
                        rej(getErr);
                      }
                      else {
                        _res({output: getData.StandardOutputContent!, responseCode: getData.ResponseCode!});
                      }
                    });
                  }
                  // If the output wasn't truncated, return the output from the `listCommandInvocations` response
                  else {
                    _res({output: commandInvocation.CommandPlugins![0].Output!, responseCode: commandInvocation.CommandPlugins![0].ResponseCode!});
                  }
                  break;
                case 'Failed':
                  rej(commandInvocation.CommandPlugins![0]);
                  break;
                default:
                  setTimeout( () => {
                    getCommandStatus().then(_res, rej);
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
