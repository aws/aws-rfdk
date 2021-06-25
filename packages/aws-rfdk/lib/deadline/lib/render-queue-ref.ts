/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ICertificate,
} from '@aws-cdk/aws-certificatemanager';
import {
  InstanceType,
  ISecurityGroup,
  IVpc,
  SubnetSelection,
} from '@aws-cdk/aws-ec2';
import {
  ContainerImage,
} from '@aws-cdk/aws-ecs';
import {
  ApplicationProtocol,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  IGrantable,
} from '@aws-cdk/aws-iam';
import {
  IPrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  IBucket,
} from '@aws-cdk/aws-s3';
import {
  ISecret,
} from '@aws-cdk/aws-secretsmanager';
import { Duration } from '@aws-cdk/core';
import {
  IX509CertificatePem,
  LogGroupFactoryProps,
} from '../../core';
import { IHost } from './host-ref';
import { IRepository } from './repository';
import { IVersion } from './version-ref';

/**
 * Parameters for the generation of a VPC-internal hostname for the RenderQueue.
 */
export interface RenderQueueHostNameProps {
  /**
   * The hostname to assign to the RenderQueue.
   * A valid hostname is 1 to 63 characters long and may only contain:
   *   * letters from A-Z
   *   * digits from 0 to 9
   *   * the hyphen (-)
   * It must start with a letter and end with a letter or digit.
   *
   * @default "renderqueue"
   */
  readonly hostname?: string;

  /**
   * The private zone to which the DNS A record for the render queue will be added.
   */
  readonly zone: IPrivateHostedZone;
}

/**
 * Constraints on the number of Deadline RCS processes that will be created as part
 * of this RenderQueue.
 *
 * The number of processes created will be equal to the desired capacity. Setting the minimum and
 * maximum capacity provides constraints for modifying the number of processes dynamically via,
 * say, the AWS Console.
 */
export interface RenderQueueSizeConstraints {

  /**
   * The number of Deadline RCS processes that you want to create as part of this RenderQueue.
   *
   * If this is set to a number, every deployment will reset the number of RCS processes
   * to this number. It is recommended to leave this value undefined.
   *
   * Deadline versions earlier than 10.1.10 do not support being horizontally scaled behind a load-balancer.
   * For these versions of Deadline, the desired number of processes can only be set to 1.
   *
   * @default The min size.
   */
  readonly desired?: number;

  /**
   * Minimum number of Deadline RCS processes that will serve RenderQueue requests.
   *
   * Deadline versions earlier than 10.1.10 do not support being horizontally scaled behind a load-balancer.
   * For these versions of Deadline, the minimum number of processes can only be set to 1, otherwise an error is thrown.
   *
   * The minimum that this value can be set to is 1.
   *
   * @default 1
   */
  readonly min?: number;

  /**
   * Maximum number of Deadline RCS processes that will serve RenderQueue requests.
   *
   * Deadline versions earlier than 10.1.10 do not support being horizontally scaled behind a load-balancer.
   * For these versions of Deadline, the maximum number of processes can only be set to 1, otherwise an error is thrown.
   *
   * The minimum that this value can be set to is 1.
   * This value cannot be less than `min` or `desired`.
   *
   * @default 1
   */
  readonly max?: number;
}

/**
 * Configuration for the health checks performed by the RenderQueue upon the Deadline RCS.
 * These health checks periodically query the Deadline RCS to ensure that it is still operating
 * nominally. If a Deadline RCS is found to not be operating nominally, then it will be terminated
 * and automatically replaced.
 *
 * Please see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html}
 * for additional information on this style of health check.
 */
export interface RenderQueueHealthCheckConfiguration {
  /**
   * The startup duration where we will not perform health checks on newly created RCS instances.
   * This should be at least a little longer than the time it takes for the Deadline RCS to start up.
   *
   * @default 5 Minutes
   */
  readonly gracePeriod?: Duration;

  /**
   * The approximate amount of time between health checks for an individual RCS instance.
   * The value provided must be between 5 and 300 seconds.
   *
   * @default 1 Minute
   */
  readonly checkInterval?: Duration;
}

