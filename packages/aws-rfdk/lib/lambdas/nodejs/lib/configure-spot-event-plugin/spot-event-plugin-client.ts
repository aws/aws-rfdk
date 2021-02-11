/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  DeadlineClient,
  DeadlineClientProps,
  Response,
} from '../deadline-client';

/**
 * Properties of SpotEventPluginClient
 */
export interface SpotEventPluginClientProps {
  /**
   * Properties for setting up a simple Deadline HTTP(S) client.
   */
  readonly deadlineClientProps: DeadlineClientProps;
}

export class SpotEventPluginClient {
  private static readonly EVENT_PLUGIN_ID: string = 'event.plugin.spot';

  private readonly deadlineClient: DeadlineClient;

  constructor(props: SpotEventPluginClientProps) {
    this.deadlineClient = new DeadlineClient(props.deadlineClientProps);
  }

  public async describeServerData(): Promise<Response> {
    return await this.deadlineClient.PostRequest('/rcs/v1/describeServerData', {
      ServerDataIds: [
        SpotEventPluginClient.EVENT_PLUGIN_ID,
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

    // Get the concurrency token required to save server data
    const concurrencyToken = await this.concurrencyToken();
    await this.deadlineClient.PostRequest('/rcs/v1/putServerData', {
      ServerData: [
        {
          ID: SpotEventPluginClient.EVENT_PLUGIN_ID,
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

  /**
   * Requests a concurrencyToken required to save spot fleet request configuration.
   * If data already exists under the ID, an existing ConcurrencyToken has to be used.
   * First obtain the token and then save the data with the same ConcurrencyToken.
   * If there is no data under the ID, then real token is not required,
   * but the ConcurrencyToken property still has to be set.
   * NOTE:
   * saveServerData() will have a ConcurrencyToken in its response but we do not use it,
   * instead we always call this function to get a latest token.
   */
  private async concurrencyToken(): Promise<string> {
    const response = await this.describeServerData();

    const describedData: {
      ServerData: {
        ID: string,
        ConcurrencyToken: string,
      }[],
    } = response.data;

    const found = describedData.ServerData.find(element => element.ID === SpotEventPluginClient.EVENT_PLUGIN_ID);
    return found?.ConcurrencyToken ?? '';
  }
}
