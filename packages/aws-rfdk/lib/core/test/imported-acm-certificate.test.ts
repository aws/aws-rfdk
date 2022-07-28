/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  Metric,
  Statistic,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { CfnSecret } from 'aws-cdk-lib/aws-secretsmanager';

import { ImportedAcmCertificate } from '../lib/imported-acm-certificate';
import { X509CertificatePem } from '../lib/x509-certificate';

let stack: Stack;
let secretCert: X509CertificatePem;
let certPassphraseID: string;
let importedAcmCertificate: ImportedAcmCertificate;

describe('ImportedAcmCertificate', () => {
  beforeEach(() => {
    // GIVEN
    stack = new Stack(undefined, 'Stack', { env: { region: 'us-west-2' } });

    secretCert = new X509CertificatePem(stack, 'Pem', {
      subject: { cn: 'Server' },
    });
    certPassphraseID = stack.getLogicalId(secretCert.passphrase.node.defaultChild as CfnSecret);

    // WHEN
    importedAcmCertificate = new ImportedAcmCertificate(stack, 'AcmCert', {
      cert: secretCert.cert,
      certChain: secretCert.certChain,
      key: secretCert.key,
      passphrase: secretCert.passphrase,
    });
  });

  test('creates Custom::RFDK_AcmImportedCertificate', () => {
    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::RFDK_AcmImportedCertificate', {
      X509CertificatePem: {
        Cert: {
          'Fn::GetAtt': [
            'Pem',
            'Cert',
          ],
        },
        Key: {
          'Fn::GetAtt': [
            'Pem',
            'Key',
          ],
        },
        Passphrase: {
          Ref: certPassphraseID,
        },
        CertChain: '',
      },
      Tags: [
        {
          Key: 'AcmCertImport-F4E2ABF9',
          Value: 'f4e2abf974443234fdb095fafcfa9ee2',
        },
        {
          Key: 'Name',
          Value: 'f4e2abf974443234fdb095fafcfa9ee2',
        },
      ],
    });
  });

  describe('creates AWS::DynamoDB::Table for database', () => {
    test('with PhysicalID partition key', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::DynamoDB::Table', {
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'PhysicalId',
            AttributeType: 'S',
          },
        ]),
        KeySchema: Match.arrayWith([
          {
            AttributeName: 'PhysicalId',
            KeyType: 'HASH',
          },
        ]),
      });
    });

    test('with CustomResource sort key', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::DynamoDB::Table', {
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'CustomResource',
            AttributeType: 'S',
          },
        ]),
        KeySchema: Match.arrayWith([
          {
            AttributeName: 'CustomResource',
            KeyType: 'RANGE',
          },
        ]),
      });
    });
  });

  test('creates AWS::IAM::Policy', () => {
    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: [
              'dynamodb:BatchGetItem',
              'dynamodb:GetRecords',
              'dynamodb:GetShardIterator',
              'dynamodb:Query',
              'dynamodb:GetItem',
              'dynamodb:Scan',
              'dynamodb:ConditionCheckItem',
              'dynamodb:BatchWriteItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:DeleteItem',
              'dynamodb:DescribeTable',
            ],
          }),
          Match.objectLike({
            Action: 'dynamodb:DescribeTable',
          }),
          Match.objectLike({
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Resource: {
              'Fn::GetAtt': [
                'Pem',
                'Cert',
              ],
            },
          }),
          Match.objectLike({
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Resource: {
              'Fn::GetAtt': [
                'Pem',
                'Key',
              ],
            },
          }),
          {
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Resource: {
              Ref: certPassphraseID,
            },
          },
          Match.objectLike({
            Action: [
              'acm:AddTagsToCertificate',
              'acm:ImportCertificate',
            ],
            Condition: {
              StringEquals: {
                'aws:RequestTag/AcmCertImport-F4E2ABF9': 'f4e2abf974443234fdb095fafcfa9ee2',
              },
            },
            Resource: '*',
          }),
          Match.objectLike({
            Action: [
              'acm:DeleteCertificate',
              'acm:DescribeCertificate',
              'acm:GetCertificate',
            ],
            Resource: '*',
          }),
        ],
      },
    });
  });

  describe('custom resource lambda function', () => {
    test('uses correct handler', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'x509-certificate.importCert',
      });
    });

    test('uses RFDK lambda layer', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        Layers: Match.arrayWith([
          Match.stringLikeRegexp('arn:aws:lambda:us-west-2:224375009292:layer:openssl-al2:.*'),
        ]),
      });
    });

    test('sets DATABASE environment variable', () => {
      // GIVEN
      const table = importedAcmCertificate.node.findChild('Table') as Table;

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            DATABASE: stack.resolve(table.tableName),
          }),
        },
      });
    });
  });

  describe('applyRemovalPolicy', () => {
    test('default RemovalPolicy is Delete', () => {
      Template.fromStack(stack).hasResource('Custom::RFDK_AcmImportedCertificate', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
    });

    test('Different policy can be applied', () => {
      importedAcmCertificate.applyRemovalPolicy(RemovalPolicy.RETAIN);
      Template.fromStack(stack).hasResource('Custom::RFDK_AcmImportedCertificate', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });
  });

  describe('metricDaysToExpiry', () => {
    let metricExpiry: Metric;

    beforeEach(() => {
      // GIVEN
      metricExpiry = importedAcmCertificate.metricDaysToExpiry();
    });

    test('uses certificate ARN', () => {
      // THEN
      expect(metricExpiry.dimensions?.CertificateArn).toEqual(importedAcmCertificate.certificateArn);
    });

    test('uses correct metric', () => {
      // THEN
      expect(metricExpiry.metricName).toEqual('DaysToExpiry');
      expect(metricExpiry.namespace).toEqual('AWS/CertificateManager');
      expect(metricExpiry.statistic).toEqual(Statistic.MINIMUM);
    });
  });
});
