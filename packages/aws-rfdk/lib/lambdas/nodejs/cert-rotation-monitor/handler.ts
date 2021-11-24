/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager, CloudWatch } from 'aws-sdk';

import { Secret } from '../lib/secrets-manager';
import { Certificate } from '../lib/x509-certs';

const SECRETS_MANAGER_VERSION = '2017-10-17';

export class CertificateRotationMonitor {
  public static METRIC_NAME = 'DaysToExpiry';
  public static METRIC_NAMESPACE = 'AWS/RFDK';
  public static METRIC_DIMENSION = 'Certificate Metrics';

  readonly uniqueID: string;

  constructor(uniqueID: string) {
    this.uniqueID = uniqueID;
  }

  private async getSecretsByTag(secretsManager: SecretsManager): Promise<SecretsManager.SecretListType | undefined> {
    // Looking for all certificates that contain tags with uniqueID.
    const request: SecretsManager.ListSecretsRequest = {
      Filters: [{
        Key: 'tag-value',
        Values: [this.uniqueID],
      }],
    };
    try {
      const response: SecretsManager.ListSecretsResponse = await secretsManager.listSecrets(request).promise();
      return response.SecretList;
    } catch (e) {
      throw new Error(`getSecretsByTag '${this.uniqueID}' failed':` +
        `${e.code} -- ${e.message}`);
    }
  }

  private putValueToMetric(value: number){
    const metric = {
      MetricData: [
        {
          MetricName: CertificateRotationMonitor.METRIC_NAME,
          Dimensions: [
            {
              Name: CertificateRotationMonitor.METRIC_DIMENSION,
              Value: this.uniqueID,
            },
          ],
          Unit: 'None',
          Value: value,
        },
      ],
      Namespace: CertificateRotationMonitor.METRIC_NAMESPACE,
    };
    const cloudwatch = new CloudWatch();
    cloudwatch.putMetricData(metric, (err) => {
      if (err) {
        console.log(`Failed to put value to CertDaysToExpiry metric: ${err.message}`);
      } else {
        console.log('Value was added to CertDaysToExpiry metric.');
      }
    });
  }

  public async handler(): Promise<void> {
    if ((process.env.DEBUG ?? 'false') !== 'true') {
      console.debug = () => { };
    }
    const secretsManager = new SecretsManager({ apiVersion: SECRETS_MANAGER_VERSION });
    const secretsList = await this.getSecretsByTag(secretsManager);
    if (secretsList) {
      // Here is expected that will be only one secret with uniqueID but even when more than one secret found the monitor should still work
      for (const secret of secretsList) {
        console.log(`Certificate '${secret.ARN!}' has been found with name '${secret.Name!}'.`);
        if (secret.Name!.includes('X.509-Certificate-')) {
          const certificate = await Secret.fromArn(secret.ARN!, secretsManager).getValue();
          const expDate = await Certificate.getExpDate(certificate as string);
          if (expDate){
            const daysToExpiry = Math.ceil((expDate.getTime() - (new Date()).getTime())/(1000 * 3600 * 24));
            console.log(`Certificate '${secret.ARN!}' has ${daysToExpiry} days before expire.`);
            this.putValueToMetric(daysToExpiry);
          }
        }
      }
    }
  }
}

/**
 * Lambda for adding metric about Secret expiration date.
 *
 */
/* istanbul ignore next */
export async function handler(): Promise<void> {
  const certRotationMonitor = new CertificateRotationMonitor(process.env.UNIQUEID!);
  await certRotationMonitor.handler();
}
