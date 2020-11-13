/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The relevant fields from a CustomResource request event for sending the required response to Cfn.
 *  Reference: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-requests.html
 */
export interface CfnRequestEvent {
  readonly RequestType: 'Create' | 'Update' | 'Delete';
  readonly ResponseURL: string;
  readonly StackId: string;
  readonly RequestId: string;
  readonly ResourceType: string;
  readonly LogicalResourceId: string;
  readonly PhysicalResourceId?: string;
  readonly ResourceProperties?: object;
  readonly OldResourceProperties?: object;
}
