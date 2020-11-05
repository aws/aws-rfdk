/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import { VersionProviderResource } from '../handler';

describe('VersionProviderResource', () => {
  let versionProviderResource: VersionProviderResource;
  beforeEach(() => {
    versionProviderResource = new VersionProviderResource();
  });

  describe('implementsIVersionProviderResourceProperties', () => {
    test('correct input', async () => {
      expect(versionProviderResource['implementsIVersionProviderResourceProperties']({
        versionString: '10.1.9.2',
        forceRun: 'testValue',
      })).toBeTruthy();
    });

    test('correct input no forceRun', async () => {
      expect(versionProviderResource['implementsIVersionProviderResourceProperties']({
        versionString: '10.1.9.2',
      })).toBeTruthy();
    });

    test('correct input with no versionString', async () => {
      expect(versionProviderResource['implementsIVersionProviderResourceProperties']({})).toBeTruthy();
    });

    test('non-object input', async () => {
      expect(versionProviderResource['implementsIVersionProviderResourceProperties']('test')).toBeFalsy();
    });

    test('input with invalid versionString', async () => {
      expect(versionProviderResource['implementsIVersionProviderResourceProperties']({
        versionString: 'version',
      })).toBeFalsy();
    });

    test('input with invalid forceRun', async () => {
      expect(versionProviderResource['implementsIVersionProviderResourceProperties']({
        versionString: '10.1.9.2',
        forceRun: {},
      })).toBeFalsy();
    });
  });

  describe('parseS3BucketName', () => {
    test('correct input', () => {
      expect(versionProviderResource['parseS3BucketName']('s3://bucketName/objectKey')).toEqual('bucketName');
    });

    test.each([
      ':/bucketName/objectKey',
      's3:/bucketName/objectKey',
      's3://bucketName',
      'bucketName',
    ])('malformed input: %p', (s3Uri: string) => {
      expect(() => versionProviderResource['parseS3BucketName'](s3Uri)).toThrowError(/Could not parse S3 bucket name/);
    });
  });

  describe('parseS3ObjectKey', () => {
    test.each([
      ['s3://bucketName/objectKey', 'objectKey'],
      ['s3://bucketName/objectDirectory/objectName', 'objectDirectory/objectName'],
      ['s3://bucketName/objectDirectory/objectName.run', 'objectDirectory/objectName.run'],
      ['s3://bucketName/objectDirectory/10.1.9.2/objectName.run', 'objectDirectory/10.1.9.2/objectName.run'],
    ])('correct input: %p', (s3Uri: string, objectKey: string) => {
      expect(versionProviderResource['parseS3ObjectKey'](s3Uri)).toEqual(objectKey);
    });

    test.each([
      ':/bucketName/objectKey',
      's3:/bucketName/objectKey',
      's3://bucketName',
      'bucketName',
    ])('malformed input: %p', (s3Uri: string) => {
      expect(() => versionProviderResource['parseS3ObjectKey'](s3Uri)).toThrowError(/Could not parse S3 object key/);
    });
  });
});
