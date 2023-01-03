/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  CfnElement,
  CustomResource,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  CfnLaunchConfiguration,
} from 'aws-cdk-lib/aws-autoscaling';
import {
  Certificate,
} from 'aws-cdk-lib/aws-certificatemanager';
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  Port,
  SecurityGroup,
  Subnet,
  SubnetSelection,
  SubnetType,
  Vpc,
  WindowsVersion,
} from 'aws-cdk-lib/aws-ec2';
import {
  ContainerImage,
  Ec2TaskDefinition,
  TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationProtocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  AccountRootPrincipal,
  Role,
} from 'aws-cdk-lib/aws-iam';
import {
  PrivateHostedZone,
} from 'aws-cdk-lib/aws-route53';
import {
  Bucket,
} from 'aws-cdk-lib/aws-s3';
import {
  CfnSecret,
  Secret,
} from 'aws-cdk-lib/aws-secretsmanager';

import {
  ImportedAcmCertificate,
  X509CertificatePem,
} from '../..';
import { DeploymentInstance } from '../../core/lib/deployment-instance';
import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
  IVersion,
  RenderQueue,
  RenderQueueImages,
  RenderQueueProps,
  RenderQueueSecurityGroups,
  Repository,
  SecretsManagementRegistrationStatus,
  SecretsManagementRole,
  Version,
  VersionQuery,
} from '../lib';
import { SecretsManagementIdentityRegistration } from '../lib/secrets-management';
import {
  RQ_CONNECTION_ASSET,
} from './asset-constants';
import {
  resourcePropertiesCountIs,
} from './test-helper';

