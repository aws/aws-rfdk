/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  countResources,
  expect as expectCDK,
  haveResourceLike,
  InspectionFailure,
} from '@aws-cdk/assert';
import { CfnSecret } from '@aws-cdk/aws-secretsmanager';
import { Stack } from '@aws-cdk/core';

import { ImportedAcmCertificate } from '../lib/imported-acm-certificate';
import { X509CertificatePem } from '../lib/x509-certificate';

test('Import cert', () => {
  const stack = new Stack(undefined, 'Stack', { env: { region: 'us-west-2' } });

  const secretCert = new X509CertificatePem(stack, 'Pem', {
    subject: { cn: 'Server' },
  });
  const certPassphraseID = stack.getLogicalId(secretCert.passphrase.node.defaultChild as CfnSecret);

  new ImportedAcmCertificate(stack, 'AcmCert', {
    cert: secretCert.cert,
    certChain: secretCert.certChain,
    key: secretCert.key,
    passphrase: secretCert.passphrase,
  });

  expectCDK(stack).to(haveResourceLike('Custom::RFDK_AcmImportedCertificate', {
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
  }));
  expectCDK(stack).to(countResources('AWS::DynamoDB::Table', 2));
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'dynamodb:BatchGetItem',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:Query',
            'dynamodb:GetItem',
            'dynamodb:Scan',
            'dynamodb:BatchWriteItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
          ],
        },
        {
          Action: 'dynamodb:DescribeTable',
        },
        {
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
        },
        {
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
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: certPassphraseID,
          },
        },
        {
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
        },
        {
          Action: [
            'acm:DeleteCertificate',
            'acm:GetCertificate',
          ],
          Resource: '*',
        },
      ],
    },
  }));

  // Expect Lambda for doing the cert importation to use the importCert() handler, openssl layer, and set DATABASE
  expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function', (props: any, error: InspectionFailure): boolean => {
    if (!props.Handler || props.Handler !== 'x509-certificate.importCert') {
      error.failureReason = 'x509-certificate.importCert handler not found';
      error.resource = props.Handler;
      return false;
    }
    // Our test for the correct openssl lambda layer does not include the version, so we use a filter
    // function to do a partial match
    const filterOpensslArn = (value: string) => {
      return value.toString().includes('arn:aws:lambda:us-west-2:224375009292:layer:openssl-al2:');
    };
    if (!props.Layers
      || !Array.isArray(props.Layers)
      || Array.of(props.Layers).filter(filterOpensslArn).length === 0) {
      error.failureReason = 'openssl Lambda Layer missing';
      error.resource = props.Layers;
      return false;
    }
    if (!props.Environment
      || !props.Environment.Variables
      || !props.Environment.Variables.DATABASE) {
      error.failureReason = 'DATABASE environment variable not set';
      error.resource = props.Environment?.Variables?.DATABASE;
      return false;
    }

    return true;
  }));
});