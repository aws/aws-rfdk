/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  IVpc,
  // Port,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  Code,
  Function as LambdaFunction,
  LayerVersion,
  Runtime,
} from '@aws-cdk/aws-lambda';
import {
  RetentionDays,
} from '@aws-cdk/aws-logs';
// import {
//   ISecret,
// } from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  CustomResource,
  Duration,
  Stack,
} from '@aws-cdk/core';
import {
  ARNS,
} from '../../lambdas/lambdaLayerVersionArns';
import {
  ISEPConfiguratorResourceProperties,
} from '../../lambdas/nodejs/sep-configuration';
import {
  IRenderQueue,
} from './render-queue';
import {
  SEPSpotFleet,
} from './sep-spotfleet';

// TODO: remove this, we will import it properly
export class EventPluginRequests {
  constructor() {}

  public async saveServerData(): Promise<boolean> {
    return true;
  }

  public async saveSpotFleetRequestData(): Promise<boolean> {
    return true;
  }
}

// TODO: Probably we can get all this info from the renderqueue instead of
// readonly deadlineClient: DeadlineClientProperties;
// /**
//  * User added to the $external admin database.
//  * Referencing: https://docs.mongodb.com/v3.6/core/security-x.509/#member-certificate-requirements
//  */
// export interface DeadlineClientProperties {
//   /**
//    * The IP address or DNS name of the Remote Connection Server
//    */
//   readonly host: string;

//   /**
//    * The port number address of the Remote Connection Server
//    */
//   readonly port: number;

//   /**
//    * CA certificate
//    */
//   readonly certificate?: ISecret;

//   /**
//    * The PFX certificate
//    */
//   readonly pfx?: ISecret;

//   /**
//    * Shared passphrase used for a single private key and/or a PFX.
//    */
//   readonly passphrase?: ISecret;
// }

// export interface IConnectionOptions {
//   /**
//    * FQDN of the host to connect to.
//    */
//   readonly hostname: string;

//   /**
//    * Port on the host that is serving MongoDB.
//    */
//   readonly port: string;

//   /**
//    * ARN of a Secret containing the CA. The contents must be a PEM-encoded certificate in the SecretString of the secret.
//    */
//   readonly caCertificate?: string;

//   /**
//    * ARN of a Secret containing the PFX. The contents must be a PEM-encoded certificate in the SecretString of the secret.
//    */
//   readonly pfxCertificate?: string;
// }

/**
 * The input to this Custom Resource
 */
export interface ISEPConfigurationProperties {
  // /**
  //  * Connection info for logging into the server.
  //  */
  // readonly connection: IConnectionOptions;

  /**
   * TODO: add description
   */
  readonly spotFleets?: SEPSpotFleet[];

  /**
   * Todo: add description.
   */
  readonly enableResourceTracker?: boolean;

  /**
   * Todo: add description and type [Global Enabled | Disabled]
   */
  readonly state?: string;

  /**
   * Todo: add description and type [Off | Standard | Verbose | Debug]
   */
  readonly loggingLevel?: string;

  /**
   * Todo: add description
   */
  readonly region?: string;

  /**
   * Todo: add description
   */
  readonly idleShutdown?: number;

  /**
   * Todo: add description
   */
  readonly deleteSEPTerminatedWorkers?: boolean;

  /**
   * Todo: add description
   */
  readonly deleteEC2SpotInterruptedWorkers?: boolean;

  /**
   * Todo: add description
   */
  readonly strictHardCap?: boolean;

  /**
   * Todo: add description
   */
  readonly maximumInstancesStartedPerCycle?: number;

  /**
   * Todo: add description and type [Conservative | Ignore | Normal]
   */
  readonly preJobTaskMode?: string;

  /**
   * Todo: add description.
   */
  readonly groupPools?: any; // TODO wanted to use Map<string, string[]>

  /**
   * Todo: add description and type  [Disabled | ExtraInfo0 ... ExtraInfo9]
   */
  readonly awsInstanceStatus?: string;
}

/**
 * Input properties for MongoDbPostInstallSetup.
 */
export interface SEPConfigurationSetupProps {
  /**
   * The VPC in which to create the network endpoint for the lambda function that is
   * created by this construct.
   */
  readonly vpc: IVpc;

  /**
   * Endpoint for the RenderQueue, to which the worker fleet needs to be connected.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * Where within the VPC to place the lambda function's endpoint.
   *
   * @default The instance is placed within a Private subnet.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * TODO
   */
  readonly spotFleetOptions?: ISEPConfigurationProperties;
}

/**
 * This construct performs
 *
 * Resources Deployed
 * ------------------------
 *
 * Security Considerations
 * ------------------------
 */
export class SEPConfigurationSetup extends Construct {
  constructor(scope: Construct, id: string, props: SEPConfigurationSetupProps) {
    super(scope, id);

    const region = Stack.of(this).region;
    const openSslLayerName = 'openssl-al2';
    const openSslLayerArns: any = ARNS[openSslLayerName];
    const openSslLayerArn = openSslLayerArns[region];
    const openSslLayer = LayerVersion.fromLayerVersionArn(this, 'OpenSslLayer', openSslLayerArn);

    const lamdbaFunc = new LambdaFunction(this, 'Lambda', {
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE },
      description: `Used by a SpotFlletConfiguration ${this.node.addr} to perform configuration of Deadline Spot Event Plugin`,
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs'), {
      }),
      environment: {
        DEBUG: 'false',
      },
      runtime: Runtime.NODEJS_12_X,
      handler: 'sep-configuration.configureSEP',
      layers: [ openSslLayer ],
      timeout: Duration.minutes(2),
      logRetention: RetentionDays.ONE_WEEK,
    });

    // lamdbaFunc.connections.allowTo(props.mongoDb, Port.tcp(props.mongoDb.port));
    // props.renderQueue.certificateChain.grantRead(lamdbaFunc.grantPrincipal);
    // props.mongoDb.adminUser.grantRead(lamdbaFunc.grantPrincipal);
    // props.users.passwordAuthUsers?.forEach( secret => secret.grantRead(lamdbaFunc) );
    // props.users.x509AuthUsers?.forEach( user => user.certificate.grantRead(lamdbaFunc) );

    const properties: ISEPConfiguratorResourceProperties = {
      spotFleetRequestConfiguration: 'TODO:createCOnfigFromThis',
      spotPluginConfigurations: 'TODO:createConfigFromThis',
    };

    const resource = new CustomResource(this, 'Default', {
      serviceToken: lamdbaFunc.functionArn,
      resourceType: 'Custom::RFDK_SEPConfigurationSetup',
      properties,
    });
    // Prevents a race during a stack-update.
    resource.node.addDependency(lamdbaFunc.role!);

    // /* istanbul ignore next */
    // if (props.mongoDb.node.defaultChild) {
    //   // Add a dependency on the ASG within the StaticPrivateIpServer to ensure that
    //   // mongo is running before we try to login to it.
    //   resource.node.addDependency(props.mongoDb.node.defaultChild!.node.defaultChild!);
    // }

    this.node.defaultChild = resource;
  }
}
