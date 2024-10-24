/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { types } from 'util';
/* eslint-disable import/no-extraneous-dependencies */
import {
  AutoScalingClient,
  CompleteLifecycleActionCommand,
} from '@aws-sdk/client-auto-scaling';
import {
  EC2Client,
  AttachNetworkInterfaceCommand,
} from '@aws-sdk/client-ec2';
/* eslint-enable import/no-extraneous-dependencies */

/**
 * Contents of the Message sent from Sns in response to a lifecycle event.
 */
interface SnsLaunchInstanceMessage {
  readonly AccountId: string;
  readonly AutoScalingGroupName: string;
  readonly EC2InstanceId: string;
  readonly LifecycleHookName: string;
  readonly LifecycleActionToken: string;
  readonly LifecycleTransition: string;
  readonly RequestId: string;
  readonly Service: string;
  readonly Time: string;
}

/**
 * Send the completeLifecycleAction() to signal that the next stage for the lifecycle action.
 * Note: This **must** always be sent; failing to do so will leave the ASG instance stuck in
 * a 'Pending: Wait' state.
 */
async function completeLifecycle(success: boolean, message: SnsLaunchInstanceMessage): Promise<void> {
  // References:
  //  - https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_CompleteLifecycleAction.html
  //  - https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/AutoScaling.html#completeLifecycleAction-property
  const autoscaling = new AutoScalingClient();
  try {
    const request = {
      AutoScalingGroupName: message.AutoScalingGroupName,
      LifecycleActionResult: success ? 'CONTINUE' : 'ABANDON',
      LifecycleHookName: message.LifecycleHookName,
      InstanceId: message.EC2InstanceId,
      LifecycleActionToken: message.LifecycleActionToken,
    };
    console.log('Sending CompleteLifecycleAction request: ' + JSON.stringify(request));
    const response = await autoscaling.send( new CompleteLifecycleActionCommand(request));
    console.log('Got response: ' + JSON.stringify(response));
  } catch (e) {
    throw new Error(`Error sending completeLifecycleAction: ${(e as Error)?.name} -- ${(e as Error)?.message}`);
  }
}

async function attachEniToInstance(instanceId: string, eniId: string): Promise<void> {
  // References:
  //  - https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_AttachNetworkInterface.html
  //  - https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#attachNetworkInterface-property
  const ec2 = new EC2Client();
  try {
    const request = {
      DeviceIndex: 1,
      InstanceId: instanceId,
      NetworkInterfaceId: eniId,
    };
    console.log('Sending AttachNetworkInterface request: ' + JSON.stringify(request));
    const response = await ec2.send(new AttachNetworkInterfaceCommand(request));
    console.log('Got response: ' + JSON.stringify(response));
  } catch (e) {
    throw new Error(`Error attaching network interface to instance: ${(e as Error)?.name} -- ${(e as Error)?.message}`);
  }
}

export async function handler(event: { [key: string]: any }): Promise<void> {
  console.log(`Got Event: ${JSON.stringify(event)}`);

  for (const record of event.Records) {
    try {
      console.log(`Processing record: ${JSON.stringify(record)}`);
      const message = JSON.parse(record.Sns.Message);
      // A test event is sent by Lifecycle hooks to ensure the permissions are set up correctly, so
      // only act on actual EC2 Instance Launches.
      if (message.LifecycleTransition === 'autoscaling:EC2_INSTANCE_LAUNCHING') {
        // Get the id of the ENI that we're attaching from the NotificationMetadata in the message.
        const eniId = JSON.parse(message.NotificationMetadata).eniId;
        let success = false;
        try {
          await attachEniToInstance(message.EC2InstanceId, eniId);
          success = true;
        } catch (e) {
          console.error(String(e));
          console.error((e as Error)?.stack);
        } finally {
          // Note: Instance stays in 'Pending: Wait' state unless this lambda signals a lifecycle transition, so we must **always** send one.
          //  https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_CompleteLifecycleAction.html
          await completeLifecycle(success, message);
        }
      }
    } catch (e) {
      if (types.isNativeError(e)) {
        console.error(e.toString());
        console.error(e.stack);
      } else {
        console.error(String(e));
      }
    }
  }
}
