/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import { DeadlineClient } from '../deadline-client';

function minimumVersion(deadlineClient: DeadlineClient) {
    deadlineClient.GetRequest('/db/environment/minimumversion/get')
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.log(error);
    });
  }
  
  function jobState(deadlineClient: DeadlineClient) {
    deadlineClient.PostRequest('/db/jobs/state?fields=&transactionID=1234', {
        data: '[ 1]',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-deadline-rcs-api': 1,
      }
    })
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.log(error);
    });
  }
  
  function spotFleetRequestConfiguration(deadlineClient: DeadlineClient) {
    deadlineClient.PostRequest('/rcs/v1/putServerData', {
      ServerData: [
        {
          ID: 'event.plugin.Spot',
          ServerDataDictionary: {
            Config: "{}",
          },
          ConcurrencyToken: '791875d4-4fcf-4812-a498-916d641b901b',
        }
      ] 
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-deadline-rcs-api': 3,
      }
    })
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.log(error);
    });
  }
  
  function spotFleetRequestGroupPools(deadlineClient: DeadlineClient) {
    deadlineClient.PostRequest('/db/plugins/event/config/save', {
      ID: "spot",
      // LastWriteTime: "/Date(-62135596799000)/",
      DebugLogging: false,
      DlInit: [
        // {
        //   Key: "State",
        //   Value: "Disabled",
        // },
        // {
        //   Key: "ResourceTracker",
        //   Value: true,
        // },
        // {
        //   Key: "UseLocalCredentials",
        //   Value: false,
        // },
        // {
        //   Key: "NamedProfile",
        //   Value: "default",
        // },
        // {
        //   Key: "AccessID",
        //   Value: "",
        // },
        // {
        //   Key: "SecretKey",
        //   Value: "*********",
        // },
        // {
        //   Key: "Logging",
        //   Value: "Standard",
        // },
        // {
        //   Key: "Region",
        //   Value: "us-west-2",
        // },
        // {
        //   Key: "IdleShutdown",
        //   Value: "10",
        // },
        // {
        //   Key: "DeleteInterruptedSlaves",
        //   Value: false,
        // },
        // {
        //   Key: "DeleteTerminatedSlaves",
        //   Value: false,
        // },
        // {
        //   Key: "StrictHardCap",
        //   Value: true,
        // },
        // {
        //   Key: "StaggerInstances",
        //   Value: 50,
        // },
        // {
        //   Key: "PreJobTaskMode",
        //   Value: "Conservative",
        // },
        {
          Key: "GroupPools",
          Value: "{ Else: 25 }",
        },
        // {
        //   Key: "AWSInstanceStatus",
        //   Value: "Disabled",
        // },
      ],
      Icon: null,
      Limits: [],
      Meta: [],
      Name: "Spot",
      PluginEnabled: 1,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-deadline-rcs-api': 1,
      }
    })
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.log(error);
    });
  }
  
  const deadlineClient = new DeadlineClient({
    host: 'YWG-1800514339.ant.amazon.com',
    port: 8080,
    // tls: {
    //   pfxPath: 'Deadline10RemoteClient.pfx',
    //   passphrase: 'qwerty123',
    //   caPath: 'ca.crt',
    // }
  });
  
  // minimumVersion(deadlineClient);
  // jobState(deadlineClient);
  //spotFleetRequestConfiguration(deadlineClient);
  spotFleetRequestGroupPools(deadlineClient);