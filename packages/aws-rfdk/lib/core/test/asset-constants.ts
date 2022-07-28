/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// ConfigureCloudWatchAgent.sh
export const CWA_ASSET_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'f3261b0f6923b012a8fce5cd6984211bc48b9977844b3fa44229234dc6f21d43',
};

// ConfigureCloudWatchAgent.ps1
export const CWA_ASSET_WINDOWS = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'b3a03a74afa8a045b35e08f11a719544622172869cc031787f580407d665ee36',
};

// mountEbsBlockVolume.sh + metadataUtilities.sh + ec2-certificates.crt
export const MOUNT_EBS_SCRIPT_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '11325bc3262f331157129ec344f0be7fae82e28e86cab0cef04c47b428cd8ef5',
};

export const MOUNT_EFS_SCRIPT_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'df4591e2346578a80738105aa20aab9c8cee38098d62b4b9a595681c14b8e716',
};

export const MOUNT_FSX_SCRIPT_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '9afc7cd192aacbc562e018fb8f9c3848df6a247d43d2486ee91c0ded179e2774',
};

export const INSTALL_MONGODB_3_6_SCRIPT_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '80faba664ebb899d63d89c8fcea1d867475d1ddd28159f418b42af81197849e1',
};

export const MONGODB_3_6_CONFIGURATION_SCRIPTS = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '433ead41839a7d4dad68bf0149f907050caa6d95bb7b5b180e5ff21a5dad3c19',
};
