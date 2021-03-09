/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: Properly import from aws-rfdk. Not ideal
// to use a relative path here.
import { stringLike } from '@aws-cdk/assert';
import {
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
} from '../../core/test/asset-constants';

export {
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
};

// configureWorker.sh
export const CONFIG_WORKER_ASSET_LINUX = {
  Bucket: 'AssetParameters21c2af3bc1d4fd78061765b059dcc8e32568828e5cf479b08115489651491c8fS3BucketF10C60A7',
  Key: 'AssetParameters21c2af3bc1d4fd78061765b059dcc8e32568828e5cf479b08115489651491c8fS3VersionKey7FDCC89A',
};

// configureWorker.ps1
export const CONFIG_WORKER_ASSET_WINDOWS = {
  Bucket: 'AssetParametersa10d67420c8758e35d8dae5fa406c7acb92b1bd40924167d5564aa0037b4a980S3Bucket953E30DC',
  Key: 'AssetParametersa10d67420c8758e35d8dae5fa406c7acb92b1bd40924167d5564aa0037b4a980S3VersionKeyAFB97BD6',
};

export const CONFIG_WORKER_PORT_ASSET_WINDOWS = {
  Bucket: 'AssetParameters0b4fe3ffb7177773bb2781f92b37d9b01b3bd37ee60ea1715c0ad407f141005dS3BucketE7B32C3E',
  Key: 'AssetParameters0b4fe3ffb7177773bb2781f92b37d9b01b3bd37ee60ea1715c0ad407f141005dS3VersionKey843794E3',
};

// installDeadlineRepository.sh
export const INSTALL_REPOSITORY_ASSET_LINUX = {
  Bucket: stringLike('AssetParameters*S3Bucket8EB24E17'),
};

// test.file
export const TEST_ASSET = {
  Bucket: stringLike('AssetParameters*S3Bucket5D5509D9'),
  Key: stringLike('AssetParameters*S3VersionKeyF19FF080'),
};

// installRepostitoryDirectConnection
export const REPO_DC_ASSET = {
  Bucket: stringLike('AssetParameters*S3Bucket87338EBD'),
  Key: stringLike('AssetParameters*S3VersionKeyB7FF7B3C'),
};

export const RQ_CONNECTION_ASSET = {
  Bucket: 'AssetParameters74fd6cba5cebe5a13738b535ab6b010a0fe1154689bad4df3ef49ed7bddc1075S3Bucket0337801D',
  Key: 'AssetParameters74fd6cba5cebe5a13738b535ab6b010a0fe1154689bad4df3ef49ed7bddc1075S3VersionKey144181B5',
};

export function linuxCloudWatchScriptBoilerplate(scriptParams: string) {
  return [
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_LINUX.Key },
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
            { Ref: CWA_ASSET_LINUX.Key },
          ],
        },
      ],
    },
    "')\naws s3 cp 's3://",
    {
      Ref: CWA_ASSET_LINUX.Bucket,
    },
    '/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_LINUX.Key },
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
            { Ref: CWA_ASSET_LINUX.Key },
          ],
        },
      ],
    },
    "' '/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_LINUX.Key },
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
            { Ref: CWA_ASSET_LINUX.Key },
          ],
        },
      ],
    },
    "'\nset -e\nchmod +x '/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_LINUX.Key },
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
            { Ref: CWA_ASSET_LINUX.Key },
          ],
        },
      ],
    },
    "'\n'/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_LINUX.Key },
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
            { Ref: CWA_ASSET_LINUX.Key },
          ],
        },
      ],
    },
    "' -i ",
    {
      Ref: 'AWS::Region',
    },
    ' ',
    {
      Ref: 'ConfigStringParameterC2BE550F',
    },
    "\nmkdir -p $(dirname '/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "')\naws s3 cp 's3://",
    {Ref: CONFIG_WORKER_ASSET_WINDOWS.Bucket},
    '/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' '/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "'\nmkdir -p $(dirname '/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
          ],
        },
      ],
    },
    '\')\naws s3 cp \'s3://',
    {Ref: CONFIG_WORKER_ASSET_LINUX.Bucket},
    '/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
          ],
        },
      ],
    },
    scriptParams,
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
  ];
}

export function linuxConfigureWorkerScriptBoilerplate(scriptParams: string) {
  return [
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "')\naws s3 cp 's3://",
    {Ref: CONFIG_WORKER_ASSET_WINDOWS.Bucket},
    '/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' '/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "'\nmkdir -p $(dirname '/tmp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
          ],
        },
      ],
    },
    '\')\naws s3 cp \'s3://',
    {Ref: CONFIG_WORKER_ASSET_LINUX.Bucket},
    '/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
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
            {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
          ],
        },
      ],
    },
    scriptParams,
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
  ];
}

export function windowsCloudWatchScriptBoilerplate(scriptParams: string) {
  return [
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_WINDOWS.Key },
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
            { Ref: CWA_ASSET_WINDOWS.Key },
          ],
        },
      ],
    },
    "' ) -ea 0\nRead-S3Object -BucketName '",
    { Ref: CWA_ASSET_WINDOWS.Bucket },
    "' -key '",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_WINDOWS.Key },
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
            { Ref: CWA_ASSET_WINDOWS.Key },
          ],
        },
      ],
    },
    "' -file 'C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_WINDOWS.Key },
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
            { Ref: CWA_ASSET_WINDOWS.Key },
          ],
        },
      ],
    },
    "' -ErrorAction Stop\n&'C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_WINDOWS.Key },
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
            { Ref: CWA_ASSET_WINDOWS.Key },
          ],
        },
      ],
    },
    "' -i ",
    { Ref: 'AWS::Region' },
    ' ',
    { Ref: 'ConfigStringParameterC2BE550F' },
    "\nif (!$?) { Write-Error 'Failed to execute the file \"C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            { Ref: CWA_ASSET_WINDOWS.Key },
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
            { Ref: CWA_ASSET_WINDOWS.Key },
          ],
        },
      ],
    },
    "\"' -ErrorAction Stop }\nmkdir (Split-Path -Path 'C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    '\' ) -ea 0\nRead-S3Object -BucketName \'',
    {Ref: CONFIG_WORKER_ASSET_WINDOWS.Bucket},
    '\' -key \'',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' -ErrorAction Stop\nmkdir (Split-Path -Path 'C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' ) -ea 0\nRead-S3Object -BucketName '",
    {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Bucket},
    "' -key '",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' -file 'C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    scriptParams,
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {
              Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
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
            {
              Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
            },
          ],
        },
      ],
    },
    '\nif (!$?) { Write-Error \'Failed to execute the file \"C:/temp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
  ];
}

export function windowsConfigureWorkerScriptBoilerplate(scriptParams: string) {
  return [
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    '\' ) -ea 0\nRead-S3Object -BucketName \'',
    {Ref: CONFIG_WORKER_ASSET_WINDOWS.Bucket},
    '\' -key \'',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' -ErrorAction Stop\nmkdir (Split-Path -Path 'C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' ) -ea 0\nRead-S3Object -BucketName '",
    {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Bucket},
    "' -key '",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    "' -file 'C:/temp/",
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
    scriptParams,
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {
              Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
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
            {
              Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
            },
          ],
        },
      ],
    },
    '\nif (!$?) { Write-Error \'Failed to execute the file \"C:/temp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
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
            {Ref: CONFIG_WORKER_PORT_ASSET_WINDOWS.Key},
          ],
        },
      ],
    },
  ];
}
