/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DeadlineClient,
} from '../deadline-client';

// TODO: extend this interface
export interface SEPGeneralOptions {
  readonly GroupPools?: string; // TODO: JSON
  readonly State?: string;
  readonly ResourceTracker?: boolean;
  readonly UseLocalCredentials?: boolean; // TOOD: remove this and other credentials related options and set them by default
  readonly NamedProfile?: string; // TOOD: remove this and other credentials related options and set them by default
  readonly AccessID?: string; // TOOD: remove this and other credentials related options and set them by default
  readonly SecretKey?: string; // TOOD: remove this and other credentials related options and set them by default
  readonly Logging?: string;
  readonly Region?: string;
  readonly IdleShutdown?: number;
  readonly DeleteInterruptedSlaves?: boolean; // TODO: should we rename slaves here?
  readonly DeleteTerminatedSlaves?: boolean; // TODO: should we rename slaves here?
  readonly StrictHardCap?: boolean;
  readonly StaggerInstances?: number;
  readonly PreJobTaskMode?: string;
  readonly AWSInstanceStatus?: string;
};

export class EventPluginRequests {
  private readonly deadlineClient: DeadlineClient;

  constructor(deadlineClient: DeadlineClient) {
    this.deadlineClient = deadlineClient;
  }

  public async saveServerData(config: string): Promise<boolean> {
    // TODO: maybe parse the result
    await this.deadlineClient.PostRequest('/rcs/v1/putServerData', {
      ServerData: [
        {
          ID: 'event.plugin.Spot',
          ServerDataDictionary: {
            Config: config,
          },
          ConcurrencyToken: '791875d4-4fcf-4812-a498-916d641b901b',
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-deadline-rcs-api': 3,
      },
    });
    return true;
  }

  public async configureSpotEventPlugin(inputOptions: SEPGeneralOptions): Promise<boolean> {
    let configs = [];

    for (const [key, value] of Object.entries(inputOptions)) {
      if (value !== undefined) { // TODO: think if this is corrects
        configs.push({
          Key: key,
          Value: value,
        });
      }
    }

    await this.deadlineClient.PostRequest('/db/plugins/event/config/save', {
      ID: 'spot',
      // LastWriteTime: "/Date(-62135596799000)/",
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
        'Content-Type': 'application/json',
        'x-amz-deadline-rcs-api': 1,
      },
    });
    return true;
  }
}