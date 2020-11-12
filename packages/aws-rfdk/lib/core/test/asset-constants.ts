/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { stringLike } from '@aws-cdk/assert';

// ConfigureCloudWatchAgent.sh
export const CWA_ASSET_LINUX = {
  Bucket: 'AssetParameters3793207e75b2a1b5dd4ebe458ab7a5cc20154224e846267d2c22da1d0631f94fS3Bucket352E624B',
  Key: 'AssetParameters3793207e75b2a1b5dd4ebe458ab7a5cc20154224e846267d2c22da1d0631f94fS3VersionKeyAE2B9691',
};

// ConfigureCloudWatchAgent.ps1
export const CWA_ASSET_WINDOWS = {
  Bucket: 'AssetParameters05415690a7593cdde72555787eaac1d784dd3173e6083f23f83dc795bfe1741fS3Bucket0E53698F',
  Key: 'AssetParameters05415690a7593cdde72555787eaac1d784dd3173e6083f23f83dc795bfe1741fS3VersionKeyE92C9DEB',
};

// mountEbsBlockVolume.sh + metadataUtilities.sh + ec2-certificates.crt
export const MOUNT_EBS_SCRIPT_LINUX = {
  Bucket: stringLike('AssetParameters*S3BucketD23CD539'),
};

export const INSTALL_MONGODB_3_6_SCRIPT_LINUX = {
  Bucket: stringLike('AssetParameters*S3BucketAF54A815'),
};

export const MONGODB_INSTANCE_3_6_SCRIPT = {
  Bucket: stringLike('AssetParameters*S3Bucket352E624B'),
};

export function linuxDownloadRunScriptBoilerplate(script: { Bucket: string, Key: string }) {
  return [
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\')\naws s3 cp \'s3://',
    {Ref: script.Bucket},
    '/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' \'/tmp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\'\n' +
    'set -e\n' +
    'chmod +x \'/tmp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {
              Ref: script.Key,
            },
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\'\n\'/tmp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
  ];
}

export function windowsDownloadRunScriptBoilerplate(script: { Bucket: string, Key: string }) {
  return [
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' ) -ea 0\nRead-S3Object -BucketName \'',
    {Ref: script.Bucket},
    '\' -key \'',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' -file \'C:/temp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' -ErrorAction Stop\n&\'C:/temp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {
              Ref: script.Key,
            },
          ],
        },
      ],
    },
    {
      'Fn::Select': [
        1,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
          ],
        },
      ],
    },
  ];
}
