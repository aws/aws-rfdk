/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {IConnectable} from '@aws-cdk/aws-ec2';
import {IConstruct} from '@aws-cdk/core';
import {IScriptHost} from '../../core';

/**
 * Interface for any constructs that are Capable of connecting to Deadline
 */
export interface IHost extends IConnectable, IConstruct, IScriptHost {
}