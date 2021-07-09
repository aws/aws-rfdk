/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  DeadlineClient,
  Response,
} from '../deadline-client';

/**
 * A single entry of the server data received from describeServerData request.
 */
interface DescribedServerData {
  readonly ID: string,
  readonly ConcurrencyToken: string,
}

/**
 * A response from describeServerData request.
 */
interface DescribeServerDataResponse {
  readonly ServerData: DescribedServerData[];
}

/**
 * A response from get pool/group request
 */
export interface PoolGroupCollections {
  /**
   * The collection of user-created Pools/Groups that are currently active
   */
  readonly Pools: string [];

  /**
   * The collection of Pools/Groups that are currently obsolete
   */
  readonly ObsoletePools: string [];
}

/**
 * A type of collection to get/recive from Deadline.
 */
export enum CollectionType {
  Pool = 'pool',

  Group = 'group',
}

/**
 * Provides a simple interface to send requests to the Render Queue API related to the Deadline Spot Event Plugin.
 */
export class SpotEventPluginClient {
  private static readonly EVENT_PLUGIN_ID: string = 'event.plugin.spot';

  private readonly deadlineClient: DeadlineClient;

  constructor(client: DeadlineClient) {
    this.deadlineClient = client;
  }

  public async saveServerData(config: string): Promise<boolean> {
    console.log('Saving server data configuration:');
    console.log(config);

    try {
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
      return true;
    } catch(e) {
      console.error(`Failed to save server data. Reason: ${e}`);
      return false;
    }
  }

  public async configureSpotEventPlugin(configs: Array<{ Key: string, Value: any }>): Promise<boolean> {
    console.log('Saving plugin configuration:');
    console.log(configs);

    try {
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
      return true;
    } catch(e) {
      console.error(`Failed to save plugin configuration. Reason: ${e}`);
      return false;
    }
  }

  public async addGroups(newGroups?: string[]): Promise<boolean> {
    if (newGroups && newGroups.length) {
      const deadlineGroups = await this.getCollection(CollectionType.Group);
      if (deadlineGroups) {
        const newDeadlineGroups = deadlineGroups.Pools
          .concat(newGroups
            .filter(group => !deadlineGroups.Pools.includes(group)));
        return await this.saveCollection({
          Pools: newDeadlineGroups,
          ObsoletePools: deadlineGroups.ObsoletePools,
        } as PoolGroupCollections,
        CollectionType.Group);
      }
      return false;
    }
    return true;
  }

  public async addPools(newPools?: string[]): Promise<boolean> {
    if (newPools && newPools.length) {
      const deadlinePools = await this.getCollection(CollectionType.Pool);
      if (deadlinePools) {
        const newDeadlinePools = deadlinePools.Pools
          .concat(newPools
            .filter(pool => !deadlinePools.Pools.includes(pool)));
        return await this.saveCollection({
          Pools: newDeadlinePools,
          ObsoletePools: deadlinePools.ObsoletePools,
        } as PoolGroupCollections,
        CollectionType.Pool);
      }
      return false;
    }
    return true;
  }

  private async getCollection(type: CollectionType): Promise<PoolGroupCollections|undefined> {
    console.log(`Getting ${type} collection:`);
    try {
      const response = await this.deadlineClient.GetRequest(`/db/settings/collections/${type}s?invalidateCache=true`, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
      const deadlinePools: PoolGroupCollections = response.data;
      if (!deadlinePools.Pools || !Array.isArray(deadlinePools.Pools)) {
        console.error(`Failed to receive a ${type} collection. Invalid response: ${JSON.stringify(response.data)}.`);
        return undefined;
      }
      return deadlinePools;
    } catch(e) {
      console.error(`Failed to get ${type} collection. Reason: ${(<Error>e).message}`);
      return undefined;
    }
  }

  private async saveCollection(pools: PoolGroupCollections, type: CollectionType): Promise<boolean> {
    console.log(`Saving ${type} collection:`);
    console.log(pools);

    try {
      await this.deadlineClient.PostRequest(`/db/settings/collections/${type}s/save`, {
        Pools: pools.Pools,
        ObsoletePools: pools.ObsoletePools,
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
      return true;
    } catch(e) {
      console.error(`Failed to save ${type} collection. Reason: ${(<Error>e).message}`);
      return false;
    }
  }

  private async describeServerData(): Promise<Response> {
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

    const describedData: DescribeServerDataResponse = response.data;

    if (!describedData.ServerData || !Array.isArray(describedData.ServerData)) {
      throw new Error(`Failed to receive a ConcurrencyToken. Invalid response: ${describedData}.`);
    }

    const found = describedData.ServerData.find(element => element.ID === SpotEventPluginClient.EVENT_PLUGIN_ID);
    return found?.ConcurrencyToken ?? '';
  }

}
