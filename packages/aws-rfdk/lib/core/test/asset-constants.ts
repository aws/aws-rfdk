/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// ConfigureCloudWatchAgent.sh
export const CWA_ASSET_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'a1eed7232f6afcc474e870e7c3c01b7f4aec028de3a20eccc76ad9050032eecb',
};

// ConfigureCloudWatchAgent.ps1
export const CWA_ASSET_WINDOWS = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'ea268a603f4cce783c290fc755e99c9d8c127224c1be30d6158aed70e533c730',
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

export const INSTALL_MONGODB_8_0_SCRIPT_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '9a874a982214b9def58319059eb1f977840b7d0178a9563121c03b122e4d2acd',
};

export const MONGODB_8_0_CONFIGURATION_SCRIPTS = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'ea54c3ebdc417d7cc0fae38dd2c0693386a3121edea09ec7454a36e1f72d5ce2',
};
