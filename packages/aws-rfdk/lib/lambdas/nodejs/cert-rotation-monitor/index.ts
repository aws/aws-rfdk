/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager, CloudWatch } from 'aws-sdk';

import {  Secret } from '../lib/secrets-manager';
import { Certificate } from '../lib/x509-certs';

const SECRETS_MANAGER_VERSION = '2017-10-17';

async function getSecretsByTag(secretsManager: SecretsManager, uniqueID: string): Promise<SecretsManager.SecretListType | undefined> {
  console.debug(`getSecretsByTag for secrets with tag ${uniqueID}`);
  // Looking for all certificates that contain tags with uniqueID.
  const request: SecretsManager.ListSecretsRequest = {
    Filters: [{
      Key: 'tag-value',
      Values: [uniqueID],
    }],
  };
  try {
    const response: SecretsManager.ListSecretsResponse = await secretsManager.listSecrets(request).promise();
    return response.SecretList;
  } catch (e) {
    throw new Error(`getSecretsByTag '${uniqueID}' failed':` +
      `${e.code} -- ${e.message}`);
  }
}

function putValueToMetric(value: number){
  const metric = {
    MetricData: [
      {
        MetricName: 'DaysToExpiry',
        Dimensions: [
          {
            Name: 'Certificate Metrics',
            Value: process.env.UNIQUEID!,
          },
        ],
        Unit: 'None',
        Value: value,
      },
    ],
    Namespace: 'AWS/RFDK',
  };
  const cloudwatch = new CloudWatch();
  cloudwatch.putMetricData(metric, (err) => {
    if (err) {
      console.log(`Failed to put value to CertDaysToExpiry metric: ${err}`);
    } else {
      console.log('Value was added to CertDaysToExpiry metric.');
    }
  });
}

/**
 * Lambda for adding metric about Secret expiration date.
 *
 */
export async function handler(): Promise<void> {
  const secretsManager = new SecretsManager({ apiVersion: SECRETS_MANAGER_VERSION });
  const secretsList = await getSecretsByTag(secretsManager, process.env.UNIQUEID!);
  if (secretsList) {
    for (const secret of secretsList) {
      if (secret.Name!.includes('X.509-Certificate-')) {
        const certificate = await Secret.fromArn(secret.ARN!, secretsManager).getValue();
        const expDate = await Certificate.getExpDate(certificate as string);
        if (expDate){
          const daysToExpiry = Math.ceil((expDate.getTime() - (new Date()).getTime())/(1000 * 3600 * 24));
          console.log(`Certificate '$${secret.ARN!}' has ${daysToExpiry} days before expire.`);
          putValueToMetric(daysToExpiry);
        }
      }
    }
  }
}