/**
 * Properties for configuring external TLS connections between the Render Queue and Deadline clients.
 *
 * You must provide one of the following combinations of properties:
 *  -  acmCertificate ({@link @aws-cdk/aws-certificatemanager#ICertificate}) representing a certificate in ACM and
 *     acmCertificateChain ({@link @aws-cdk/aws-secretsmanager#ISecret}) containing the Certificate chain of the acmCertificate.
 *  -  rfdkCertificate ({@link IX509CertificatePem}) Representing all of the properties of the certificate.
 *
 * In both cases the certificate chain **must** include only the CA certificates PEM file due to a known limitation in Deadline.
 */
export interface RenderQueueExternalTLSProps {
  /**
   * Whether to enable TLS between the Render Queue and Deadline clients.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * The ACM certificate that will be used for establishing incoming external TLS connections to the RenderQueue.
   * @default: If not provided, rfdkCertificate will be used.
   */
  readonly acmCertificate?: ICertificate;

  /**
   * The secret containing the cert chain of the provided acmCert.
   *
   * This certifiate chain **must** include only the CA Certificates PEM file.
   *
   * @default: If an acmCertificate was provided then this must be provided, otherwise this is ignored.
   */
  readonly acmCertificateChain?: ISecret;

  /**
   * The parameters for an X509 Certificate that will be imported into ACM then used by the RenderQueue.
   *
   * @default: If rfdkCertificate and acmCertificate are both not provided, an rfdkCertificate will be generated and used.
   */
  readonly rfdkCertificate?: IX509CertificatePem;
}

/**
 * Interface to specify the protocols used (HTTP vs HTTPS) for communication between the Render Queue and clients and
 * internally between the components of the RenderQueue
 */
export interface RenderQueueTrafficEncryptionProps {
  /**
   * Properties for configuring external TLS connections between the Render Queue and Deadline clients.
   *
   * @default Plain HTTP communication is used
   */
  readonly externalTLS?: RenderQueueExternalTLSProps;

  /**
   * Whether to encrypt traffic between the Application Load Balancer and its backing services.
   *
   * @default HTTPS
   */
  readonly internalProtocol?: ApplicationProtocol;
}

/**
 * Collection of {@link ContainerImage}s required to deploy the RenderQueue.
 */
export interface RenderQueueImages {
  /**
   * The AWS ECS container image from which the Deadline RCS will be run. This container
   * **must** implement the same environment variable interface as defined in the official
   * container images provided by AWS-Thinkbox.
   *
   * Note: A future change to the RenderQueue will make this property optional.
   */
  readonly remoteConnectionServer: ContainerImage;
}

/**
 * Properties for enabling access logs for the Render Queue's load balancer. See
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html
 * for more information on what gets logged and how to access them.
 */
export interface RenderQueueAccessLogProps {
  /**
   * The S3 Bucket that the access logs should be stored in. It is recommended to set a lifecycle rule on
   * this Bucket to avoid having it grow indefinitely. Costs will be incurred for
   * requests made to put logs in the Bucket as well as storage.
   */
  readonly destinationBucket: IBucket;
  /**
   * The prefix to be used for the access logs when they are stored in S3.
   *
   * @default None
   */
  readonly prefix?: string;
}

/**
 * Security groups of the Render Queue.
 */
export interface RenderQueueSecurityGroups {
  /**
   * The security group for the backend components of the Render Queue, which consists of the AutoScalingGroup for the Deadline RCS.
   */
  readonly backend?: ISecurityGroup;
  /**
   * The security group for the frontend of the Render Queue, which is its load balancer.
   */
  readonly frontend?: ISecurityGroup;
}

/**
 * Properties for the Render Queue
 */
export interface RenderQueueProps {

  /**
   * The Deadline Client version that will be running within this RenderQueue.
   */
  readonly version: IVersion;

  /**
   * The Deadline Repository which the RCS instances will create a direct connection to.
   */
  readonly repository: IRepository;

  /**
   * A collection of Docker container images used to run the RenderQueue
   */
  readonly images: RenderQueueImages;

  /**
   * VPC to launch the Render Queue in.
   */
  readonly vpc: IVpc;

