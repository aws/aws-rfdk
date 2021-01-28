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
    console.log('Sending request to describe server data.');
    return await this.deadlineClient.PostRequest('/rcs/v1/describeServerData', {
      ServerDataIds: [
        'event.plugin.spot',
      ],
    });
  }

  private async concurrencyToken(): Promise<string> {
    console.log('Getting concurrency token.');
    const response = await this.describeServerData();
    console.log('Received concurrency token.');

    const describedData: {
      ServerData: {
        ID: string,
        ConcurrencyToken: string,
      }[],
    } = response.data;

    const found = describedData.ServerData.find(element => element.ID === 'event.plugin.spot');
    console.log('Concurrency token is:'); // TODO: remove this console
    console.log(found?.ConcurrencyToken);
    return found?.ConcurrencyToken ?? '';
  }

  public async saveServerData(config: string): Promise<boolean> {
    console.log('Getting concurrency token to save server data.');
    const concurrencyToken = await this.concurrencyToken();
    console.log(`Received concurrency token: ${concurrencyToken}`); // TODO: remove this console

    console.log('Sending put server data request with config:');
    console.log(config);
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
    });
    console.log('Server data was put successfully put.');
    return true;
  }

  public async configureSpotEventPlugin(configs: { Key: string, Value: any }[]): Promise<boolean> {
    console.log('Sending save config request with configs:');
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
    });
    return true;
  }
}