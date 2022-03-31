/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {SSM, SendCommandRequest } from '@aws-sdk/client-ssm';

const ssm = new SSM({});

interface CommandResponse {
  output: string;
  responseCode: number;
}

// Custom function to send SSM command to run a particular script on the bastion instance,
// wait for it to finish executing, then return the response.
export async function ssmCommand(bastionId: string, params: SendCommandRequest): Promise<CommandResponse> {
  try {
    const command = await ssm.sendCommand(params);
    const commandId = command.Command!.CommandId;

    var listParams = {
      CommandId: commandId,
      InstanceId: bastionId,
      Details: true,
    };
    while (true) {
      // Sleep for 1,000ms = 1s
      await new Promise(resolve => setTimeout(resolve, 1000));

      const invocations = await ssm.listCommandInvocations(listParams);
      if (invocations.CommandInvocations![0]) {
        const invocation = invocations.CommandInvocations![0];
        switch (invocation.Status) {
          case 'Success':
            // Workaround: if the output of the script execution is very long, it is truncated by `listCommandInvocations`
            // If the truncation string is present, this will get the full output from `getCommandInvocation`
            if( /---Output truncated---/.test(invocation.CommandPlugins![0].Output!) ) {
              var getParams = {
                CommandId: commandId,
                InstanceId: bastionId,
              };
              const getResult = await ssm.getCommandInvocation(getParams);
              return {
                output: getResult.StandardOutputContent!,
                responseCode: getResult.ResponseCode!,
              };
            }
            return {
              output: invocation.CommandPlugins![0].Output!,
              responseCode: invocation.CommandPlugins![0].ResponseCode!,
            };
          case 'Failed':
            throw invocation.CommandPlugins![0];
          default:
            break;
        }
      }
    }
  } catch (err) {
    throw err;
  }
}
