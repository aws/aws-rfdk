/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  DeadlineClient,
  Response,
} from '../deadline-client';

export class EventPluginRequests {
  private readonly deadlineClient: DeadlineClient;

  constructor(deadlineClient: DeadlineClient) {
    this.deadlineClient = deadlineClient;
  }

  public async describeServerData(): Promise<Response> {
    return await this.deadlineClient.PostRequest('/rcs/v1/describeServerData', {
      ServerDataIds: [
        'event.plugin.spot',
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  public async saveServerData(config: string): Promise<boolean> {
    console.log('Saving server data configuration:');
    console.log(config);

    const concurrencyToken = await this.concurrencyToken();
    await this.deadlineClient.PostRequest('/rcs/v1/putServerData', {
      ServerData: [
        {
          ID: 'event.plugin.spot',
          ServerDataDictionary: {
            Config: config,
          },
          ConcurrencyToken: concurrencyToken,
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    console.log('Server data successfully saved.');
    return true;
  }

  public async configureSpotEventPlugin(configs: { Key: string, Value: any }[]): Promise<boolean> {
    console.log('Saving plugin configuration:');
    console.log(configs);
    await this.deadlineClient.PostRequest('/db/plugins/event/config/save', {
      ID: 'spot',
      DebugLogging: false,
      DlInit: configs,
      Icon: null,
      Limits: [],
      Meta: [],
      Name: 'Spot',
      PluginEnabled: 1,
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    console.log('Plugin configuration successfully saved.');
    return true;
  }

  private async concurrencyToken(): Promise<string> {
    const response = await this.describeServerData();

    const describedData: {
      ServerData: {
        ID: string,
        ConcurrencyToken: string,
      }[],
    } = response.data;

    const found = describedData.ServerData.find(element => element.ID === 'event.plugin.spot');
    return found?.ConcurrencyToken ?? '';
  }
}
