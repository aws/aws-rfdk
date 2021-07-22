/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  IVpc,
  Port,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from '@aws-cdk/aws-lambda';
import {
  RetentionDays,
} from '@aws-cdk/aws-logs';
import {
  ISecret,
} from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  CustomResource,
  Duration,
  Names,
} from '@aws-cdk/core';

import {
  IMongoDb,
} from '.';
import {
  LambdaLayer,
  LambdaLayerVersionArnMapping,
} from '../../lambdas/lambda-layer-version-arn-mapping';
import {
  IMongoDbConfigureResource,
} from '../../lambdas/nodejs/mongodb';

/**
 * User added to the $external admin database.
 * Referencing: https://docs.mongodb.com/v3.6/core/security-x.509/#member-certificate-requirements
 */
export interface MongoDbX509User {
  /**
   * The certificate of the user that they will use for authentication. This must be a secret
   * containing the plaintext string contents of the certificate in PEM format. For example,
   * the cert property of {@link IX509CertificatePem} is compatible with this.
   *
   * Some important notes:
   * 1. MongoDB **requires** that this username differ from the MongoDB server certificate
   * in at least one of: Organization (O), Organizational Unit (OU), or Domain Component (DC).
   * See: https://docs.mongodb.com/manual/tutorial/configure-x509-client-authentication/
   *
   * 2. The client certificate must be signed by the same Certificate Authority (CA) as the
   * server certificate that is being used by the MongoDB application.
   */
  readonly certificate: ISecret;

  /**
   * JSON-encoded string with the roles this user should be given.
   */
  readonly roles: string;
}

/**
 * This interface is for defining a set of users to pass to MongoDbPostInstallSetup so that it can
 * create them in the MongoDB.
 */
export interface MongoDbUsers {
  /**
   * Zero or more secrets containing credentials, and specification for users to be created in the
   * admin database for authentication using SCRAM. See: https://docs.mongodb.com/v3.6/core/security-scram/
   *
   * Each secret must be a JSON document with the following structure:
   *     {
   *         "username": <username of the user>,
   *         "password": <password of the user>,
   *         "roles": <a list of roles that the user is being given>
   *     }
   *
   * For examples of the roles list, see the MongoDB user creation documentation. For example,
   * https://docs.mongodb.com/manual/tutorial/create-users/
   *
   * @default No password-authenticated users are created.
   */
  readonly passwordAuthUsers?: ISecret[];

  /**
   * Information on the X.509-authenticated users that should be created.
   * See: https://docs.mongodb.com/v3.6/core/security-x.509/
   *
   * @default No x.509 authenticated users are created.
   */
  readonly x509AuthUsers?: MongoDbX509User[];
}

/**
 * Input properties for MongoDbPostInstallSetup.
 */
export interface MongoDbPostInstallSetupProps {
  /**
   * The VPC in which to create the network endpoint for the lambda function that is
   * created by this construct.
   */
  readonly vpc: IVpc;

  /**
   * Where within the VPC to place the lambda function's endpoint.
   *
   * @default The instance is placed within a Private subnet.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * The MongoDB that we will connect to to perform the post-installation steps upon.
   */
  readonly mongoDb: IMongoDb;

  /**
   * The Users that should be created in the MongoDB database. This construct will create these
   * users only if they do not already exist. If a user does already exist, then it will not be modified.
   */
  readonly users: MongoDbUsers;
}

/**
 * This construct performs post-installation setup on a MongoDB database by logging into the database, and
 * executing commands against it. To provide this functionality, this construct will create an AWS Lambda function
 * that is granted the ability to connect to the given MongoDB using its administrator credentials. This lambda
 * is run automatically when you deploy or update the stack containing this construct. Logs for all AWS Lambdas are
 * automatically recorded in Amazon CloudWatch.
 *
 * Presently, the only post-installation action that this construct can perform is creating users. There are two types
 * of users that it can create:
 * 1. Password-authenticated users -- these users will be created within the 'admin' database.
 * 2. X.509-authenticated users -- these users will be created within the '$external' database.
 *
 * Resources Deployed
 * ------------------------
 * - An AWS Lambda that is used to connect to the MongoDB application, and perform post-installation tasks.
 * - A CloudFormation Custom Resource that triggers execution of the Lambda on stack deployment, update, and deletion.
 * - An Amazon CloudWatch log group that records history of the AWS Lambda's execution.
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The AWS Lambda function that is created by this resource has access to both the MongoDB administrator credentials,
 *   and the MongoDB application port. An attacker that can find a way to modify and execute this lambda could use it to
 *   modify or read any data in the database. You should not grant any additional actors/principals the ability to modify
 *   or execute this Lambda.
 */
