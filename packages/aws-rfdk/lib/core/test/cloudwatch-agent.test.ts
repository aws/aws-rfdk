/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {App, Stack} from 'aws-cdk-lib';
import {
  Template,
} from 'aws-cdk-lib/assertions';
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  GenericWindowsImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  OperatingSystemType,
  Vpc,
  WindowsImage,
  WindowsVersion,
} from 'aws-cdk-lib/aws-ec2';
import {
  CloudWatchAgent,
  CloudWatchConfigBuilder,
} from '../lib';
import {
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
} from './asset-constants';

describe('CloudWatchAgent', () => {
  let stack: Stack;
  let vpc: Vpc;
  let cloudWatchConfig: string;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'VPC');

    // Generate CloudWatch Agent configuration JSON
    const configBuilder = new CloudWatchConfigBuilder();
    cloudWatchConfig = configBuilder.generateCloudWatchConfiguration();
  });

  test('creates an SSM parameter containing the configuration', () => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2023,
      }),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Value: cloudWatchConfig,
    });
  });

  test('creates an IAM policy to access the SSM parameter, CDK asset bucket, and CloudWatch agent bucket', () => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2023,
      }),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
            ],
            Effect: 'Allow',
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':s3:::',
                    { 'Fn::Sub': CWA_ASSET_LINUX.Bucket },
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':s3:::',
                    { 'Fn::Sub': CWA_ASSET_LINUX.Bucket },
                    '/*',
                  ],
                ],
              },
            ],
          },
          {
            Action: [
              'ssm:DescribeParameters',
              'ssm:GetParameters',
              'ssm:GetParameter',
              'ssm:GetParameterHistory',
            ],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  { Ref: 'AWS::Partition' },
                  ':ssm:',
                  { Ref: 'AWS::Region' },
                  ':',
                  { Ref: 'AWS::AccountId' },
                  ':parameter/',
                  { Ref: 'StringParameter472EED0E' },
                ],
              ],
            },
          },
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
            ],
            Effect: 'Allow',
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:aws:s3:::amazoncloudwatch-agent-',
                    { Ref: 'AWS::Region' },
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:aws:s3:::amazoncloudwatch-agent-',
                    { Ref: 'AWS::Region' },
                    '/*',
                  ],
                ],
              },
            ],
          },
          {
            Action: 's3:GetObject',
            Condition: {
              StringEquals: {
                's3:ResourceAccount': '224375009292',
              },
            },
            Effect: 'Allow',
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:aws:s3:::rfdk-external-dependencies-',
                    { Ref: 'AWS::Region' },
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:aws:s3:::rfdk-external-dependencies-',
                    { Ref: 'AWS::Region' },
                    '/*',
                  ],
                ],
              },
            ],
          },
        ],
        Version: '2012-10-17',
      },
      PolicyName: 'InstanceInstanceRoleDefaultPolicy4ACE9290',
      Roles: [ { Ref: 'InstanceInstanceRoleE9785DE5' } ],
    });
  });

  test.each([
    [' -i', undefined],
    [' -i', true],
    ['', false],
  ])('adds user data commands to fetch and execute the script (linux). installFlag: %s shouldInstallAgent: %p', (installFlag: string, shouldInstallAgent?: boolean) => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2023,
      }),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
      shouldInstallAgent,
    });

    // THEN
    const userData = stack.resolve(host.userData.render());
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          `#!/bin/bash\nmkdir -p $(dirname '/tmp/${CWA_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
          { 'Fn::Sub': CWA_ASSET_LINUX.Bucket },
          `/${CWA_ASSET_LINUX.Key}.sh' '/tmp/${CWA_ASSET_LINUX.Key}.sh'\nset -e\nchmod +x '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n'/tmp/${CWA_ASSET_LINUX.Key}.sh'${installFlag} `,
          { Ref: 'AWS::Region' },
          ' ',
          { Ref: 'StringParameter472EED0E' },
        ],
      ],
    });
  });

  test.each([
    [' -i', undefined],
    [' -i', true],
    ['', false],
  ])('adds user data commands to fetch and execute the script (windows). installFlag: %s shouldInstallAgent: %p', (installFlag: string, shouldInstallAgent?: boolean) => {
    // GIVEN
    const region = 'ap-southeast-1';
    const app = new App();
    const regionalStack = new Stack(app, 'stack', {env: {region}});
    const regionalVpc = new Vpc(regionalStack, 'vpc');

    const host = new Instance(regionalStack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new WindowsImage(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
      vpc: regionalVpc,
    });

    // WHEN
    new CloudWatchAgent(regionalStack, 'testResource', {
      cloudWatchConfig,
      host,
      shouldInstallAgent,
    });

    // THEN
    const userData = regionalStack.resolve(host.userData.render());
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          `<powershell>mkdir (Split-Path -Path 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
          { 'Fn::Sub': CWA_ASSET_WINDOWS.Bucket.replace('${AWS::Region}', region) },
          `' -key '${CWA_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n&'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1'${installFlag} ${region} `,
          { Ref: 'StringParameter472EED0E' },
          `\nif (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }</powershell>`,
        ],
      ],
    });
  });
});

describe('CloudWatchAgentRegionSupport', () => {
  const availableRegion = 'eu-north-1';
  const optInRegion = 'ap-east-1';

  // Generate CloudWatch Agent configuration JSON
  const configBuilder = new CloudWatchConfigBuilder();
  const cloudWatchConfig = configBuilder.generateCloudWatchConfiguration();

  test.each([
    ['Linux Available Region', OperatingSystemType.LINUX, availableRegion, true],
    ['Linux Opt-In Region', OperatingSystemType.LINUX, optInRegion, true],
    ['Windows Available Region', OperatingSystemType.WINDOWS, availableRegion, true ],
    ['Windows Opt-In Region', OperatingSystemType.WINDOWS, optInRegion, false],
  ])('CloudWatchAgent support for %s', (_scenarioName, osType, region, expectSuccess) => {
    const app = new App();
    const stack = new Stack(app, 'stack', {env: {region: region}});
    const vpc = new Vpc(stack, 'vpc');

    let machineImage;
    if (osType == OperatingSystemType.LINUX) {
      machineImage = new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2023,
      });
    } else {
      machineImage = new GenericWindowsImage({
        [availableRegion]: 'ami-aaaaaaaaaaaaaaaaa',
        [optInRegion]: 'ami-bbbbbbbbbbbbbbbbb',
      });
    }

    const host = new Instance(stack, 'instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: machineImage,
      vpc,
    });

    // WHEN
    function createCloudWatchAgent() {
      new CloudWatchAgent(stack, 'cloudWatchAgent', {
        cloudWatchConfig,
        host,
      });
    }

    // THEN
    if (expectSuccess) {
      expect(createCloudWatchAgent).not.toThrow(); // eslint-disable-line jest/no-conditional-expect
    } else {
      expect(createCloudWatchAgent).toThrow('Cannot install CloudWatch Agent'); // eslint-disable-line jest/no-conditional-expect
    }
  });
});
