/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ABSENT,
  arrayWith,
  not,
  deepObjectLike,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  objectLike,
  ResourcePart,
  countResourcesLike,
} from '@aws-cdk/assert';
import {
  Certificate,
} from '@aws-cdk/aws-certificatemanager';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  Subnet,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  ContainerImage,
  TaskDefinition,
} from '@aws-cdk/aws-ecs';
import {
  ApplicationProtocol,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  AccountRootPrincipal,
  Role,
} from '@aws-cdk/aws-iam';
import {
  PrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  Bucket,
} from '@aws-cdk/aws-s3';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import {
  App,
  CfnElement,
  Stack,
} from '@aws-cdk/core';

import {
  X509CertificatePem,
} from '../..';
import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
  IVersion,
  RenderQueue,
  RenderQueueImages,
  RenderQueueProps,
  Repository,
  VersionQuery,
} from '../lib';
import {
  RQ_CONNECTION_ASSET,
} from './asset-constants';

describe('RenderQueue', () => {
  let app: App;
  let dependencyStack: Stack;
  let stack: Stack;
  let vpc: Vpc;
  let rcsImage: ContainerImage;
  let images: RenderQueueImages;

  let repository: Repository;
  let version: IVersion;

  let renderQueueCommon: RenderQueue;

  // GIVEN
  beforeEach(() => {
    app = new App();
    dependencyStack = new Stack(app, 'DepStack');
    vpc = new Vpc(dependencyStack, 'Vpc');
    version = VersionQuery.exact(dependencyStack, 'Version', {
      majorVersion: 10,
      minorVersion: 1,
      releaseVersion: 9,
      patchVersion: 1,
    });
    repository = new Repository(dependencyStack, 'Repo', {
      version,
      vpc,
    });
    stack = new Stack(app, 'Stack');
    rcsImage = ContainerImage.fromAsset(__dirname);
    images = {
      remoteConnectionServer: rcsImage,
    };
    renderQueueCommon = new RenderQueue(stack, 'RenderQueueCommon', {
      images,
      repository,
      version,
      vpc,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('creates cluster', () => {
    // THEN
    expectCDK(stack).to(haveResource('AWS::ECS::Cluster'));
  });

  test('creates service', () => {
    // THEN
    expectCDK(stack).to(haveResource('AWS::ECS::Service'));
  });

  test('creates task definition', () => {
    // THEN
    expectCDK(stack).to(haveResource('AWS::ECS::TaskDefinition'));
  });

  test('closed ingress by default', () => {
    // THEN
    expectCDK(stack).notTo(haveResource('AWS::EC2::SecurityGroup', {
      // The openListener=true option would create an ingress rule in the listener's SG.
      // make sure that we don't have that.
      SecurityGroupIngress: arrayWith(objectLike({})),
    }));
  });

  test('creates load balancer with default values', () => {
    // THEN
    expectCDK(stack).to(countResourcesLike('AWS::ElasticLoadBalancingV2::LoadBalancer', 1, {
      LoadBalancerAttributes: [
        {
          Key: 'deletion_protection.enabled',
          Value: 'true',
        },
      ],
      Scheme: 'internal',
    }));
  });

  test('creates a log group with default prefix of "/renderfarm/"', () => {
    // THEN
    expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
      LogGroupName: '/renderfarm/RenderQueueCommon',
      RetentionInDays: 3,
    }));
  });

  test('configure the container log driver', () => {
    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: [
        objectLike({
          LogConfiguration: {
            LogDriver: 'awslogs',
            Options: {
              'awslogs-group': {
                'Fn::GetAtt': [
                  'RenderQueueCommonLogGroupWrapperA0EF7057',
                  'LogGroupName',
                ],
              },
              'awslogs-stream-prefix': 'RCS',
              'awslogs-region': { Ref: 'AWS::Region' },
            },
          },
        }),
      ],
    }));
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
    renderQueueCommon.addChildDependency(host);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::Instance', {
      DependsOn: arrayWith(
        'RenderQueueCommonLBPublicListener935F5635',
        'RenderQueueCommonRCSTask2A4D5EA5',
      ),
    }, ResourcePart.CompleteDefinition));
  });

  describe('renderQueueSize.min', () => {
    describe('defaults to 1', () => {
      function assertSpecifiesMinSize(stackToAssert: Stack) {
        expectCDK(stackToAssert).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
          MinSize: '1',
        }));
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
          version,
          vpc,
          renderQueueSize: {},
        });

        // THEN
        assertSpecifiesMinSize(isolatedStack);
      });
    });

    // Asserts that only one RCS container and ASG instance can be created.
    // Deadline currently requires that successive API requests are serviced by a single RCS.
    test.each([
      [0],
      [2],
    ])('clamps to 1 - using %d', (min: number) => {
      // GIVEN
      const props: RenderQueueProps = {
        images,
        repository,
        version,
        vpc,
        renderQueueSize: {
          min,
        },
      };

      // WHEN
      expect(() => {
        new RenderQueue(stack, 'RenderQueue', props);
      })
        // THEN
        .toThrow('renderQueueSize.min');
    });

    // Asserts that when the renderQueueSize.min prop is specified, the underlying ASG's min property is set accordingly.
    test('configures minimum number of ASG instances', () => {
      // GIVEN
      const min = 1;
      const props: RenderQueueProps = {
        images,
        repository,
        version,
        vpc,
        renderQueueSize: {
          min,
        },
      };
      const isolatedStack = new Stack(app, 'IsolatedStack');

      // WHEN
      new RenderQueue(isolatedStack, 'RenderQueue', props);

      // THEN
      expectCDK(isolatedStack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
        MinSize: min.toString(),
      }));
    });
  });

  describe('renderQueueSize.desired', () => {
    describe('defaults', () => {
      test('unset ASG desired', () => {
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
          DesiredCapacity: ABSENT,
        }));
      });
    });

    test('caps at 1', () => {
      // GIVEN
      const props: RenderQueueProps = {
        images,
        repository,
        version,
        vpc,
        renderQueueSize: {
          desired: 2,
        },
      };

      // WHEN
      expect(() => {
        new RenderQueue(stack, 'RenderQueue', props);
      })
        // THEN
        .toThrow('renderQueueSize.desired cannot be greater than 1');
    });

    describe('is specified', () => {
      const desired = 1;
      let isolatedStack: Stack;

      beforeEach(() => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          renderQueueSize: {
            desired,
          },
        };
        isolatedStack = new Stack(app, 'IsolatedStack');

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      // THEN
      test('configures desired number of ASG instances', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
          DesiredCapacity: desired.toString(),
        }));
      });
      // THEN
      test('configures desired number of ECS tasks in the service', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ECS::Service', {
          DesiredCount: desired,
        }));
      });
    });
  });

  describe('trafficEncryption', () => {
    describe('defaults', () => {
      let isolatedStack: Stack;

      beforeEach(() => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          trafficEncryption: {},
        };
        isolatedStack = new Stack(app, 'IsolatedStack');

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      // THEN
      test('to HTTPS internally between ALB and RCS', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
          Protocol: 'HTTPS',
          Port: 4433,
        }));
      });

      test('to HTTP externally between clients and ALB', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
          Protocol: 'HTTP',
          Port: 8080,
        }));
      });
    });

    describe('when interalProtocol is HTTPS', () => {
      let isolatedStack: Stack;
      let renderQueue: RenderQueue;
      let caCertPemLogicalId: string;
      let caCertPkcsLogicalId: string;
      let caCertPkcsPassphraseLogicalId: string;

      beforeEach(() => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          trafficEncryption: {
            internalProtocol: ApplicationProtocol.HTTPS,
          },
        };
        isolatedStack = new Stack(app, 'IsolatedStack');

        // WHEN
        renderQueue = new RenderQueue(isolatedStack, 'RenderQueue', props);

        caCertPemLogicalId = isolatedStack.getLogicalId(
          renderQueue.node.findChild('TlsCaCertPem').node.defaultChild as CfnElement,
        );
        const caCertPkcs = renderQueue.node.findChild('TlsRcsCertBundle');
        const caCertPkcsPassphrase = caCertPkcs.node.findChild('Passphrase');
        caCertPkcsLogicalId = isolatedStack.getLogicalId(caCertPkcs.node.defaultChild as CfnElement);
        caCertPkcsPassphraseLogicalId = isolatedStack.getLogicalId(caCertPkcsPassphrase.node.defaultChild as CfnElement);
      });

      // THEN
      test('ALB connects with HTTPS to port 4433', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
          Protocol: 'HTTPS',
          Port: 4433,
        }));
      });

      test('creates RCS cert', () => {
        expectCDK(isolatedStack).to(haveResourceLike('Custom::RFDK_X509Generator', {
          ServiceToken: {
            'Fn::GetAtt': arrayWith('Arn'),
          },
          DistinguishedName: { CN: 'renderfarm.local' },
          Secret: {
            NamePrefix: 'IsolatedStack/RenderQueue/TlsCaCertPem',
          },
        }));
      });

      test('grants read access to secrets containing the certs and passphrase', () => {
        const taskDef = renderQueue.node.findChild('RCSTask') as TaskDefinition;
        const taskRoleLogicalId = isolatedStack.getLogicalId((taskDef.taskRole as Role).node.defaultChild as CfnElement);
        expectCDK(isolatedStack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
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
            ),
            Version: '2012-10-17',
          },
          Roles: arrayWith({ Ref: taskRoleLogicalId }),
        }));
      });

      test('configures environment variables for cert secret URIs', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
          ContainerDefinitions: arrayWith(deepObjectLike({
            Environment: arrayWith(
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
            ),
          })),
        }));
      });
    });

    describe('when internal protocol is HTTP', () => {
      let isolatedStack: Stack;

      beforeEach(() => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          trafficEncryption: {
            internalProtocol: ApplicationProtocol.HTTP,
          },
        };
        isolatedStack = new Stack(app, 'IsolatedStack');

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      // THEN
      test('no certs are created', () => {
        expectCDK(isolatedStack).notTo(haveResource('Custom::RFDK_X509Generator'));
      });

      test('ALB connects with HTTP to port 8080', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
          Protocol: 'HTTP',
          Port: 8080,
        }));
      });
    });

    describe('externalProtocol is HTTPS', () => {
      let isolatedStack: Stack;
      const CERT_ARN = 'certarn';
      const CA_ARN = 'caarn';
      const ZONE_NAME = 'renderfarm.local';

      beforeEach(() => {
        // GIVEN
        isolatedStack = new Stack(app, 'IsolatedStack');
        const zone = new PrivateHostedZone(isolatedStack, 'RenderQueueZone', {
          vpc,
          zoneName: ZONE_NAME,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          trafficEncryption: {
            externalTLS: {
              acmCertificate: Certificate.fromCertificateArn(stack, 'Certificate', CERT_ARN),
              acmCertificateChain: Secret.fromSecretArn(stack, 'CA_Cert', CA_ARN),
            },
          },
          hostname: {
            zone,
          },
        };

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      test('sets the listener port to 4433', () => {
        // THEN
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
          Port: 4433,
        }));
      });

      test('sets the listener protocol to HTTPS', () => {
        // THEN
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
          Protocol: 'HTTPS',
        }));
      });

      test('configures the ALB listener to use the specified ACM certificate', () => {
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
          Protocol: 'HTTPS',
          Certificates: arrayWith({
            CertificateArn: CERT_ARN,
          }),
        }));
      });

      test('raises an error when a cert is specified without a hostname', () => {
        // GIVEN
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          trafficEncryption: {
            externalTLS: {
              acmCertificate: Certificate.fromCertificateArn(stack, 'Cert', 'certArn'),
              acmCertificateChain: Secret.fromSecretArn(stack, 'CA_Cert2', CA_ARN),
            },
          },
        };

        // WHEN
        expect(() => {
          new RenderQueue(stack, 'RenderQueue', props);
        })
          // THEN
          .toThrow(/A hostname must be provided when the external protocol is HTTPS/);
      });
    });

    describe('externalProtocol is HTTPS importing cert', () => {
      let isolatedStack: Stack;
      let zone: PrivateHostedZone;
      const ZONE_NAME = 'renderfarm.local';

      beforeEach(() => {
        // GIVEN
        isolatedStack = new Stack(app, 'IsolatedStack');
        zone = new PrivateHostedZone(isolatedStack, 'RenderQueueZone', {
          vpc,
          zoneName: ZONE_NAME,
        });

        const caCert = new X509CertificatePem(isolatedStack, 'CaCert', {
          subject: {
            cn: `ca.${ZONE_NAME}`,
          },
        });
        const serverCert = new X509CertificatePem(isolatedStack, 'ServerCert', {
          subject: {
            cn: `server.${ZONE_NAME}`,
          },
          signingCertificate: caCert,
        });

        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          trafficEncryption: {
            externalTLS: {
              rfdkCertificate: serverCert,
            },
            internalProtocol: ApplicationProtocol.HTTP,
          },
          hostname: {
            zone,
          },
        };

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      test('sets the listener port to 4433', () => {
        // THEN
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
          Port: 4433,
        }));
      });

      test('sets the listener protocol to HTTPS', () => {
        // THEN
        expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
          Protocol: 'HTTPS',
        }));
      });

      test('Imports Cert to ACM', () => {
        // THEN
        expectCDK(isolatedStack).to(haveResourceLike('Custom::RFDK_AcmImportedCertificate', {
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
        }));
      });
    });

    test('Throws if given ACM cert and RFDK Cert', () => {
      // GIVEN
      const isolatedStack = new Stack(app, 'IsolatedStack');
      const ZONE_NAME = 'renderfarm.local';
      const CERT_ARN = 'certArn';
      const CA_ARN = 'caArn';

      const zone = new PrivateHostedZone(isolatedStack, 'RenderQueueZone', {
        vpc,
        zoneName: ZONE_NAME,
      });

      const caCert = new X509CertificatePem(isolatedStack, 'CaCert', {
        subject: {
          cn: `ca.${ZONE_NAME}`,
        },
      });
      const serverCert = new X509CertificatePem(isolatedStack, 'ServerCert', {
        subject: {
          cn: `server.${ZONE_NAME}`,
        },
        signingCertificate: caCert,
      });

      const props: RenderQueueProps = {
        images,
        repository,
        version,
        vpc,
        trafficEncryption: {
          externalTLS: {
            acmCertificate: Certificate.fromCertificateArn(isolatedStack, 'Certificate', CERT_ARN),
            acmCertificateChain: Secret.fromSecretArn(isolatedStack, 'CA_Cert', CA_ARN),
            rfdkCertificate: serverCert,
          },
        },
        hostname: {
          zone,
        },
      };

      // WHEN
      expect(() => {
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      })
        // THEN
        .toThrow(/Exactly one of externalTLS.acmCertificate and externalTLS.rfdkCertificate must be provided when using externalTLS/);
    });

    test('Throws if no Cert given', () => {
      // GIVEN
      const isolatedStack = new Stack(app, 'IsolatedStack');
      const ZONE_NAME = 'renderfarm.local';

      const zone = new PrivateHostedZone(isolatedStack, 'RenderQueueZone', {
        vpc,
        zoneName: ZONE_NAME,
      });

      const props: RenderQueueProps = {
        images,
        repository,
        version,
        vpc,
        trafficEncryption: {
          externalTLS: {
          },
        },
        hostname: {
          zone,
        },
      };

      // WHEN
      expect(() => {
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      })
        // THEN
        .toThrow(/Exactly one of externalTLS.acmCertificate and externalTLS.rfdkCertificate must be provided when using externalTLS/);
    });

    test('Throws if ACM Cert is given without a cert chain', () => {
      // GIVEN
      const isolatedStack = new Stack(app, 'IsolatedStack');
      const ZONE_NAME = 'renderfarm.local';
      const CERT_ARN = 'certArn';

      const zone = new PrivateHostedZone(isolatedStack, 'RenderQueueZone', {
        vpc,
        zoneName: ZONE_NAME,
      });

      const props: RenderQueueProps = {
        images,
        repository,
        version,
        vpc,
        trafficEncryption: {
          externalTLS: {
            acmCertificate: Certificate.fromCertificateArn(isolatedStack, 'Certificate', CERT_ARN),
          },
        },
        hostname: {
          zone,
        },
      };

      // WHEN
      expect(() => {
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      })
        // THEN
        .toThrow(/externalTLS.acmCertificateChain must be provided when using externalTLS.acmCertificate./);
    });
  });

  describe('Client Connection', () => {
    describe('externalProtocol is http', () => {
      let isolatedStack: Stack;
      let zone: PrivateHostedZone;
      const ZONE_NAME = 'renderfarm.local';
      let rq: RenderQueue;

      beforeEach(() => {
        // GIVEN
        isolatedStack = new Stack(app, 'IsolatedStack');
        zone = new PrivateHostedZone(isolatedStack, 'RenderQueueZone', {
          vpc,
          zoneName: ZONE_NAME,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          hostname: {
            zone,
          },
        };

        // WHEN
        rq = new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      test('ECS can connect', () => {
        // WHEN
        const hosts = [new Instance(isolatedStack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        })];
        const role = new Role(isolatedStack, 'Role', {assumedBy: new AccountRootPrincipal()});

        const env = rq.configureClientECS({
          hosts,
          grantee: role,
        });

        // THEN
        expect(env).toHaveProperty('RENDER_QUEUE_URI');
        expect(env.RENDER_QUEUE_URI).toMatch(/http:\/\/.*:8080$/);

        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 8080,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              isolatedStack.getLogicalId(hosts[0].connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        }));

        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::Instance', {
          DependsOn: arrayWith(
            'RenderQueueLBPublicListenerBBF15D5F',
            'RenderQueueRCSTaskA9AE70D3',
          ),
        }, ResourcePart.CompleteDefinition));
      });

      test('Linux Instance can connect', () => {
        // WHEN
        const host = new Instance(isolatedStack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        });

        rq.configureClientInstance({
          host,
        });

        // THEN
        const userData = isolatedStack.resolve(host.userData.render());
        expect(userData).toStrictEqual({
          'Fn::Join': [
            '',
            [
              "#!/bin/bash\nmkdir -p $(dirname '/tmp/",
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\')\naws s3 cp \'s3://',
              { Ref: RQ_CONNECTION_ASSET.Bucket },
              '/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' \'/tmp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\'\n' +
              'if [ -f \"/etc/profile.d/deadlineclient.sh\" ]; then\n' +
              '  source \"/etc/profile.d/deadlineclient.sh\"\n' +
              'fi\n' +
              '"${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '" --render-queue "http://',
              {
                'Fn::GetAtt': [
                  'RenderQueueLB235D35F4',
                  'DNSName',
                ],
              },
              ':8080" \n' +
              'rm -f "/tmp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '"\n' +
              'if service --status-all | grep -q "Deadline 10 Launcher"; then\n' +
              '  service deadline10launcher restart\n' +
              'fi',
            ],
          ],
        });

        // Make sure we execute the script with the correct args
        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 8080,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              isolatedStack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        }));

        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::Instance', {
          DependsOn: arrayWith(
            'RenderQueueLBPublicListenerBBF15D5F',
            'RenderQueueRCSTaskA9AE70D3',
          ),
        }, ResourcePart.CompleteDefinition));
      });

      test('Windows Instance can connect', () => {
        // WHEN
        const host = new Instance(isolatedStack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestWindows( WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_CORE_BASE),
        });

        rq.configureClientInstance({
          host,
        });

        // THEN
        const userData = isolatedStack.resolve(host.userData.render());
        expect(userData).toStrictEqual({
          'Fn::Join': [
            '',
            [
              '<powershell>mkdir (Split-Path -Path \'C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' ) -ea 0\n' +
              'Read-S3Object -BucketName \'',
              { Ref: RQ_CONNECTION_ASSET.Bucket },
              '\' -key \'',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' -file \'C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' -ErrorAction Stop\n' +
              '$ErrorActionPreference = "Stop"\n' +
              '$DEADLINE_PATH = (get-item env:"DEADLINE_PATH").Value\n' +
              '& "$DEADLINE_PATH/deadlinecommand.exe" -executeScriptNoGui "C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '" --render-queue "http://',
              {
                'Fn::GetAtt': [
                  'RenderQueueLB235D35F4',
                  'DNSName',
                ],
              },
              ':8080"  2>&1\n' +
              'Remove-Item -Path "C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '"\n' +
              'If (Get-Service "deadline10launcherservice" -ErrorAction SilentlyContinue) {\n' +
              '  Restart-Service "deadline10launcherservice"\n' +
              '} Else {\n' +
              '  & "$DEADLINE_PATH/deadlinelauncher.exe" -shutdownall 2>&1\n' +
              '  & "$DEADLINE_PATH/deadlinelauncher.exe" 2>&1\n' +
              '}</powershell>',
            ],
          ],
        });

        // Make sure we execute the script with the correct args
        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 8080,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              isolatedStack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        }));

        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::Instance', {
          DependsOn: arrayWith(
            'RenderQueueLBPublicListenerBBF15D5F',
            'RenderQueueRCSTaskA9AE70D3',
          ),
        }, ResourcePart.CompleteDefinition));
      });
    });

    describe('externalProtocol is https', () => {
      let isolatedStack: Stack;
      let zone: PrivateHostedZone;
      let rq: RenderQueue;
      const ZONE_NAME = 'renderfarm.local';
      const CERT_ARN = 'certarn';
      const CA_ARN = 'caarn';

      beforeEach(() => {
        // GIVEN
        isolatedStack = new Stack(app, 'IsolatedStack');
        zone = new PrivateHostedZone(isolatedStack, 'RenderQueueZone', {
          vpc,
          zoneName: ZONE_NAME,
        });
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          hostname: {
            zone,
          },
          trafficEncryption: {
            externalTLS: {
              acmCertificate: Certificate.fromCertificateArn(stack, 'Certificate', CERT_ARN),
              acmCertificateChain: Secret.fromSecretArn(stack, 'CA_Cert', CA_ARN),
            },
          },
        };

        // WHEN
        rq = new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      test('ECS can connect', () => {
        // WHEN
        const hosts = [new Instance(isolatedStack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        })];
        const role = new Role(isolatedStack, 'Role', {assumedBy: new AccountRootPrincipal()});

        const env = rq.configureClientECS({
          hosts,
          grantee: role,
        });

        // THEN
        expect(env).toHaveProperty('RENDER_QUEUE_URI');
        expect(env.RENDER_QUEUE_URI).toMatch(/https:\/\/.*:4433$/);
        expect(env).toHaveProperty('RENDER_QUEUE_TLS_CA_CERT_URI', CA_ARN);

        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 4433,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              isolatedStack.getLogicalId(hosts[0].connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        }));
      });

      test('Linux Instance can connect', () => {
        // WHEN
        const host = new Instance(isolatedStack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        });

        rq.configureClientInstance({
          host,
        });

        // THEN
        const userData = isolatedStack.resolve(host.userData.render());
        expect(userData).toStrictEqual({
          'Fn::Join': [
            '',
            [
              "#!/bin/bash\nmkdir -p $(dirname '/tmp/",
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\')\naws s3 cp \'s3://',
              { Ref: RQ_CONNECTION_ASSET.Bucket },
              '/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' \'/tmp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\'\n' +
              'if [ -f \"/etc/profile.d/deadlineclient.sh\" ]; then\n' +
              '  source \"/etc/profile.d/deadlineclient.sh\"\n' +
              'fi\n' +
              '"${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '" --render-queue "https://',
              {
                'Fn::GetAtt': [
                  'RenderQueueLB235D35F4',
                  'DNSName',
                ],
              },
              ':4433" --tls-ca "caarn"\n' +
              'rm -f "/tmp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '"\n' +
              'if service --status-all | grep -q "Deadline 10 Launcher"; then\n' +
              '  service deadline10launcher restart\n' +
              'fi',
            ],
          ],
        });

        // Make sure we execute the script with the correct args
        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 4433,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              isolatedStack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        }));
      });

      test('Windows Instance can connect', () => {
        // WHEN
        const host = new Instance(isolatedStack, 'Host', {
          vpc,
          instanceType: InstanceType.of(
            InstanceClass.R4,
            InstanceSize.LARGE,
          ),
          machineImage: MachineImage.latestWindows( WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_CORE_BASE),
        });

        rq.configureClientInstance({
          host,
        });

        // THEN
        const userData = isolatedStack.resolve(host.userData.render());
        expect(userData).toStrictEqual({
          'Fn::Join': [
            '',
            [
              '<powershell>mkdir (Split-Path -Path \'C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' ) -ea 0\n' +
              'Read-S3Object -BucketName \'',
              { Ref: RQ_CONNECTION_ASSET.Bucket },
              '\' -key \'',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' -file \'C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '\' -ErrorAction Stop\n' +
              '$ErrorActionPreference = "Stop"\n' +
              '$DEADLINE_PATH = (get-item env:"DEADLINE_PATH").Value\n' +
              '& "$DEADLINE_PATH/deadlinecommand.exe" -executeScriptNoGui "C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '" --render-queue "https://',
              {
                'Fn::GetAtt': [
                  'RenderQueueLB235D35F4',
                  'DNSName',
                ],
              },
              ':4433" --tls-ca \"caarn\" 2>&1\n' +
              'Remove-Item -Path "C:/temp/',
              {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      '||',
                      { Ref: RQ_CONNECTION_ASSET.Key },
                    ],
                  },
                ],
              },
              '"\n' +
              'If (Get-Service "deadline10launcherservice" -ErrorAction SilentlyContinue) {\n' +
              '  Restart-Service "deadline10launcherservice"\n' +
              '} Else {\n' +
              '  & "$DEADLINE_PATH/deadlinelauncher.exe" -shutdownall 2>&1\n' +
              '  & "$DEADLINE_PATH/deadlinelauncher.exe" 2>&1\n' +
              '}</powershell>',
            ],
          ],
        });

        // Make sure we execute the script with the correct args
        expectCDK(isolatedStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: 4433,
          SourceSecurityGroupId: {
            'Fn::GetAtt': [
              isolatedStack.getLogicalId(host.connections.securityGroups[0].node.defaultChild as CfnElement),
              'GroupId',
            ],
          },
        }));
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
    const props: RenderQueueProps = {
      images,
      repository,
      version,
      vpc,
      vpcSubnets: {
        subnets,
      },
    };
    const isolatedStack = new Stack(app, 'IsolatedStack');

    // WHEN
    new RenderQueue(isolatedStack, 'RenderQueue', props);

    expectCDK(isolatedStack).to(haveResource('AWS::AutoScaling::AutoScalingGroup', {
      VPCZoneIdentifier: arrayWith(
        'SubnetID1',
        'SubnetID2',
      ),
    }));
  });

  test('can specify instance type', () => {
    // GIVEN
    const props: RenderQueueProps = {
      images,
      instanceType: InstanceType.of(InstanceClass.C5, InstanceSize.LARGE),
      repository,
      version,
      vpc,
    };
    const isolatedStack = new Stack(app, 'IsolatedStack');

    // WHEN
    new RenderQueue(isolatedStack, 'RenderQueue', props);

    // THEN
    expectCDK(isolatedStack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      InstanceType: 'c5.large',
    }));
  });

  test('no deletion protection', () => {
    // GIVEN
    const props: RenderQueueProps = {
      images,
      repository,
      version,
      vpc,
      deletionProtection: false,
    };
    const isolatedStack = new Stack(app, 'IsolatedStack');

    // WHEN
    new RenderQueue(isolatedStack, 'RenderQueue', props);

    // THEN
    expectCDK(isolatedStack).to(not(haveResourceLike('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: arrayWith(
        {
          Key: 'deletion_protection.enabled',
          Value: 'true',
        },
      ),
      Scheme: ABSENT,
      Type: ABSENT,
    })));
  });

  test('drop invalid http header fields enabled', () => {
    // GIVEN
    const props: RenderQueueProps = {
      images,
      repository,
      version,
      vpc,
    };
    const isolatedStack = new Stack(app, 'IsolatedStack');

    // WHEN
    new RenderQueue(isolatedStack, 'RenderQueue', props);

    // THEN
    expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: arrayWith(
        {
          Key: 'routing.http.drop_invalid_header_fields.enabled',
          Value: 'true',
        },
      ),
    }));
  });

  describe('hostname', () => {
    // GIVEN
    const zoneName = 'mydomain.local';

    describe('not specified', () => {
      let isolatedStack: Stack;

      beforeEach(() => {
        // GIVEN
        isolatedStack = new Stack(app, 'IsolatedStack');
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
        };

        // WHEN
        new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      // THEN
      test('does not create a record set', () => {
        expectCDK(isolatedStack).notTo(haveResource('AWS::Route53::RecordSet'));
      });
    });

    describe('specified with zone but no hostname', () => {
      let zone: PrivateHostedZone;
      let isolatedStack: Stack;
      let renderQueue: RenderQueue;

      beforeEach(() => {
        // GIVEN
        zone = new PrivateHostedZone(dependencyStack, 'Zone', {
          vpc,
          zoneName,
        });
        isolatedStack = new Stack(app, 'IsolatedStack');
        const props: RenderQueueProps = {
          images,
          repository,
          version,
          vpc,
          hostname: {
            zone,
          },
        };

        // WHEN
        renderQueue = new RenderQueue(isolatedStack, 'RenderQueue', props);
      });

      // THEN
      test('creates a record set using default hostname', () => {
        const loadBalancerLogicalId = dependencyStack.getLogicalId(
          renderQueue.loadBalancer.node.defaultChild as CfnElement,
        );
        expectCDK(isolatedStack).to(haveResource('AWS::Route53::RecordSet', {
          Name: `renderqueue.${zoneName}.`,
          Type: 'A',
          AliasTarget: objectLike({
            HostedZoneId: {
              'Fn::GetAtt': [
                loadBalancerLogicalId,
                'CanonicalHostedZoneID',
              ],
            },
          }),
        }));
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
    let isolatedVpc: Vpc;
    let isolatedRepository: Repository;
    let isolatedVersion: IVersion;
    let isolatedimages: RenderQueueImages;

    let accessBucket: Bucket;

    beforeEach(() => {
      // GIVEN
      isolatedStack = new Stack(app, 'IsolatedStack', {
        env: {
          region: 'us-east-1',
        },
      });
      isolatedVpc = new Vpc(isolatedStack, 'Vpc');
      isolatedVersion = VersionQuery.exact(isolatedStack, 'Version', {
        majorVersion: 10,
        minorVersion: 1,
        releaseVersion: 9,
        patchVersion: 1,
      });

      isolatedRepository = new Repository(isolatedStack, 'Repo', {
        version: isolatedVersion,
        vpc: isolatedVpc,
      });

      isolatedimages = {
        remoteConnectionServer: rcsImage,
      };

      accessBucket = new Bucket(isolatedStack, 'AccessBucket');

    });

    test('enabling access logs sets attributes and policies', () => {
      // GIVEN
      const props: RenderQueueProps = {
        images: isolatedimages,
        repository: isolatedRepository,
        version: isolatedVersion,
        vpc: isolatedVpc,
        accessLogs: {
          destinationBucket: accessBucket,
        },
      };

      // WHEN
      new RenderQueue(isolatedStack, 'RenderQueue', props);

      // THEN
      expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        LoadBalancerAttributes: arrayWith(
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
        ),
      }));

      expectCDK(isolatedStack).to(haveResourceLike('AWS::S3::BucketPolicy', {
        Bucket: {
          Ref: 'AccessBucketE2803D76',
        },
        PolicyDocument: {
          Statement: arrayWith(
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
                's3:PutObject*',
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
          ),
        },
      }));
    });

    test('enabling access logs works with prefix', () => {
      // GIVEN
      const props: RenderQueueProps = {
        images: isolatedimages,
        repository: isolatedRepository,
        version: isolatedVersion,
        vpc: isolatedVpc,
        accessLogs: {
          destinationBucket: accessBucket,
          prefix: 'PREFIX_STRING',
        },
      };

      // WHEN
      new RenderQueue(isolatedStack, 'RenderQueue', props);

      // THEN
      expectCDK(isolatedStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        LoadBalancerAttributes: arrayWith(
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
        ),
      }));

      expectCDK(isolatedStack).to(haveResourceLike('AWS::S3::BucketPolicy', {
        Bucket: {
          Ref: 'AccessBucketE2803D76',
        },
        PolicyDocument: {
          Statement: arrayWith(
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
                's3:PutObject*',
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
          ),
        },
      }));
    });
  });

  describe('tagging', () => {
    testConstructTags({
      constructName: 'RenderQueue',
      createConstruct: () => {
        return stack;
      },
      resourceTypeCounts: {
        'AWS::ECS::Cluster': 1,
        'AWS::EC2::SecurityGroup': 2,
        'AWS::IAM::Role': 7,
        'AWS::AutoScaling::AutoScalingGroup': 1,
        'AWS::Lambda::Function': 3,
        'AWS::SNS::Topic': 1,
        'AWS::ECS::TaskDefinition': 1,
        'AWS::DynamoDB::Table': 2,
        'AWS::SecretsManager::Secret': 2,
        'AWS::ElasticLoadBalancingV2::LoadBalancer': 1,
        'AWS::ElasticLoadBalancingV2::TargetGroup': 1,
        'AWS::ECS::Service': 1,
      },
    });
  });
});