export class MongoDbPostInstallSetup extends Construct {
  constructor(scope: Construct, id: string, props: MongoDbPostInstallSetupProps) {
    super(scope, id);

    props.users.x509AuthUsers?.forEach( user => {
      try {
        JSON.parse(user.roles);
      } catch (e) {
        throw new Error(`MongoDbPostInstallSetup: Could not parse JSON role for x509 user: ${user.roles}`);
      }
    });

    const openSslLayer = LambdaLayerVersionArnMapping.getLambdaLayerVersion(this, 'OpenSslLayer', LambdaLayer.OPEN_SSL_AL2);

    const lamdbaFunc = new LambdaFunction(this, 'Lambda', {
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE },
      description: `Used by a MongoDbPostInstallSetup ${Names.uniqueId(this)} to perform post-installation setup on a MongoDB`,
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs'), {
        // Exclude commented out, for now, as a work-around for a CDK bug with at least CDK v1.49.1.
        // If we exclude files, then the asset hash is not calculated correctly and can result in updates to these
        // files not being picked up by the live system.
        // exclude: [
        //   '**/*',
        //   '!mongodb', '!mongodb/*',
        //   '!lib',
        //   '!lib/custom-resource', '!lib/custom-resource/*',
        //   '!lib/aws-lambda', '!lib/aws-lambda/*',
        //   '!lib/secrets-manager', '!lib/secrets-manager/*',
        //   '**/test',
        // ],
      }),
      environment: {
        DEBUG: 'false',
      },
      runtime: Runtime.NODEJS_12_X,
      handler: 'mongodb.configureMongo',
      layers: [ openSslLayer ],
      timeout: Duration.minutes(2),
      logRetention: RetentionDays.ONE_WEEK,
    });
    lamdbaFunc.connections.allowTo(props.mongoDb, Port.tcp(props.mongoDb.port));
    props.mongoDb.certificateChain.grantRead(lamdbaFunc.grantPrincipal);
    props.mongoDb.adminUser.grantRead(lamdbaFunc.grantPrincipal);
    props.users.passwordAuthUsers?.forEach( secret => secret.grantRead(lamdbaFunc) );
    props.users.x509AuthUsers?.forEach( user => user.certificate.grantRead(lamdbaFunc) );

    const properties: IMongoDbConfigureResource = {
      Connection: {
        Hostname: props.mongoDb.fullHostname,
        Port: props.mongoDb.port.toString(),
        CaCertificate: props.mongoDb.certificateChain.secretArn,
        Credentials: props.mongoDb.adminUser.secretArn,
      },
      PasswordAuthUsers: props.users.passwordAuthUsers?.map( secret => secret.secretArn ),
      X509AuthUsers: props.users.x509AuthUsers?.map( user => ({ Certificate: user.certificate.secretArn, Roles: user.roles }) ),
    };
    const resource = new CustomResource(this, 'Default', {
      serviceToken: lamdbaFunc.functionArn,
      resourceType: 'Custom::RFDK_MongoDbPostInstallSetup',
      properties,
    });
    // Prevents a race during a stack-update.
    resource.node.addDependency(lamdbaFunc.role!);

    /* istanbul ignore next */
    if (props.mongoDb.node.defaultChild) {
      // Add a dependency on the ASG within the StaticPrivateIpServer to ensure that
      // mongo is running before we try to login to it.
      resource.node.addDependency(props.mongoDb.node.defaultChild!.node.defaultChild!);
    }

    this.node.defaultChild = resource;
  }
}