describe('RenderQueue', () => {
  let app: App;
  let dependencyStack: Stack;
  let stack: Stack;
  let vpc: Vpc;
  let rcsImage: ContainerImage;
  let images: RenderQueueImages;

  let version: IVersion;
  let renderQueueVersion: IVersion;

  // GIVEN
  beforeEach(() => {
    app = new App();
    dependencyStack = new Stack(app, 'DepStack');
    vpc = new Vpc(dependencyStack, 'Vpc');
    version = new VersionQuery(dependencyStack, 'Version');

    stack = new Stack(app, 'Stack');
    rcsImage = ContainerImage.fromAsset(__dirname);
    images = {
      remoteConnectionServer: rcsImage,
    };
    renderQueueVersion = new VersionQuery(stack, 'Version');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('basic', () => {
    let repository: Repository;
    let renderQueue: RenderQueue;

    beforeEach(() => {
      repository = new Repository(dependencyStack, 'Repo', {
        version,
        vpc,
      });
      renderQueue = new RenderQueue(stack, 'RenderQueue', {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
      });
    });

    test('creates cluster', () => {
      // THEN
      Template.fromStack(stack).resourceCountIs('AWS::ECS::Cluster', 1);
    });

    test('creates service', () => {
      // THEN
      Template.fromStack(stack).resourceCountIs('AWS::ECS::Service', 1);
    });

    test('creates task definition', () => {
      // THEN
      Template.fromStack(stack).resourceCountIs('AWS::ECS::TaskDefinition', 1);
    });

    test('closed ingress by default', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroup', Match.not({
        // The openListener=true option would create an ingress rule in the listener's SG.
        // make sure that we don't have that.
        // DDN - intentionally broke
        SecurityGroupIngress: Match.anyValue(),
      }));
    });

    test('creates load balancer with default values', () => {
      // THEN
      resourcePropertiesCountIs(stack, 'AWS::ElasticLoadBalancingV2::LoadBalancer', {
        LoadBalancerAttributes: Match.arrayWith([
          {
            Key: 'deletion_protection.enabled',
            Value: 'true',
          },
        ]),
        Scheme: 'internal',
      }, 1);
    });

    test('creates a log group with default prefix of "/renderfarm/"', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
        LogGroupName: '/renderfarm/RenderQueue',
        RetentionInDays: 3,
      });
    });

    test('configure the container log driver', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          Match.objectLike({
            LogConfiguration: {
              LogDriver: 'awslogs',
              Options: {
                'awslogs-group': {
                  'Fn::GetAtt': [
                    Match.stringLikeRegexp('^RenderQueueLogGroupWrapper.*'),
                    'LogGroupName',
                  ],
                },
                'awslogs-stream-prefix': 'RCS',
                'awslogs-region': { Ref: 'AWS::Region' },
              },
            },
          }),
        ],
      });
    });

    test('child dependencies added', () => {
      // GIVEN
      const host = new Instance(stack, 'Host', {
        vpc,
        instanceType: InstanceType.of(
          InstanceClass.R4,
          InstanceSize.LARGE,
        ),
        machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      });

      // WHEN
      renderQueue.addChildDependency(host);

      // THEN
      Template.fromStack(stack).hasResource('AWS::EC2::Instance', {
        DependsOn: Match.arrayWith([
          'RenderQueueAlbEc2ServicePatternService5B6692FB',
          'RenderQueueLBPublicListenerBBF15D5F',
          'RenderQueueRCSTaskA9AE70D3',
          'RenderQueueWaitForStableService4B92A8D2',
        ]),
      });
    });

    describe('renderQueueSize.min', () => {
      describe('defaults to 1', () => {
        function assertSpecifiesMinSize(stackToAssert: Stack) {
          Template.fromStack(stackToAssert).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
            MinSize: '1',
          });
        }

        test('renderQueueSize unspecified', () => {
          // THEN
          assertSpecifiesMinSize(stack);
        });

        test('renderQueueSize.min unspecified', () => {
          // GIVEN
          const isolatedStack = new Stack(app, 'IsolatedStack');

          // WHEN
          new RenderQueue(isolatedStack, 'RenderQueue', {
            images,
            repository,
            version: new VersionQuery(isolatedStack, 'Version'),
            vpc,
            renderQueueSize: {},
          });

          // THEN
          assertSpecifiesMinSize(isolatedStack);
        });
      });

      // Asserts that at least one RCS container and ASG instance must be created.
      test('throws error when minimum size is 0', () => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          renderQueueSize: {
            min: 0,
          },
        };

        // WHEN
        expect(() => {
          new RenderQueue(stack, 'RenderQueueTest', props);
        })
          // THEN
          .toThrow('renderQueueSize.min capacity must be at least 1: got 0');
      });

      // Deadline before 10.1.10 requires that successive API requests are serviced by a single RCS.
      test('validates Deadline pre 10.1.10 has min value of at most 1', () => {
        // GIVEN
        const min = 2;
        const newStack = new Stack(app, 'NewStack');
        const versionOld = new VersionQuery(newStack, 'VersionOld', {version: '10.1.9'});
        const props: RenderQueueProps = {
          images,
          repository,
          version: versionOld,
          vpc,
          renderQueueSize: {
            min,
          },
        };

        // WHEN
        expect(() => {
          new RenderQueue(newStack, 'RenderQueueTest', props);
        })
        // THEN
          .toThrow(`renderQueueSize.min for Deadline version less than 10.1.10.0 cannot be greater than 1 - got ${min}`);
      });

      // Asserts that when the renderQueueSize.min prop is specified, the underlying ASG's min property is set accordingly.
      test.each([
        [1],
        [2],
        [10],
      ])('configures minimum number of ASG instances to %d', (min: number) => {
        // GIVEN
        const isolatedStack = new Stack(app, 'IsolatedStack');
        const props: RenderQueueProps = {
          images,
          repository,
          version: new VersionQuery(isolatedStack, 'Version'),
          vpc,
          renderQueueSize: {
            min,
          },
        };

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);

        // THEN
        Template.fromStack(isolatedStack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
          MinSize: min.toString(),
        });
      });
    });

    describe('renderQueueSize.max', () => {
      describe('defaults to 1', () => {
        function assertSpecifiesMaxSize(stackToAssert: Stack) {
          Template.fromStack(stackToAssert).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
            MaxSize: '1',
          });
        }

        test('renderQueueSize unspecified', () => {
          // THEN
          assertSpecifiesMaxSize(stack);
        });

        test('renderQueueSize.max unspecified', () => {
          // GIVEN
          const isolatedStack = new Stack(app, 'IsolatedStack');

          // WHEN
          new RenderQueue(isolatedStack, 'RenderQueue', {
            images,
            repository,
            version: new VersionQuery(isolatedStack, 'Version'),
            vpc,
            renderQueueSize: {},
          });

          // THEN
          assertSpecifiesMaxSize(isolatedStack);
        });
      });

      // Deadline before 10.1.10 requires that successive API requests are serviced by a single RCS.
      test('validates Deadline pre 10.1.10 has max value of at most 1', () => {
        // GIVEN
        const max = 2;
        const newStack = new Stack(app, 'NewStack');
        const versionOld = new VersionQuery(newStack, 'VersionOld', {version: '10.1.9'});
        const props: RenderQueueProps = {
          images,
          repository,
          version: versionOld,
          vpc,
          renderQueueSize: {
            max,
          },
        };

        // WHEN
        expect(() => {
          new RenderQueue(newStack, 'RenderQueue', props);
        })
        // THEN
          .toThrow(`renderQueueSize.max for Deadline version less than 10.1.10.0 cannot be greater than 1 - got ${max}`);
      });

      // Asserts that when the renderQueueSize.max prop is specified, the underlying ASG's max property is set accordingly.
      test.each([
        [1],
        [2],
        [10],
      ])('configures maximum number of ASG instances to %d', (max: number) => {
        // GIVEN
        const isolatedStack = new Stack(app, 'IsolatedStack');
        const props: RenderQueueProps = {
          images,
          repository,
          version: new VersionQuery(isolatedStack, 'Version'),
          vpc,
          renderQueueSize: {
            max,
          },
        };

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);

        // THEN
        Template.fromStack(isolatedStack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
          MaxSize: max.toString(),
        });
      });
    });

    describe('renderQueueSize.desired', () => {
      describe('defaults', () => {
        test('unset ASG desired', () => {
          Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
            DesiredCapacity: Match.absent(),
          });
          Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
            DesiredCount: 1,
          });
        });
      });

      test('validates Deadline pre 10.1.10 has desired value of at most 1', () => {
        // GIVEN
        const desired = 2;
        const newStack = new Stack(app, 'NewStack');
        const versionOld = new VersionQuery(newStack, 'VersionOld', {version: '10.1.9'});
        const props: RenderQueueProps = {
          images,
          repository,
          version: versionOld,
          vpc,
          renderQueueSize: {
            desired,
          },
        };

        // WHEN
        expect(() => {
          new RenderQueue(newStack, 'RenderQueue', props);
        })
          // THEN
          .toThrow(`renderQueueSize.desired for Deadline version less than 10.1.10.0 cannot be greater than 1 - got ${desired}`);
      });

      test.each([
        [1],
        [2],
        [10],
      ])('is specified to %d', (desired: number) => {
        // GIVEN
        const isolatedStack = new Stack(app, 'IsolatedStack');
        const props: RenderQueueProps = {
          images,
          repository,
          version: new VersionQuery(isolatedStack, 'Version'),
          vpc,
          renderQueueSize: {
            desired,
          },
        };

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);

        // THEN
        Template.fromStack(isolatedStack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
          DesiredCapacity: desired.toString(),
        });
        // THEN
        Template.fromStack(isolatedStack).hasResourceProperties('AWS::ECS::Service', {
          DesiredCount: desired,
        });
      });
    });

    test('creates WaitForStableService by default', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_WaitForStableService', {
        cluster: stack.resolve(renderQueue.cluster.clusterArn),
        // eslint-disable-next-line dot-notation
        services: [stack.resolve(renderQueue['pattern'].service.serviceArn)],
      });
    });

    test('Does not enable filesystem cache by default', () => {
      resourcePropertiesCountIs(stack, 'AWS::AutoScaling::LaunchConfiguration', {
        UserData: {
          'Fn::Base64': {
            'Fn::Join': [
              '',
              Match.arrayWith([
                Match.stringLikeRegexp('.*# RenderQueue file caching enabled.*'),
              ]),
            ],
          },
        },
      }, 0);
    });

    test('runs as RCS user', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({ User: '1000:1000' }),
        ]),
      });
    });

    test('.backendConnections is associated with ASG security group rules', () => {
      // GIVEN
      const instance = new Instance(dependencyStack, 'BackendConnectionInstance', {
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
        machineImage: MachineImage.latestAmazonLinux(),
        vpc,
      });
      const portNumber = 5555;
      const port = Port.tcp(portNumber);
      const asgSecurityGroup = renderQueue.asg.connections.securityGroups[0];

      // WHEN
      renderQueue.backendConnections.allowFrom(instance, port);

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        Description: `from ${instance.connections.securityGroups[0].uniqueId}:${portNumber}`,
        GroupId: stack.resolve(asgSecurityGroup.securityGroupId),
        SourceSecurityGroupId: stack.resolve(instance.connections.securityGroups[0].securityGroupId),
        FromPort: portNumber,
        ToPort: portNumber,
      });
    });
  });

  describe('trafficEncryption', () => {
    describe('defaults', () => {
      let repository: Repository;

      beforeEach(() => {
        // GIVEN
        repository = new Repository(dependencyStack, 'Repo', {
          version,
          vpc,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          trafficEncryption: {},
        };

        // WHEN
        new RenderQueue(stack, 'RenderQueue', props);
      });

      // THEN
      test('to HTTPS internally between ALB and RCS', () => {
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
          Protocol: 'HTTPS',
          Port: 4433,
        });
      });

      test('to HTTPS externally between clients and ALB', () => {
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
          Protocol: 'HTTPS',
          Port: 4433,
        });
      });
    });

    describe('when interalProtocol is HTTPS', () => {
      let repository: Repository;
      let renderQueue: RenderQueue;
      let caCertPemLogicalId: string;
      let caCertPkcsLogicalId: string;
      let caCertPkcsPassphraseLogicalId: string;

      beforeEach(() => {
        // GIVEN
        repository = new Repository(dependencyStack, 'Repo', {
          version,
          vpc,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          trafficEncryption: {
            internalProtocol: ApplicationProtocol.HTTPS,
          },
        };

        // WHEN
        renderQueue = new RenderQueue(stack, 'RenderQueue', props);

        caCertPemLogicalId = stack.getLogicalId(
          renderQueue.node.findChild('TlsCaCertPem').node.defaultChild as CfnElement,
        );
        const caCertPkcs = renderQueue.node.findChild('TlsRcsCertBundle');
        const caCertPkcsPassphrase = caCertPkcs.node.findChild('Passphrase');
        caCertPkcsLogicalId = stack.getLogicalId(caCertPkcs.node.defaultChild as CfnElement);
        caCertPkcsPassphraseLogicalId = stack.getLogicalId(caCertPkcsPassphrase.node.defaultChild as CfnElement);
      });

      // THEN
      test('ALB connects with HTTPS to port 4433', () => {
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
          Protocol: 'HTTPS',
          Port: 4433,
        });
      });

      test('creates RCS cert', () => {
        Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', {
          ServiceToken: {
            'Fn::GetAtt': Match.arrayWith(['Arn']),
          },
          DistinguishedName: { CN: 'renderfarm.local' },
          Secret: {
            NamePrefix: 'Stack/RenderQueue/TlsCaCertPem',
          },
        });
      });

      test('grants read access to secrets containing the certs and passphrase', () => {
        const taskDef = renderQueue.node.findChild('RCSTask') as TaskDefinition;
        const taskRoleLogicalId = stack.getLogicalId((taskDef.taskRole as Role).node.defaultChild as CfnElement);
        Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: Match.arrayWith([
              {
                Action: [
                  'secretsmanager:GetSecretValue',
                  'secretsmanager:DescribeSecret',
                ],
                Effect: 'Allow',
                Resource: {
                  'Fn::GetAtt': [
                    caCertPemLogicalId,
                    'Cert',
                  ],
                },
              },
              {
                Action: [
                  'secretsmanager:GetSecretValue',
                  'secretsmanager:DescribeSecret',
                ],
                Effect: 'Allow',
                Resource: {
                  'Fn::GetAtt': [
                    caCertPkcsLogicalId,
                    'Cert',
                  ],
                },
              },
              {
                Action: [
                  'secretsmanager:GetSecretValue',
                  'secretsmanager:DescribeSecret',
                ],
                Effect: 'Allow',
                Resource: { Ref: caCertPkcsPassphraseLogicalId },
              },
            ]),
            Version: '2012-10-17',
          },
          Roles: Match.arrayWith([{ Ref: taskRoleLogicalId }]),
        });
      });

      test('configures environment variables for cert secret URIs', () => {
        Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
          ContainerDefinitions: Match.arrayWith([
            Match.objectLike({
              Environment: Match.arrayWith([
                {
                  Name: 'RCS_TLS_CA_CERT_URI',
                  Value: {
                    'Fn::GetAtt': [
                      caCertPemLogicalId,
                      'Cert',
                    ],
                  },
                },
                {
                  Name: 'RCS_TLS_CERT_URI',
                  Value: {
                    'Fn::GetAtt': [
                      caCertPkcsLogicalId,
                      'Cert',
                    ],
                  },
                },
                {
                  Name: 'RCS_TLS_CERT_PASSPHRASE_URI',
                  Value: { Ref: caCertPkcsPassphraseLogicalId },
                },
              ]),
            }),
          ]),
        });
      });
    });

    describe('when internal protocol is HTTP', () => {
      let repository: Repository;

      beforeEach(() => {
        // GIVEN
        repository = new Repository(dependencyStack, 'NonSMRepository', {
          vpc,
          version,
          secretsManagementSettings: { enabled: false },
        });
        const props: RenderQueueProps = {
          images,
          repository: repository,
          version: renderQueueVersion,
          vpc,
          trafficEncryption: {
            internalProtocol: ApplicationProtocol.HTTP,
            externalTLS: { enabled: false },
          },
        };

        // WHEN
        new RenderQueue(stack, 'RenderQueue', props);
      });

      // THEN
      test('no certs are created', () => {
        Template.fromStack(stack).resourceCountIs('Custom::RFDK_X509Generator', 0);
      });

      test('ALB connects with HTTP to port 8080', () => {
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
          Protocol: 'HTTP',
          Port: 8080,
        });
      });
    });

    describe('externalProtocol is HTTPS', () => {
      let repository: Repository;
      const CERT_ARN = 'certarn';
      const CA_ARN = 'arn:aws:secretsmanager:123456789012:secret:ca/arn';
      const ZONE_NAME = 'renderfarm.local';

      beforeEach(() => {
        // GIVEN
        repository = new Repository(dependencyStack, 'Repo', {
          version,
          vpc,
          // Cannot have secrets management unless external TLS is enabled on the RQ,
          // so we disable it to allow for testing.
          secretsManagementSettings: { enabled: false },
        });
        const zone = new PrivateHostedZone(stack, 'RenderQueueZone', {
          vpc,
          zoneName: ZONE_NAME,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          trafficEncryption: {
            externalTLS: {
              acmCertificate: Certificate.fromCertificateArn(stack, 'Certificate', CERT_ARN),
              acmCertificateChain: Secret.fromSecretPartialArn(stack, 'CA_Cert', CA_ARN),
            },
          },
          hostname: {
            hostname: 'renderqueue',
            zone,
          },
        };

        // WHEN
        new RenderQueue(stack, 'RenderQueue', props);
      });

      test('sets the listener port to 4433', () => {
        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
          Port: 4433,
        });
      });

      test('sets the listener protocol to HTTPS', () => {
        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
          Protocol: 'HTTPS',
        });
      });

      test('configures the ALB listener to use the specified ACM certificate', () => {
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
          Protocol: 'HTTPS',
          Certificates: Match.arrayWith([{
            CertificateArn: CERT_ARN,
          }]),
        });
      });

      test('raises an error when a cert is specified without a hosted zone', () => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          trafficEncryption: {
            externalTLS: {
              acmCertificate: Certificate.fromCertificateArn(stack, 'Cert', 'certArn'),
              acmCertificateChain: Secret.fromSecretPartialArn(stack, 'CA_Cert2', CA_ARN),
            },
          },
        };

        // WHEN
        expect(() => {
          new RenderQueue(stack, 'RenderQueueTest', props);
        })
          // THEN
          .toThrow(/The hostname for the render queue must be defined if supplying your own certificates./);
      });

      test('raises an error when a cert is specified without a hostname', () => {
        // GIVEN
        const zone = new PrivateHostedZone(stack, 'RenderQueueZoneNoName', {
          vpc,
          zoneName: ZONE_NAME,
        });

        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          trafficEncryption: {
            externalTLS: {
              acmCertificate: Certificate.fromCertificateArn(stack, 'Cert', 'certArn'),
              acmCertificateChain: Secret.fromSecretPartialArn(stack, 'CA_Cert2', CA_ARN),
            },
          },
          hostname: { zone },
        };

        // WHEN
        expect(() => {
          new RenderQueue(stack, 'RenderQueueTest', props);
        })
          // THEN
          .toThrow(/A hostname must be supplied if a certificate is supplied, with the common name of the certificate matching the hostname \+ domain name/);
      });
    });

    describe('externalProtocol is HTTPS importing cert', () => {
      describe('passing cases', () => {
        let repository: Repository;
        let zone: PrivateHostedZone;
        const ZONE_NAME = 'renderfarm.local';
        const HOSTNAME = 'server';

        beforeEach(() => {
          // GIVEN
          repository = new Repository(dependencyStack, 'NonSMRepository', {
            vpc,
            version,
            // Cannot have secrets management unless external TLS is enabled on the RQ,
            // so we disable it to allow for testing.
            secretsManagementSettings: { enabled: false },
          });

          zone = new PrivateHostedZone(stack, 'RenderQueueZone', {
            vpc,
            zoneName: ZONE_NAME,
          });

          const caCert = new X509CertificatePem(stack, 'CaCert', {
            subject: {
              cn: `ca.${ZONE_NAME}`,
            },
          });
          const serverCert = new X509CertificatePem(stack, 'ServerCert', {
            subject: {
              cn: `${HOSTNAME}.${ZONE_NAME}`,
            },
            signingCertificate: caCert,
          });

          const props: RenderQueueProps = {
            images,
            repository,
            version: renderQueueVersion,
            vpc,
            trafficEncryption: {
              externalTLS: {
                rfdkCertificate: serverCert,
              },
              internalProtocol: ApplicationProtocol.HTTP,
            },
            hostname: {
              zone,
              hostname: HOSTNAME,
            },
          };

          // WHEN
          new RenderQueue(stack, 'RenderQueue', props);
        });

        test('sets the listener port to 4433', () => {
          // THEN
          Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
            Port: 4433,
          });
        });

        test('sets the listener protocol to HTTPS', () => {
          // THEN
          Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
            Protocol: 'HTTPS',
          });
        });

        test('Imports Cert to ACM', () => {
          // THEN
          Template.fromStack(stack).hasResourceProperties('Custom::RFDK_AcmImportedCertificate', {
            X509CertificatePem: {
              Cert: {
                'Fn::GetAtt': [
                  'ServerCert',
                  'Cert',
                ],
              },
              Key: {
                'Fn::GetAtt': [
                  'ServerCert',
                  'Key',
                ],
              },
              Passphrase: {
                Ref: 'ServerCertPassphraseE4C3CB38',
              },
              CertChain: {
                'Fn::GetAtt': [
                  'ServerCert',
                  'CertChain',
                ],
              },
            },
          });
        });
      });

      describe('failure cases,', () => {
        test('Throws when missing cert chain', () => {
          const ZONE_NAME = 'renderfarm.local';
          const HOSTNAME = 'server';
          // GIVEN
          const repository = new Repository(dependencyStack, 'Repo', {
            version,
            vpc,
          });
          const zone = new PrivateHostedZone(stack, 'RenderQueueZone', {
            vpc,
            zoneName: ZONE_NAME,
          });

          const rootCert = new X509CertificatePem(stack, 'RootCert', {
            subject: {
              cn: `ca.${ZONE_NAME}`,
            },
          });

          const props: RenderQueueProps = {
            images,
            repository,
            version: renderQueueVersion,
            vpc,
            trafficEncryption: {
              externalTLS: {
                rfdkCertificate: rootCert,
              },
              internalProtocol: ApplicationProtocol.HTTP,
            },
            hostname: {
              zone,
              hostname: HOSTNAME,
            },
          };

          // WHEN
          expect(() => {
            new RenderQueue(stack, 'RenderQueue', props);
          })
            // THEN
            .toThrow(/Provided rfdkCertificate does not contain a certificate chain/);
        });
      });
    });

    test('Creates default RFDK cert if no cert given', () => {
      // GIVEN
      const repository = new Repository(dependencyStack, 'Repo', {
        version,
        vpc,
      });

      const props: RenderQueueProps = {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
        trafficEncryption: {
          externalTLS: {
          },
        },
      };

      const rq = new RenderQueue(stack, 'RenderQueue', props);

      const rootCa = rq.node.findChild('RootCA') as X509CertificatePem;
      const rootCaGen = rootCa.node.defaultChild as CustomResource;
      const rfdkCert = rq.node.findChild('RenderQueuePemCert') as X509CertificatePem;
      const rfdkCertGen = rfdkCert.node.defaultChild as CustomResource;
      const acmCert = rq.node.findChild('AcmCert') as ImportedAcmCertificate;

      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', {
        Passphrase: stack.resolve(rootCa.passphrase.secretArn),
      });

      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', {
        Passphrase: stack.resolve(rfdkCert.passphrase.secretArn),
        SigningCertificate: {
          Cert: stack.resolve(rootCaGen.getAtt('Cert')),
          Key: stack.resolve(rootCaGen.getAtt('Key')),
          Passphrase: stack.resolve(rootCa.passphrase.secretArn),
          CertChain: '',
        },
      });

      Template.fromStack(stack).resourceCountIs('Custom::RFDK_AcmImportedCertificate', 1);
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_AcmImportedCertificate', {
        X509CertificatePem: {
          Cert: stack.resolve(rfdkCertGen.getAtt('Cert')),
          Key: stack.resolve(rfdkCertGen.getAtt('Key')),
          Passphrase: stack.resolve(rfdkCert.passphrase.secretArn),
          CertChain: stack.resolve(rfdkCertGen.getAtt('CertChain')),
        },
      });

      Template.fromStack(stack).resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);
      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
        Certificates: [
          {
            CertificateArn: stack.resolve(acmCert.certificateArn),
          },
        ],
      });
    });

    test('Throws if given ACM cert and RFDK Cert', () => {
      // GIVEN
      const ZONE_NAME = 'renderfarm.local';
      const CERT_ARN = 'certArn';
      const CA_ARN = 'arn:aws:secretsmanager:123456789012:secret:ca/arn';

      const repository = new Repository(dependencyStack, 'Repo', {
        version,
        vpc,
      });
      const zone = new PrivateHostedZone(stack, 'RenderQueueZone', {
        vpc,
        zoneName: ZONE_NAME,
      });

      const caCert = new X509CertificatePem(stack, 'CaCert', {
        subject: {
          cn: `ca.${ZONE_NAME}`,
        },
      });
      const serverCert = new X509CertificatePem(stack, 'ServerCert', {
        subject: {
          cn: `server.${ZONE_NAME}`,
        },
        signingCertificate: caCert,
      });

      const props: RenderQueueProps = {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
        trafficEncryption: {
          externalTLS: {
            acmCertificate: Certificate.fromCertificateArn(stack, 'Certificate', CERT_ARN),
            acmCertificateChain: Secret.fromSecretPartialArn(stack, 'CA_Cert', CA_ARN),
            rfdkCertificate: serverCert,
          },
        },
        hostname: {
          zone,
        },
      };

      // WHEN
      expect(() => {
        new RenderQueue(stack, 'RenderQueue', props);
      })
        // THEN
        .toThrow(/Exactly one of externalTLS.acmCertificate and externalTLS.rfdkCertificate must be provided when using externalTLS/);
    });

    test('Throws if ACM Cert is given without a cert chain', () => {
      // GIVEN
      const HOSTNAME = 'renderqueue';
      const ZONE_NAME = 'renderfarm.local';
      const CERT_ARN = 'certArn';

      const repository = new Repository(dependencyStack, 'Repo', {
        version,
        vpc,
      });

      const zone = new PrivateHostedZone(stack, 'RenderQueueZone', {
        vpc,
        zoneName: ZONE_NAME,
      });

      const props: RenderQueueProps = {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
        trafficEncryption: {
          externalTLS: {
            acmCertificate: Certificate.fromCertificateArn(stack, 'Certificate', CERT_ARN),
          },
        },
        hostname: {
          hostname: HOSTNAME,
          zone,
        },
      };

      // WHEN
      expect(() => {
        new RenderQueue(stack, 'RenderQueue', props);
      })
        // THEN
        .toThrow(/externalTLS.acmCertificateChain must be provided when using externalTLS.acmCertificate./);
    });
  });

  describe('Client Connection', () => {
    describe('externalProtocol is http', () => {
      let repository: Repository;
      let renderQueue: RenderQueue;
      let zone: PrivateHostedZone;
      const ZONE_NAME = 'renderfarm.local';

      beforeEach(() => {
        // GIVEN
        repository = new Repository(dependencyStack, 'NonSMRepository', {
          vpc,
          version,
          // Cannot have secrets management unless external TLS is enabled on the RQ,
          // so we disable it to allow for testing.
          secretsManagementSettings: { enabled: false },
        });
        zone = new PrivateHostedZone(stack, 'RenderQueueZone', {
          vpc,
          zoneName: ZONE_NAME,
        });

        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          hostname: {
            zone,
          },
          trafficEncryption: { externalTLS: { enabled: false } },
        };

        // WHEN
        renderQueue = new RenderQueue(stack, 'RenderQueue', props);
      });

      test('ECS can connect', () => {
        // WHEN
        const hosts = [new Instance(stack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        })];
        const role = new Role(stack, 'Role', {assumedBy: new AccountRootPrincipal()});

        const env = renderQueue.configureClientECS({
          hosts,
          grantee: role,
        });

        // THEN
        expect(env).toHaveProperty('RENDER_QUEUE_URI');
        expect(env.RENDER_QUEUE_URI).toMatch(/http:\/\/.*:8080$/);

        Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 8080,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              stack.getLogicalId(hosts[0].connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        });

        Template.fromStack(stack).hasResource('AWS::EC2::Instance', {
          DependsOn: Match.arrayWith([
            'RenderQueueLBPublicListenerBBF15D5F',
            'RenderQueueRCSTaskA9AE70D3',
          ]),
        });
      });

      test('Linux Instance can connect', () => {
        // WHEN
        const host = new Instance(stack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        });

        renderQueue.configureClientInstance({
          host,
        });

        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
          UserData: {
            'Fn::Base64': {
              'Fn::Join': [
                '',
                [
                  '#!/bin/bash\n' +
                  `mkdir -p $(dirname '/tmp/${RQ_CONNECTION_ASSET.Key}.py')\n` +
                  'aws s3 cp \'s3://',
                  {
                    'Fn::Sub': RQ_CONNECTION_ASSET.Bucket,
                  },
                  `/${RQ_CONNECTION_ASSET.Key}.py' '/tmp/${RQ_CONNECTION_ASSET.Key}.py'\n` +
                  'if [ -f "/etc/profile.d/deadlineclient.sh" ]; then\n' +
                  '  source "/etc/profile.d/deadlineclient.sh"\n' +
                  'fi\n' +
                  `"\${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/${RQ_CONNECTION_ASSET.Key}.py" --render-queue "http://renderqueue.${ZONE_NAME}:8080" \n` +
                  `rm -f "/tmp/${RQ_CONNECTION_ASSET.Key}.py"\n` +
                  'if service --status-all | grep -q "Deadline 10 Launcher"; then\n' +
                  '  service deadline10launcher restart\n' +
                  'fi',
                ],
              ],
            },
          },
        });

        // Make sure we execute the script with the correct args
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 8080,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              stack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        });

        Template.fromStack(stack).hasResource('AWS::EC2::Instance', {
          DependsOn: Match.arrayWith([
            'RenderQueueLBPublicListenerBBF15D5F',
            'RenderQueueRCSTaskA9AE70D3',
          ]),
        });
      });

      test('Windows Instance can connect', () => {
        // WHEN
        const host = new Instance(stack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestWindows( WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_CORE_BASE),
        });

        renderQueue.configureClientInstance({
          host,
        });

        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
          UserData: {
            'Fn::Base64': {
              'Fn::Join': [
                '',
                [
                  `<powershell>mkdir (Split-Path -Path 'C:/temp/${RQ_CONNECTION_ASSET.Key}.py' ) -ea 0\n` +
                  'Read-S3Object -BucketName \'',
                  {
                    'Fn::Sub': RQ_CONNECTION_ASSET.Bucket,
                  },
                  `' -key '${RQ_CONNECTION_ASSET.Key}.py' -file 'C:/temp/${RQ_CONNECTION_ASSET.Key}.py' -ErrorAction Stop\n` +
                  '$ErrorActionPreference = "Stop"\n' +
                  '$DEADLINE_PATH = (get-item env:"DEADLINE_PATH").Value\n' +
                  `& "$DEADLINE_PATH/deadlinecommand.exe" -executeScriptNoGui "C:/temp/${RQ_CONNECTION_ASSET.Key}.py" --render-queue "http://renderqueue.${ZONE_NAME}:8080"  2>&1\n` +
                  `Remove-Item -Path "C:/temp/${RQ_CONNECTION_ASSET.Key}.py"\n` +
                  'If (Get-Service "deadline10launcherservice" -ErrorAction SilentlyContinue) {\n' +
                  '  Restart-Service "deadline10launcherservice"\n' +
                  '} Else {\n' +
                  '  & "$DEADLINE_PATH/deadlinelauncher.exe" -shutdownall 2>&1\n' +
                  '  & "$DEADLINE_PATH/deadlinelauncher.exe" -nogui 2>&1\n' +
                '}</powershell>',
                ],
              ],
            },
          },
        });

        // Make sure we execute the script with the correct args
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 8080,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              stack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        });

        Template.fromStack(stack).hasResource('AWS::EC2::Instance', {
          DependsOn: Match.arrayWith([
            'RenderQueueLBPublicListenerBBF15D5F',
            'RenderQueueRCSTaskA9AE70D3',
          ]),
        });
      });
    });

    describe('externalProtocol is https', () => {
      let zone: PrivateHostedZone;
      let renderQueue: RenderQueue;
      const HOSTNAME = 'renderqueue';
      const ZONE_NAME = 'renderfarm.local';
      const CERT_ARN = 'arn:a:b:c:dcertarn';
      const CA_ARN = 'arn:aws:secretsmanager:123456789012:secret:ca/arn';

      beforeEach(() => {
        // GIVEN
        const repository = new Repository(dependencyStack, 'Repo', {
          version,
          vpc,
        });
        zone = new PrivateHostedZone(stack, 'RenderQueueZone', {
          vpc,
          zoneName: ZONE_NAME,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          hostname: {
            hostname: HOSTNAME,
            zone,
          },
          trafficEncryption: {
            externalTLS: {
              acmCertificate: Certificate.fromCertificateArn(stack, 'Certificate', CERT_ARN),
              acmCertificateChain: Secret.fromSecretPartialArn(stack, 'CA_Cert', CA_ARN),
            },
          },
        };

        // WHEN
        renderQueue = new RenderQueue(stack, 'RenderQueue', props);
      });

      test('ECS can connect', () => {
        // WHEN
        const hosts = [new Instance(stack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        })];
        const role = new Role(stack, 'Role', {assumedBy: new AccountRootPrincipal()});

        const env = renderQueue.configureClientECS({
          hosts,
          grantee: role,
        });

        // THEN
        expect(env).toHaveProperty('RENDER_QUEUE_URI');
        expect(env.RENDER_QUEUE_URI).toMatch(/https:\/\/.*:4433$/);
        expect(env).toHaveProperty('RENDER_QUEUE_TLS_CA_CERT_URI', CA_ARN);

        Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 4433,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              stack.getLogicalId(hosts[0].connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        });
      });

      test('Linux Instance can connect', () => {
        // WHEN
        const host = new Instance(stack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        });

        renderQueue.configureClientInstance({
          host,
        });

        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
          UserData: {
            'Fn::Base64': {
              'Fn::Join': [
                '',
                [
                  '#!/bin/bash\n' +
                  `mkdir -p $(dirname '/tmp/${RQ_CONNECTION_ASSET.Key}.py')\n` +
                  'aws s3 cp \'s3://',
                  {
                    'Fn::Sub': RQ_CONNECTION_ASSET.Bucket,
                  },
                  `/${RQ_CONNECTION_ASSET.Key}.py' '/tmp/${RQ_CONNECTION_ASSET.Key}.py'\n` +
                  'if [ -f "/etc/profile.d/deadlineclient.sh" ]; then\n' +
                  '  source "/etc/profile.d/deadlineclient.sh"\n' +
                  'fi\n' +
                  `"\${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/${RQ_CONNECTION_ASSET.Key}.py" --render-queue "https://renderqueue.${ZONE_NAME}:4433" --tls-ca "${CA_ARN}"\n` +
                  `rm -f "/tmp/${RQ_CONNECTION_ASSET.Key}.py"\n` +
                  'if service --status-all | grep -q "Deadline 10 Launcher"; then\n' +
                  '  service deadline10launcher restart\n' +
                  'fi',
                ],
              ],
            },
          },
        });

        // Make sure we execute the script with the correct args
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 4433,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              stack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        });
      });

      test('Windows Instance can connect', () => {
        // WHEN
        const host = new Instance(stack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestWindows( WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_CORE_BASE),
        });

        renderQueue.configureClientInstance({
          host,
        });

        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
          UserData: {
            'Fn::Base64': {
              'Fn::Join': [
                '',
                [
                  `<powershell>mkdir (Split-Path -Path 'C:/temp/${RQ_CONNECTION_ASSET.Key}.py' ) -ea 0\n` +
                  'Read-S3Object -BucketName \'',
                  {
                    'Fn::Sub': RQ_CONNECTION_ASSET.Bucket,
                  },
                  `' -key '${RQ_CONNECTION_ASSET.Key}.py' -file 'C:/temp/${RQ_CONNECTION_ASSET.Key}.py' -ErrorAction Stop\n$ErrorActionPreference = "Stop"\n` +
                  '$DEADLINE_PATH = (get-item env:"DEADLINE_PATH").Value\n' +
                  `& "$DEADLINE_PATH/deadlinecommand.exe" -executeScriptNoGui "C:/temp/${RQ_CONNECTION_ASSET.Key}.py" --render-queue "https://renderqueue.${ZONE_NAME}:4433" --tls-ca "${CA_ARN}" 2>&1\n` +
                  `Remove-Item -Path "C:/temp/${RQ_CONNECTION_ASSET.Key}.py"\n` +
                  'If (Get-Service "deadline10launcherservice" -ErrorAction SilentlyContinue) {\n' +
                  '  Restart-Service "deadline10launcherservice"\n' +
                  '} Else {\n' +
                  '  & "$DEADLINE_PATH/deadlinelauncher.exe" -shutdownall 2>&1\n' +
                  '  & "$DEADLINE_PATH/deadlinelauncher.exe" -nogui 2>&1\n' +
                '}</powershell>',
                ],
              ],
            },
          },
        });

        // Make sure we execute the script with the correct args
        Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 4433,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              stack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        });
      });
    });
  });

  test('can specify subnets', () => {
    // GIVEN
    const subnets = [
      Subnet.fromSubnetAttributes(dependencyStack, 'Subnet1', {
        subnetId: 'SubnetID1',
        availabilityZone: 'us-west-2a',
      }),
      Subnet.fromSubnetAttributes(dependencyStack, 'Subnet2', {
        subnetId: 'SubnetID2',
        availabilityZone: 'us-west-2b',
      }),
    ];
    const repository = new Repository(dependencyStack, 'Repo', {
      version,
      vpc,
    });
    const props: RenderQueueProps = {
      images,
      repository,
      version: renderQueueVersion,
      vpc,
      vpcSubnets: {
        subnets,
      },
      vpcSubnetsAlb: {
        subnets,
      },
    };

    // WHEN
    new RenderQueue(stack, 'RenderQueue', props);

    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      VPCZoneIdentifier: Match.arrayWith([
        'SubnetID1',
        'SubnetID2',
      ]),
    });
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Subnets: [
        'SubnetID1',
        'SubnetID2',
      ],
    });
  });

  test('can specify instance type', () => {
    // GIVEN
    const repository = new Repository(dependencyStack, 'Repo', {
      version,
      vpc,
    });
    const props: RenderQueueProps = {
      images,
      instanceType: InstanceType.of(InstanceClass.C5, InstanceSize.LARGE),
      repository,
      version: renderQueueVersion,
      vpc,
    };

    // WHEN
    new RenderQueue(stack, 'RenderQueue', props);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      InstanceType: 'c5.large',
    });
  });

  test('no deletion protection', () => {
    // GIVEN
    const repository = new Repository(dependencyStack, 'Repo', {
      version,
      vpc,
    });
    const props: RenderQueueProps = {
      images,
      repository,
      version: renderQueueVersion,
      vpc,
      deletionProtection: false,
    };

    // WHEN
    new RenderQueue(stack, 'RenderQueue', props);

    // THEN
    resourcePropertiesCountIs(stack, 'AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([
        {
          Key: 'deletion_protection.enabled',
          Value: 'true',
        },
      ]),
      Scheme: Match.absent(),
      Type: Match.absent(),
    }, 0);
  });

  test('drop invalid http header fields enabled', () => {
    // GIVEN
    const repository = new Repository(dependencyStack, 'Repo', {
      version,
      vpc,
    });
    const props: RenderQueueProps = {
      images,
      repository,
      version: renderQueueVersion,
      vpc,
    };

    // WHEN
    new RenderQueue(stack, 'RenderQueue', props);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([
        {
          Key: 'routing.http.drop_invalid_header_fields.enabled',
          Value: 'true',
        },
      ]),
    });
  });

  describe('hostname', () => {
    // GIVEN
    const zoneName = 'mydomain.local';
    let repository: Repository;

    beforeEach(() => {
      repository = new Repository(dependencyStack, 'Repo', {
        version,
        vpc,
        // Cannot have secrets management unless external TLS is enabled on the RQ,
        // so we disable it to allow for testing.
        secretsManagementSettings: { enabled: false },
      });
    });

    describe('not specified, with no TLS', () => {
      beforeEach(() => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          trafficEncryption: { externalTLS: { enabled: false } },
        };

        // WHEN
        new RenderQueue(stack, 'RenderQueue', props);
      });

      // THEN
      test('does not create a record set', () => {
        Template.fromStack(stack).resourceCountIs('AWS::Route53::RecordSet', 0);
      });
    });

    test('not specified, with TLS', () => {
      // GIVEN
      const props: RenderQueueProps = {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
        trafficEncryption: {
          externalTLS: {
          },
        },
      };

      const renderQueue = new RenderQueue(stack, 'RenderQueue', props);

      Template.fromStack(stack).hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'renderqueue.aws-rfdk.com.',
        Type: 'A',
        AliasTarget: Match.objectLike({
          HostedZoneId: stack.resolve(renderQueue.loadBalancer.loadBalancerCanonicalHostedZoneId),
        }),
      });
    });

    describe('specified with zone but no hostname', () => {
      let zone: PrivateHostedZone;
      let renderQueue: RenderQueue;

      beforeEach(() => {
        // GIVEN
        zone = new PrivateHostedZone(dependencyStack, 'Zone', {
          vpc,
          zoneName,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version: renderQueueVersion,
          vpc,
          hostname: {
            zone,
          },
        };

        // WHEN
        renderQueue = new RenderQueue(stack, 'RenderQueue', props);
      });

      // THEN
      test('creates a record set using default hostname', () => {
        const loadBalancerLogicalId = dependencyStack.getLogicalId(
          renderQueue.loadBalancer.node.defaultChild as CfnElement,
        );
        Template.fromStack(stack).hasResourceProperties('AWS::Route53::RecordSet', {
          Name: `renderqueue.${zoneName}.`,
          Type: 'A',
          AliasTarget: Match.objectLike({
            HostedZoneId: {
              'Fn::GetAtt': [
                loadBalancerLogicalId,
                'CanonicalHostedZoneID',
              ],
            },
          }),
        });
      });
    });

    test.each([
      [false],
      [true],
    ])('specified with TLS enabled == %s', (isTlsEnabled: boolean) => {
      // GIVEN
      const zone = new PrivateHostedZone(dependencyStack, 'Zone', {
        vpc,
        zoneName,
      });
      const hostname = 'testrq';
      const props: RenderQueueProps = {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
        hostname: {
          hostname,
          zone,
        },
        trafficEncryption: {
          externalTLS: { enabled: isTlsEnabled },
        },
      };

      // WHEN
      const renderQueue = new RenderQueue(stack, 'RenderQueue', props);

      // THEN
      const loadBalancerLogicalId = dependencyStack.getLogicalId(
        renderQueue.loadBalancer.node.defaultChild as CfnElement,
      );
      Template.fromStack(stack).hasResourceProperties('AWS::Route53::RecordSet', {
        Name: `${hostname}.${zoneName}.`,
        Type: 'A',
        AliasTarget: Match.objectLike({
          HostedZoneId: {
            'Fn::GetAtt': [
              loadBalancerLogicalId,
              'CanonicalHostedZoneID',
            ],
          },
        }),
      });
    });

    test.each([
      ['rq.somedomain.local'],
      ['1startswithnumber'],
      ['-startswithhyphen'],
      ['endswith-'],
      ['contains$symbol'],
      ['thisstringisexactlysixtyfourcharacterswhichisonelargerthanthemax'],
    ])('.hostname validation - %s', (hostname: string) => {
      // GIVEN
      const zone = new PrivateHostedZone(dependencyStack, 'Zone', {
        zoneName: 'somedomain.local',
        vpc,
      });
      const props: RenderQueueProps = {
        images,
        repository,
        version,
        vpc,
        hostname: {
          hostname,
          zone,
        },
      };

      // WHEN
      function when() {
        new RenderQueue(stack, 'NewRenderQueue', props);
      }

      // THEN
      expect(when).toThrow(/Invalid RenderQueue hostname/);
    });
  });

  describe('Access Logs', () => {
    let isolatedStack: Stack;
    let repository: Repository;
    let renderQueueProps: RenderQueueProps;
    let accessBucket: Bucket;

    beforeEach(() => {
      // GIVEN
      isolatedStack = new Stack(app, 'IsolatedStack', {
        env: {
          region: 'us-east-1',
        },
      });
      const localVpc = new Vpc(isolatedStack, 'Vpc');
      const localVersion = new VersionQuery(isolatedStack, 'Version');
      const localImages = {
        remoteConnectionServer: rcsImage,
      };

      repository = new Repository(isolatedStack, 'Repo', {
        version: localVersion,
        vpc: localVpc,
      });
      accessBucket = new Bucket(isolatedStack, 'AccessBucket');
      renderQueueProps = {
        images: localImages,
        repository,
        version: localVersion,
        vpc: localVpc,
      };
    });

    test('enabling access logs sets attributes and policies', () => {
      // GIVEN
      const props: RenderQueueProps = {
        ...renderQueueProps,
        accessLogs: {
          destinationBucket: accessBucket,
        },
      };

      // WHEN
      new RenderQueue(isolatedStack, 'RenderQueue', props);

      // THEN
      Template.fromStack(isolatedStack).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        LoadBalancerAttributes: Match.arrayWith([
          {
            Key: 'access_logs.s3.enabled',
            Value: 'true',
          },
          {
            Key: 'access_logs.s3.bucket',
            Value: {
              Ref: 'AccessBucketE2803D76',
            },
          },
        ]),
      });

      Template.fromStack(isolatedStack).hasResourceProperties('AWS::S3::BucketPolicy', {
        Bucket: {
          Ref: 'AccessBucketE2803D76',
        },
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: 's3:PutObject',
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                },
              },
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'AccessBucketE2803D76',
                        'Arn',
                      ],
                    },
                    '/*',
                  ],
                ],
              },
            },
            {
              Action: 's3:GetBucketAcl',
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::GetAtt': [
                  'AccessBucketE2803D76',
                  'Arn',
                ],
              },
            },
            {
              Action: [
                's3:PutObject',
                's3:PutObjectLegalHold',
                's3:PutObjectRetention',
                's3:PutObjectTagging',
                's3:PutObjectVersionTagging',
                's3:Abort*',
              ],
              Effect: 'Allow',
              Principal: {
                AWS: {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      {
                        Ref: 'AWS::Partition',
                      },
                      ':iam::127311923021:root',
                    ],
                  ],
                },
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'AccessBucketE2803D76',
                        'Arn',
                      ],
                    },
                    '/AWSLogs/',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/*',
                  ],
                ],
              },
            },
            {
              Action: 's3:PutObject',
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                },
              },
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'AccessBucketE2803D76',
                        'Arn',
                      ],
                    },
                    '/AWSLogs/',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/*',
                  ],
                ],
              },
            },
          ]),
        },
      });
    });

    test('enabling access logs works with prefix', () => {
      // GIVEN
      const props: RenderQueueProps = {
        ...renderQueueProps,
        accessLogs: {
          destinationBucket: accessBucket,
          prefix: 'PREFIX_STRING',
        },
      };

      // WHEN
      new RenderQueue(isolatedStack, 'RenderQueue', props);

      // THEN
      Template.fromStack(isolatedStack).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        LoadBalancerAttributes: Match.arrayWith([
          {
            Key: 'access_logs.s3.enabled',
            Value: 'true',
          },
          {
            Key: 'access_logs.s3.bucket',
            Value: {
              Ref: 'AccessBucketE2803D76',
            },
          },
          {
            Key: 'access_logs.s3.prefix',
            Value: 'PREFIX_STRING',
          },
        ]),
      });

      Template.fromStack(isolatedStack).hasResourceProperties('AWS::S3::BucketPolicy', {
        Bucket: {
          Ref: 'AccessBucketE2803D76',
        },
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: 's3:PutObject',
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                },
              },
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'AccessBucketE2803D76',
                        'Arn',
                      ],
                    },
                    '/*',
                  ],
                ],
              },
            },
            {
              Action: 's3:GetBucketAcl',
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::GetAtt': [
                  'AccessBucketE2803D76',
                  'Arn',
                ],
              },
            },
            {
              Action: [
                's3:PutObject',
                's3:PutObjectLegalHold',
                's3:PutObjectRetention',
                's3:PutObjectTagging',
                's3:PutObjectVersionTagging',
                's3:Abort*',
              ],
              Effect: 'Allow',
              Principal: {
                AWS: {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      {
                        Ref: 'AWS::Partition',
                      },
                      ':iam::127311923021:root',
                    ],
                  ],
                },
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'AccessBucketE2803D76',
                        'Arn',
                      ],
                    },
                    '/PREFIX_STRING/AWSLogs/',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/*',
                  ],
                ],
              },
            },
            {
              Action: 's3:PutObject',
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                },
              },
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'AccessBucketE2803D76',
                        'Arn',
                      ],
                    },
                    '/PREFIX_STRING/AWSLogs/',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/*',
                  ],
                ],
              },
            },
          ]),
        },
      });
    });
  });

  describe('tagging', () => {
    let repository: Repository;

    beforeEach(() => {
      repository = new Repository(dependencyStack, 'NonSMRepository', {
        vpc,
        version,
      });
      const props: RenderQueueProps = {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
      };

      // WHEN
      new RenderQueue(stack, 'RenderQueue', props);
    });

    testConstructTags({
      constructName: 'RenderQueue',
      createConstruct: () => {
        return stack;
      },
      resourceTypeCounts: {
        'AWS::ECS::Cluster': 1,
        'AWS::EC2::SecurityGroup': 2,
        'AWS::IAM::Role': 10,
        'AWS::AutoScaling::AutoScalingGroup': 1,
        'AWS::Lambda::Function': 6,
        'AWS::SNS::Topic': 1,
        'AWS::ECS::TaskDefinition': 1,
        'AWS::DynamoDB::Table': 5,
        'AWS::SecretsManager::Secret': 4,
        'AWS::ElasticLoadBalancingV2::LoadBalancer': 1,
        'AWS::ElasticLoadBalancingV2::TargetGroup': 1,
        'AWS::ECS::Service': 1,
      },
    });
  });

  describe('SEP Policies', () => {
    let repository: Repository;
    let renderQueue: RenderQueue;

    beforeEach(() => {
      // GIVEN
      repository = new Repository(dependencyStack, 'NonSMRepository', {
        vpc,
        version,
      });
      const props: RenderQueueProps = {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
      };
      renderQueue = new RenderQueue(stack, 'RenderQueue', props);
    });

    test('with resource tracker', () => {
      // WHEN
      renderQueue.addSEPPolicies();

      // THEN
      resourcePropertiesCountIs(stack, 'AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':iam::aws:policy/AWSThinkboxDeadlineSpotEventPluginAdminPolicy',
              ],
            ],
          },
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':iam::aws:policy/AWSThinkboxDeadlineResourceTrackerAdminPolicy',
              ],
            ],
          },
        ]),
      }, 1);
    });

    test('no resource tracker', () => {
      // WHEN
      renderQueue.addSEPPolicies(false);

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':iam::aws:policy/AWSThinkboxDeadlineSpotEventPluginAdminPolicy',
              ],
            ],
          },
        ]),
      });
      resourcePropertiesCountIs(stack, 'AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':iam::aws:policy/AWSThinkboxDeadlineResourceTrackerAdminPolicy',
              ],
            ],
          },
        ]),
      }, 0);
    });
  });

  describe('Security Groups', () => {
    let repository: Repository;
    let backendSecurityGroup: SecurityGroup;
    let frontendSecurityGroup: SecurityGroup;

    beforeEach(() => {
      repository = new Repository(dependencyStack, 'Repo', {
        version,
        vpc,
      });
      backendSecurityGroup = new SecurityGroup(stack, 'ASGSecurityGroup', { vpc });
      frontendSecurityGroup = new SecurityGroup(stack, 'LBSecurityGroup', { vpc });
    });

    test('adds security groups on construction', () => {
      // GIVEN
      const securityGroups: RenderQueueSecurityGroups = {
        backend: backendSecurityGroup,
        frontend: frontendSecurityGroup,
      };

      // WHEN
      new RenderQueue(stack, 'RenderQueue', {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
        securityGroups,
      });

      // THEN
      assertSecurityGroupsWereAdded(securityGroups);
    });

    test('adds backend security groups post-construction', () => {
      // GIVEN
      const renderQueue = new RenderQueue(stack, 'RenderQueue', {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
      });

      // WHEN
      renderQueue.addBackendSecurityGroups(backendSecurityGroup);

      // THEN
      assertSecurityGroupsWereAdded({
        backend: backendSecurityGroup,
      });
    });

    test('adds frontend security groups post-construction', () => {
      // GIVEN
      const renderQueue = new RenderQueue(stack, 'RenderQueue', {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
      });

      // WHEN
      renderQueue.addFrontendSecurityGroups(frontendSecurityGroup);

      // THEN
      assertSecurityGroupsWereAdded({
        frontend: frontendSecurityGroup,
      });
    });

    test('security groups added post-construction are not attached to Connections object', () => {
      // GIVEN
      const renderQueue = new RenderQueue(stack, 'RenderQueue', {
        images,
        repository,
        version: renderQueueVersion,
        vpc,
      });
      renderQueue.addBackendSecurityGroups(backendSecurityGroup);
      renderQueue.addFrontendSecurityGroups(frontendSecurityGroup);
      const peerSecurityGroup = new SecurityGroup(stack, 'PeerSecurityGroup', { vpc });

      // WHEN
      renderQueue.connections.allowFrom(peerSecurityGroup, Port.tcp(22));

      // THEN
      // Existing LoadBalancer security groups shouldn't have the ingress rule added
      resourcePropertiesCountIs(stack, 'AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 22,
        ToPort: 22,
        GroupId: stack.resolve(frontendSecurityGroup.securityGroupId),
        SourceSecurityGroupId: stack.resolve(peerSecurityGroup.securityGroupId),
      }, 0);
      // Existing AutoScalingGroup security groups shouldn't have the ingress rule added
      resourcePropertiesCountIs(stack, 'AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 22,
        ToPort: 22,
        GroupId: stack.resolve(backendSecurityGroup.securityGroupId),
        SourceSecurityGroupId: stack.resolve(peerSecurityGroup.securityGroupId),
      }, 0);
    });

    function assertSecurityGroupsWereAdded(securityGroups: RenderQueueSecurityGroups) {
      if (securityGroups.backend !== undefined) {
        Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
          SecurityGroups: Match.arrayWith([stack.resolve(securityGroups.backend.securityGroupId)]),
        });
      }
      if (securityGroups.frontend !== undefined) {
        Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
          SecurityGroups: Match.arrayWith([stack.resolve(securityGroups.frontend.securityGroupId)]),
        });
      }
    }
  });

  test('validates VersionQuery is not in a different stack', () => {
    // GIVEN
    const repository = new Repository(dependencyStack, 'Repo', {
      version,
      vpc,
    });
    // WHEN
    new RenderQueue(stack, 'RenderQueue', {
      images,
      repository,
      version,
      vpc,
    });

    // WHEN
    function synth() {
      app.synth();
    }

    // THEN
    expect(synth).toThrow('A VersionQuery can not be supplied from a different stack');
  });

  test('Enables filesystem cache if required', () => {
    // GIVEN
    const repository = new Repository(dependencyStack, 'Repo', {
      version,
      vpc,
    });
    // WHEN
    new RenderQueue(stack, 'RenderQueue', {
      images,
      repository,
      version: renderQueueVersion,
      vpc,
      enableLocalFileCaching: true,
    });

    // THEN
    // Note: If this test breaks/fails, then it is probable that the
    //  'Does not enable filesystem cache by default' test above will also require
    //  updating/fixing.
    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            Match.arrayWith([
              Match.stringLikeRegexp('.*# RenderQueue file caching enabled.*'),
            ]),
          ],
        },
      },
    });
  });

  describe('Secrets Management', () => {
    let repository: Repository;
    let rqSecretsManagementProps: RenderQueueProps;

    beforeEach(() => {
      repository = new Repository(dependencyStack, 'Repo', {
        version,
        vpc,
        secretsManagementSettings: {
          enabled: true,
        },
      });
      rqSecretsManagementProps = {
        vpc,
        images,
        repository,
        version: renderQueueVersion,
        trafficEncryption: {
          internalProtocol: ApplicationProtocol.HTTPS,
          externalTLS: { enabled: true },
        },
      };
    });

    test('throws if internal protocol is not HTTPS', () => {
      // WHEN
      expect(() => new RenderQueue(stack, 'SecretsManagementRenderQueue', {
        ...rqSecretsManagementProps,
        trafficEncryption: {
          internalProtocol: ApplicationProtocol.HTTP,
        },
      }))

        // THEN
        .toThrow(/The internal protocol on the Render Queue is not HTTPS./);
    });

    test('throws if external TLS is not enabled', () => {
      // WHEN
      expect(() => new RenderQueue(stack, 'SecretsManagementRenderQueue', {
        ...rqSecretsManagementProps,
        trafficEncryption: {
          externalTLS: { enabled: false },
        },
      }))

        // THEN
        .toThrow(/External TLS on the Render Queue is not enabled./);
    });

    test('throws if repository does not have SM credentials', () => {
      // WHEN
      expect(() => new RenderQueue(stack, 'SecretsManagementRenderQueue', {
        ...rqSecretsManagementProps,
        repository: {
          ...repository,
          secretsManagementSettings: {
            ...repository.secretsManagementSettings,
            credentials: undefined,
          },
        } as Repository,
      }))

        // THEN
        .toThrow(/The Repository does not have Secrets Management credentials/);
    });

    test('throws if deadline version is too low', () => {
      // GIVEN
      const oldVersion = new VersionQuery(new Stack(app, 'OldDeadlineVersionStack'), 'OldDeadlineVersion', { version: '10.0.0.0' });

      // WHEN
      expect(() => new RenderQueue(stack, 'SecretsManagementRenderQueue', {
        ...rqSecretsManagementProps,
        version: oldVersion,
      }))

        // THEN
        /* eslint-disable-next-line dot-notation */
        .toThrow(`The supplied Deadline version (${oldVersion.versionString}) does not support Deadline Secrets Management in RFDK. Either upgrade Deadline to the minimum required version (${Version.MINIMUM_SECRETS_MANAGEMENT_VERSION.versionString}) or disable the feature in the Repository's construct properties.`);
    });

    test('grants read permissions to secrets management credentials', () => {
      // WHEN
      const rq = new RenderQueue(stack, 'SecretsManagementRenderQueue', rqSecretsManagementProps);

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([{
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: stack.resolve((repository.secretsManagementSettings.credentials!.node.defaultChild as CfnSecret).ref),
          }]),
        }),
        Roles: [stack.resolve((rq.node.tryFindChild('RCSTask') as Ec2TaskDefinition).taskRole.roleName)],
      });
    });

    test('defines secrets management credentials environment variable', () => {
      // WHEN
      new RenderQueue(stack, 'SecretsManagementRenderQueue', rqSecretsManagementProps);

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Environment: Match.arrayWith([
              {
                Name: 'RCS_SM_CREDENTIALS_URI',
                Value: stack.resolve((repository.secretsManagementSettings.credentials!.node.defaultChild as CfnSecret).ref),
              },
            ]),
          }),
        ]),
      });
    });

    test('creates and mounts docker volume for deadline key pairs', () => {
      // WHEN
      new RenderQueue(stack, 'SecretsManagementRenderQueue', rqSecretsManagementProps);

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            MountPoints: Match.arrayWith([
              {
                ContainerPath: '/home/ec2-user/.config/.mono/keypairs',
                ReadOnly: false,
                SourceVolume: 'deadline-user-keypairs',
              },
            ]),
          }),
        ]),
        Volumes: Match.arrayWith([
          {
            DockerVolumeConfiguration: {
              Autoprovision: true,
              Driver: 'local',
              Scope: 'shared',
            },
            Name: 'deadline-user-keypairs',
          },
        ]),
      });
    });

    test('DeploymentInstance uses specified backend security group', () => {
      // GIVEN
      const backendSecurityGroupId = 'backend-sg-id';
      const backendSecurityGroup = SecurityGroup.fromSecurityGroupId(stack, 'BackendSG', backendSecurityGroupId);

      // WHEN
      const renderQueue = new RenderQueue(stack, 'SecretsManagementRenderQueue', {
        ...rqSecretsManagementProps,
        securityGroups: {
          backend: backendSecurityGroup,
        },
      });
      // Force creation of the DeploymentInstance
      // eslint-disable-next-line dot-notation
      renderQueue['deploymentInstance'];

      // THEN
      const deploymentInstance = renderQueue.node.findChild('ConfigureRepository') as DeploymentInstance;
      expect(deploymentInstance.connections.securityGroups[0].securityGroupId).toEqual(backendSecurityGroupId);
    });

    test('DeploymentInstance uses RQ\'s log group prefix', () => {
      // GIVEN
      rqSecretsManagementProps = {
        ...rqSecretsManagementProps,
        logGroupProps: {
          logGroupPrefix: '/customPrefix/',
        },
      };

      // WHEN
      const renderQueue = new RenderQueue(stack, 'SecretsManagementRenderQueue', {
        ...rqSecretsManagementProps,
        logGroupProps: {
          logGroupPrefix: '/customPrefix/',
        },
      });
      // Force creation of the DeploymentInstance
      // eslint-disable-next-line dot-notation
      renderQueue['deploymentInstance'];

      // THEN
      Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
        LogGroupName: '/customPrefix/ConfigureRepository',
      });
    });

    test('DeploymentInstance uses implicitly created backend security group', () => {
      // WHEN
      const renderQueue = new RenderQueue(stack, 'SecretsManagementRenderQueue', rqSecretsManagementProps);
      // Force creation of the DeploymentInstance
      // eslint-disable-next-line dot-notation
      renderQueue['deploymentInstance'];

      // THEN
      const deploymentInstance = renderQueue.node.findChild('ConfigureRepository') as DeploymentInstance;
      expect(deploymentInstance.connections.securityGroups[0]).toBe(renderQueue.backendConnections.securityGroups[0]);
      expect(deploymentInstance.connections.securityGroups[0]).toBe(renderQueue.asg.connections.securityGroups[0]);
    });

    describe('client calls .configureSecretsManagementAutoRegistration()', () => {
      let callParams: any;
      let clientInstance: Instance;
      let identityRegistrationSettings: SecretsManagementIdentityRegistration;
      let launchConfiguration: CfnLaunchConfiguration;
      let rqVpcSubnets: SubnetSelection;
      const RQ_SUBNET_IDS = ['SubnetID1', 'SubnetID2'];

      beforeEach(() => {
        // GIVEN
        const subnets = [
          Subnet.fromSubnetAttributes(dependencyStack, 'Subnet1', {
            subnetId: RQ_SUBNET_IDS[0],
            availabilityZone: 'us-west-2a',
          }),
          Subnet.fromSubnetAttributes(dependencyStack, 'Subnet2', {
            subnetId: RQ_SUBNET_IDS[1],
            availabilityZone: 'us-west-2b',
          }),
        ];
        rqVpcSubnets = {
          subnets,
        };
        const rq = new RenderQueue(stack, 'SecretsManagementRenderQueue', {
          ...rqSecretsManagementProps,
          vpcSubnets: rqVpcSubnets,
        });

        clientInstance = new Instance(stack, 'ClientInstance', {
          instanceType: new InstanceType('t3.micro'),
          machineImage: new AmazonLinuxImage(),
          vpc,
        });
        callParams = {
          dependent: clientInstance,
          registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
          role: SecretsManagementRole.CLIENT,
          vpc,
          vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
        };
        launchConfiguration = (
          // @ts-ignore
          rq.deploymentInstance
            .node.findChild('ASG')
            .node.findChild('LaunchConfig')
        ) as CfnLaunchConfiguration;
        // @ts-ignore
        identityRegistrationSettings = rq.identityRegistrationSettings;
        jest.spyOn(identityRegistrationSettings, 'addSubnetIdentityRegistrationSetting');

        // WHEN
        rq.configureSecretsManagementAutoRegistration(callParams);
      });

      test('registration is delegated to SecretsManagementIdentityRegistration', () => {
        // THEN
        expect(identityRegistrationSettings.addSubnetIdentityRegistrationSetting).toHaveBeenCalledWith(callParams);
      });

      test('deployment instance is created using specified subnets', () => {
        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
          LaunchConfigurationName: stack.resolve(launchConfiguration.ref),
          VPCZoneIdentifier: Match.arrayWith([
            ...RQ_SUBNET_IDS,
          ]),
        });
      });
    });
  });

});