  /**
   * Where to place instances within the VPC
   *
   * @default - All Private subnets.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * The subnets into which to place the Application Load Balancer that is deployed.
   *
   * @default - One Private subnet from each AZ.
   */
  readonly vpcSubnetsAlb?: SubnetSelection;

  /**
   * Hostname to use to connect to the RenderQueue.
   *
   * @default: A private hosted host will be created and the default hostname will be used.
   */
  readonly hostname?: RenderQueueHostNameProps;

  /**
   * The type of instance on which each Deadline RCS will run.
   *
   * @default c5.Large instances will be launched.
   */
  readonly instanceType?: InstanceType;

  /**
   * Constraints on the number of Deadline RCS processes that can be run as part of this
   * RenderQueue.
   *
   * @default Allow no less than one Deadline RCS to be running.
   */
  readonly renderQueueSize?: RenderQueueSizeConstraints;

  /**
   * Whether or not network traffic to the RenderQueue should be encrypted.
   * Enabling this requires that all Deadline clients connect with TLS.
   *
   * @default traffic is encrypted between Clients and the Render Queue and between its components
   */
  readonly trafficEncryption?: RenderQueueTrafficEncryptionProps;

  /**
   * Configuration for the health checks performed by the RenderQueue upon the Deadline RCS.
   *
   * @default The values outlined in {@link RenderQueueHealthCheckConfiguration}
   */
  readonly healthCheckConfig?: RenderQueueHealthCheckConfiguration;

  /**
   * Properties for configuring access logging for the load balancer used by the Render
   * Queue. This is disabled by default, but it is highly recommended to enable it to
   * allow engineers to identify and root cause incidents such as unauthorized access.
   *
   * @default - Access logging is disabled
   */
  readonly accessLogs?: RenderQueueAccessLogProps;

  /**
   * Properties for setting up the Render Queue's LogGroup
   * @default - LogGroup will be created with all properties' default values and a prefix of "/renderfarm/".
   */
  readonly logGroupProps?: LogGroupFactoryProps;

  /**
   * Indicates whether deletion protection is enabled for the LoadBalancer.
   *
   * @default true
   *
   * Note: This value is true by default which means that the deletion protection is enabled for the
   * load balancer. Hence, user needs to disable it using AWS Console or CLI before deleting the stack.
   * @see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#deletion-protection
   */
  readonly deletionProtection?: boolean;

  /**
   * Security groups to use for the Render Queue.
   *
   * @default - new security groups are created
   */
  readonly securityGroups?: RenderQueueSecurityGroups;

  /**
   * If enabled, then Linux's cachefilesd will be installed and set to running on the
   * ECS container host for the Deadline Remote Connection Server. This can reduce
   * the amount of read throughput required for the Repository Filesystem.
   *
   * For more information, please see: https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/storage_administration_guide/ch-fscache
   *
   * Note: If enabling this, then your Repository filesystem may require additional
   * mount options to take advantage. Not every filesystem's driver supports integration
   * with cachefilesd. e.g. NFS and Amazon EFS do support it, and require the 'fsc' mount
   * option be provided.
   *
   * Note2: Your ECS container host will require access to port 80 on the regional S3 service
   * when enabling this option so that it can install cachefilesd. This host is based on
   * Amazon Linux 2, and the package repository for these systems is hosted on S3 and reached
   * via port 80.
   *
   * @default false
   */
  readonly enableLocalFileCaching?: boolean;
}

/**
 * Properties that need to be provided in order to connect an ECS service to a Render Queue
 */
export interface ECSConnectOptions {
  /**
   * The set of hosts that will be hosting the containers.
   *
   * This can be AutoScalingGroups that make up the capacity of an Amazon ECS cluster, or individual instances.
   */
  readonly hosts: IHost[];

  /**
   * The task definitions Role that needs permissions.
   */
  readonly grantee: IGrantable;
}

/**
 * Properties that need to be provided in order to connect instances to a Render Queue
 */
export interface InstanceConnectOptions {
  /**
   * The Instance/UserData which will directly connect to the Repository
   */
  readonly host: IHost;

  /**
   * Whether or not to start or restart the Deadline Launcher after configuring the connection.
   *
   * @default true
   */
  readonly restartLauncher?: boolean;
}
