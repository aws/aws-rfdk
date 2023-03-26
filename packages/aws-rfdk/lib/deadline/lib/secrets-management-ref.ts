/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IVpc,
  SubnetSelection,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * Deadline Secrets Management roles.
 *
 * See https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#assigned-roles
 */
export enum SecretsManagementRole {
  /**
   * The administrator role is given to users that are created either by the Repository Installer when enabling the
   * Deadline Secrets Management feature for the first time, or by running the CreateNewAdmin command. Note: there can
   * be more than one Administrator user. All Administrators are equal and have full read and write access to all
   * secrets.
   */
  ADMINISTRATOR = 'Administrator',

  /**
   * The Server role is intended to be granted to your machine(s) running the
   * [Remote Connection Server](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/remote-connection-server.html#remote-connection-server-ref-label)
   * application. The Server role is granted to a registered machine by an administrator in the
   * [Monitor UI](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#identity-management-assigning-ref-label).
   * In order to encrypt and decrypt secrets, the master key must be assigned to the Server by an Administrator user
   * running the [GrantKeyAccessToServer command](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#deadline-secrets-management-command-grantkeyaccesstoserver).
   * Servers can encrypt and decrypt all secrets, and are responsible for providing secrets to approved clients.
   */
  SERVER = 'Server',

  /**
   * The Client role is typically intended to be granted to any of your machines running the
   * [Worker](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/worker.html#worker-ref-label)
   * application. The Client role is granted to a registered machine by an administrator in the
   * [Monitor UI](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#identity-management-assigning-ref-label).
   * Clients can request storage of secrets not in the
   * [Administrator Secret Access Level](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#deadline-secrets-management-secret-namespace-ref-label),
   * and can retrieve secrets from all namespaces when authenticating through the server.
   */
  CLIENT = 'Client',
};

/**
 * The different possible Deadline Secrets Management registration statuses that a Deadline Client's identity can be set
 * to.
 *
 * See https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#registration-status
 */
export enum SecretsManagementRegistrationStatus {
  /**
   * This is the default status for an Identity that has just registered itself. It cannot access any secrets with this status.
   */
  PENDING = 'Pending',

  /**
   * This status allows Identities to make use of the Secrets API, so long as they have the appropriate
   * [Identity Role](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#identity-management-roles-ref-label).
   */
  REGISTERED = 'Registered',

  /**
   * Identities with this status will not be allowed to make use of the Secrets API.
   */
  REVOKED = 'Revoked',
}

/**
 * Properties that specify how to deploy and configure an identity registration setting for a specified VPC subnet
 */
export interface SubnetIdentityRegistrationSettingsProps {
  /**
   * A construct node to make dependent on the registration setting being updated
   */
  readonly dependent: Construct;

  /**
   * The Deadline Secrets Management registration status to be applied to the Deadline Client identities that connect
   * from the specified VPC subnets.
   *
   * See https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#registration-status
   */
  readonly registrationStatus: SecretsManagementRegistrationStatus;

  /**
   * The role to be assigned to the Deadline Client identities that connect from the specified VPC subnets.
   *
   * See https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#assigned-roles
   */
  readonly role: SecretsManagementRole;

  /**
   * The VPC of the Deadline Client host instances to be registered
   */
  readonly vpc: IVpc;

  /**
   * The VPC subnets of the Deadline Client host instances to be registered
   */
  readonly vpcSubnets: SubnetSelection;
}
