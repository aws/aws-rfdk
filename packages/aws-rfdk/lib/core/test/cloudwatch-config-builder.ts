/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {Duration} from 'aws-cdk-lib';
import {
  CloudWatchConfigBuilder,
  TimeZone,
} from '../lib';

test('Verify config with default values', () => {
  // WHEN
  const configBuilder = new CloudWatchConfigBuilder();
  const config = JSON.parse(configBuilder.generateCloudWatchConfiguration());

  // THEN
  expect(config).toMatchObject({
    logs: {
      log_stream_name: 'DefaultLogStream-{instance_id}',
      force_flush_interval: 60,
    },
  });
});

test('Verify config with custom values', () => {
  // WHEN
  const configBuilder = new CloudWatchConfigBuilder(Duration.minutes(2));
  const config = JSON.parse(configBuilder.generateCloudWatchConfiguration());

  // THEN
  expect(config).toMatchObject({
    logs: {
      force_flush_interval: 120,
    },
  });
});

test('Verify log config', () => {
  // WHEN
  const configBuilder = new CloudWatchConfigBuilder(Duration.minutes(2));
  configBuilder.addLogsCollectList('logGroupName',
    'testStream',
    '/var/log/test.log');
  configBuilder.addLogsCollectList('logGroupName2',
    'testStream2',
    '/var/log/test2.log',
    TimeZone.UTC);
  const config = JSON.parse(configBuilder.generateCloudWatchConfiguration());

  // THEN
  expect(config).toMatchObject({
    logs: {
      logs_collected: {
        files: {
          collect_list: [{
            file_path: '/var/log/test.log',
            log_group_name: 'logGroupName',
            log_stream_name: 'testStream-{instance_id}',
            timezone: 'Local',
          }, {
            file_path: '/var/log/test2.log',
            log_group_name: 'logGroupName2',
            log_stream_name: 'testStream2-{instance_id}',
            timezone: 'UTC',
          }],
        },
      },
    },
  });
});
