#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
Configures Deadline Secrets Management identity registration settings
"""

import argparse
import base64
import io
import ipaddress
import json
import os
import re
import shlex
import subprocess
import sys

from typing import Dict, Iterable, List, NamedTuple, Match

import boto3

# Regex's for validating and splitting arguments
SECRET_ARN_RE = re.compile(r'''
    ^
    arn
    :
    (aws[a-zA-Z-]*)?
    :
    secretsmanager
    :
    (?P<Region>
        [a-z]{2}
        (
            (-gov)|(-iso(b?))
        )?
        -
        [a-z]+-\d{1}
    )
    :
    \d{12}
    :
    secret
    :
    [a-zA-Z0-9-_/+=.@]+
    $
''', re.VERBOSE)
SOURCE_SUBNET_RE = re.compile(r"""
    ^
    (?P<SubnetID>[^,]+?)
    ,
    (?P<Role>Server|Client)
    ,
    (?P<RegistrationStatus>Pending|Registered|Revoked)
    $
""", re.VERBOSE)

# Regex for converting CamelCase to snake_case
RE_CAMEL_HUMP_SUB = re.compile(r'[A-Z]?[a-z]+|[A-Z]{2,}(?=[A-Z][a-z]|\d|\W|$)|\d+|[A-Z]{2,}|[A-Z]$')

# Constants for the naming convention of RFDK-managed identity registration settings
RFDK_IDENTITY_REGISTRATION_SETTING_NAME_PREFIX = f'RfdkSubnet'
RFDK_IDENTITY_REGISTRATION_SETTING_NAME_SEP = '|'
RFDK_IDENTITY_REGISTRATION_SETTING_NAME_RE = re.compile(rf"""
    ^
    {re.escape(RFDK_IDENTITY_REGISTRATION_SETTING_NAME_PREFIX)}
    {re.escape(RFDK_IDENTITY_REGISTRATION_SETTING_NAME_SEP)}
    (?P<ConnectionSubnetID>[^{RFDK_IDENTITY_REGISTRATION_SETTING_NAME_SEP}]+?)
    {re.escape(RFDK_IDENTITY_REGISTRATION_SETTING_NAME_SEP)}
    (?P<SourceSubnetID>[^{RFDK_IDENTITY_REGISTRATION_SETTING_NAME_SEP}]+?)
    $
""", re.VERBOSE)

# Bitmask for all bits in a single byte
BYTE_MASK = 0xFF

# Constants for determining the Deadline path from the environment script installed by the Deadline Client installer
# on Linux
DL_ENV_SCRIPT_PATH_RE = re.compile(r'DEADLINEBIN="(?P<DeadlineDir>.*)"$', re.VERBOSE | re.MULTILINE)
DL_ENV_SCRIPT_PATH_LINUX = '/etc/profile.d/deadlineclient.sh'
DL_PATH_FILE_MACOS = '/Users/Shared/Thinkbox/DEADLINE_PATH'


#####################################
#          DATA STRUCTURES          #
#####################################


class AwsSecret(NamedTuple):
    arn: str
    region: str


def _camel_to_snake_case(camel_str: str):
    words = re.findall(RE_CAMEL_HUMP_SUB, camel_str)
    return '_'.join(map(str.lower, words))


class LoadBalancerIdentityRegistrationSetting(NamedTuple):
    connection_ip_filter_type: str
    connection_ip_filter_value: str
    source_ip_filter_type: str
    source_ip_filter_value: str
    settings_id: str
    settings_name: str
    is_enabled: bool
    default_status: str
    default_role: str

    @classmethod
    def from_json(cls, json_data: Dict) -> 'LoadBalancerIdentityRegistrationSetting':
        kwargs = {
            _camel_to_snake_case(key): value
            for key, value in json_data.items()
        }

        return LoadBalancerIdentityRegistrationSetting(**kwargs)


class SourceSubnet(NamedTuple):
    subnet_id: str
    role: str
    registration_status: str


##############################################
#          PROGRAM ARGUMENT HANDLING         #
##############################################


def parse_args(args):
    """
    Parses all command line arguments and convert them into named tuples

    :param args: A list of command line arguments
    :return: A configuration object containing the parsed arguments
    """

    def _secret(value):
        """
        A type function for converting args that represent secrets into a named Tuple

        :param value: The string representing the argument
        :return: AwsSecret based on the value
        :exception argparse.ArgumentTypeError: if the argument cannot be converted properly.
        """

        match = SECRET_ARN_RE.match(value)
        if match:
            named_groups = match.groupdict()
            return AwsSecret(arn=value,region=named_groups["Region"])

        raise argparse.ArgumentTypeError('Given argument "%s" is not a valid secret' % value)

    def _source_subnet(value):
        """
        A type function for converting args that represent source subnets
        """
        match = SOURCE_SUBNET_RE.match(value)
        if match:
            named_groups = match.groupdict()
            subnet_id = named_groups['SubnetID']
            role = named_groups['Role']
            registration_status = named_groups['RegistrationStatus']
            return SourceSubnet(
                role                = role,
                registration_status = registration_status,
                subnet_id           = subnet_id
            )

        raise argparse.ArgumentTypeError('Given argument "%s" is not a valid source subnet' % value)


    parser = argparse.ArgumentParser(description="Configures Deadline Secrets Management identity registration settings")
    parser.add_argument(
        '--credentials',
        type        = _secret,
        required    = True,
        help        = 'Specifies Deadline Secrets Management admin credentials. This must be an AWS Secrets Manager ' \
                      'secret arn',
    )
    parser.add_argument(
        '--region',
        required    = True,
        help        = 'The region where the Repository, Render Queue, and Clients reside',
    )
    parser.add_argument(
        '--connection-subnet',
        action      = 'append',
        help        = 'Specifies one or more subnet IDs that the Render Queue\'s load balancer will connect from',
    )
    parser.add_argument(
        '--source-subnet',
        type    = _source_subnet,
        action  = 'append',
        help    = 'Specifies one or more source subnets that Deadline Clients will connect from and their role and ' \
                  'registration status to be applied. This should be a comma-separated string where the first two ' \
                  'elements are the role and status respectively and additional elements are subnet IDs'
    )

    return parser.parse_args(args)


def validate_config(config):
    source_subnets = config.source_subnet # type: List[SourceSubnet]

    # Validate that source subnets are unique
    observed_subnets = set()
    for source_subnet in source_subnets:
        subnet_id = source_subnet.subnet_id
        if subnet_id not in observed_subnets:
            observed_subnets.add(subnet_id)
        else:
            raise ValueError(f"Subnet \"{subnet_id}\" is not unique")

    if not getattr(config, 'connection_subnet', None):
        raise ValueError('no --connection-subnet specified')


####################################
#          AWS INTERACTION         #
####################################


def fetch_secret(secret, binary=False):
    """
    Fetch a secret from AWS

    :return: returns the contents of the secret
    """
    if isinstance(secret, AwsSecret):
        secrets_client = boto3.client('secretsmanager', region_name=secret.region)
        secret_value = secrets_client.get_secret_value(SecretId=secret.arn)
        if binary:
            return base64.b64decode(secret_value.get('SecretBinary'))
        else:
            return secret_value.get('SecretString')
    else:
        raise TypeError('Unknown Secret type.')


def get_subnet_cidrs(region: str, subnet_ids: Iterable[str]) -> Dict[str, str]:
    ec2 = boto3.resource('ec2', region_name=region)

    return {
        subnet.subnet_id: subnet.cidr_block
        for subnet in ec2.subnets.filter(SubnetIds=list(subnet_ids))
    }


############################################################
#          DEADLINE SECRETS MANAGEMENT INTERACTION         #
############################################################


class DeadlineSecretsCommandClient(object):
    _PW_ENV_VAR_NAME = 'DL_SM_PW'

    def __init__(self, username, password):
        self._username = username
        self._password = password

        self._deadline_command_path = self._get_deadline_command_path()

    def _transform_args(self, args: List[str]) -> List[str]:
        return (
            # Use JSON output if specified
            # Secrets top-level command
            ['secrets']
            # Use the sub-command from the arguments
            + list(args[:1])
            # Inject the credentials
            + [
                self._username,
                # Password is sourced from the env var
                '--password', 'env:%s' % DeadlineSecretsCommandClient._PW_ENV_VAR_NAME
            ]
            # Append the rest of the supplied arguments
            + list(args[1:])
        )

    def _call_deadline_command(self, args: List[str]) -> str:
        try:
            os.environ[DeadlineSecretsCommandClient._PW_ENV_VAR_NAME] = self._password
            return self._call_deadline_command_raw(args)
        finally:
            del os.environ[DeadlineSecretsCommandClient._PW_ENV_VAR_NAME]

    def run_str(self, *args: Iterable[str]):
        transformed_args = self._transform_args(args)

        return self._call_deadline_command(transformed_args)

    def run_json(self, *args: Iterable[str]):
        transformed_args = self._transform_args(args)

        # Prepend the arguments with the json command-line flag
        transformed_args = ['--json'] + transformed_args

        result = json.loads(self._call_deadline_command(transformed_args))

        if isinstance(result, dict) and 'ok' in result.keys():
            if result['ok'] == False:
                raise ValueError('DeadlineCommandError: \n%s' % (result))

        return result

    def dry_run(self, *args: Iterable[str]):
        transformed_args = self._transform_args(args)
        transformed_args = ['deadlinecommand'] + transformed_args
        print(' '.join(shlex.quote(arg) for arg in transformed_args))

    @staticmethod
    def _get_deadline_command_path():
        """
        Find the Deadline executable on the current machine

        :return: the string path to the Deadline executable.
        """

        deadline_bin = os.environ.get('DEADLINE_PATH', '')

        # On Linux, the Deadline Client installer creates a system-wide script to set the DEADLINE_PATH environment
        # variable. Cloud-init does not load system environment variables. Cherry-pick the
        # environment variable installed by the Deadline Client installer.
        if not deadline_bin and os.path.exists(DL_ENV_SCRIPT_PATH_LINUX):
            print(f'using environement script at "{DL_ENV_SCRIPT_PATH_LINUX}"...')
            with io.open(DL_ENV_SCRIPT_PATH_LINUX, 'r', encoding='utf8') as env_script:
                env_script_contents = env_script.read()
            dl_path_match = DL_ENV_SCRIPT_PATH_RE.search(env_script_contents)
            if dl_path_match:
                deadline_bin = dl_path_match.group('DeadlineDir')

        # On OSX, we look for the DEADLINE_PATH file if the environment variable does not exist.
        if deadline_bin == "" and os.path.exists(DL_PATH_FILE_MACOS):
            print(f'using MacOS Deadline path file at "{DL_PATH_FILE_MACOS}"...')
            with io.open(DL_PATH_FILE_MACOS, 'r', encoding='utf8') as f:
                deadline_bin = f.read().strip()

        if not deadline_bin:
            raise ValueError('Could not determine deadline path')

        deadline_command = os.path.join(deadline_bin, "deadlinecommand")

        return deadline_command

    def _call_deadline_command_raw(self, arguments):
        """
        Executes a deadline command and return the output

        :param arguments: the list of arguments to be passed to Deadline.
        """
        # make a copy so we don't mutate the caller's reference
        arguments = list(arguments)
        arguments.insert(0, self._deadline_command_path)
        try:
            proc = subprocess.Popen(
                arguments,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
        except:
            raise Exception('Failed to call Deadline.')

        output, errors = proc.communicate()
        if proc.returncode != 0:
            raise ValueError('DeadlineCommandError: \n%s\n%s' % (output, errors))
        return output.decode('utf8')


def subnet_to_setting_name(connection_subnet_id:str, source_subnet_id: str) -> str:
    return RFDK_IDENTITY_REGISTRATION_SETTING_NAME_SEP.join((
        RFDK_IDENTITY_REGISTRATION_SETTING_NAME_PREFIX,
        connection_subnet_id,
        source_subnet_id,
    ))


def is_rfdk_setting(setting: LoadBalancerIdentityRegistrationSetting) -> bool:
    return bool(RFDK_IDENTITY_REGISTRATION_SETTING_NAME_RE.search(setting.settings_name))


def get_rfdk_registration_settings(dl_secrets: DeadlineSecretsCommandClient) -> List[LoadBalancerIdentityRegistrationSetting]:
    all_registration_settings = [
        LoadBalancerIdentityRegistrationSetting.from_json(registration_setting)
        for registration_setting in dl_secrets.run_json('GetLoadBalancerIdentityRegistrationSettings')
    ]

    print('all registration settings = ', end='')
    print(json.dumps([setting.settings_name for setting in all_registration_settings], indent=4))

    rfdk_registration_settings = [
        registration_setting
        for registration_setting in all_registration_settings
        if is_rfdk_setting(registration_setting)
    ]

    print('RFDK-managed settings = ', end='')
    print(json.dumps([setting.settings_name for setting in rfdk_registration_settings], indent=4))

    return rfdk_registration_settings


def delete_setting(dl_secrets: DeadlineSecretsCommandClient, setting: LoadBalancerIdentityRegistrationSetting) -> None:
    print(dl_secrets.run_str(
        'DeleteLoadBalancerIdentityRegistrationSetting',
        setting.settings_id
    ))


def cidr_to_ipv4_match(cidr: str) -> str:
    network = ipaddress.ip_network(cidr)
    if not isinstance(network, ipaddress.IPv4Network):
        raise TypeError(f'"{cidr}" is not an IPv4 network')

    # Get the network address, net mask, and host mask as byte arrays
    nw_address = network.network_address.packed
    netmask = network.netmask.packed
    hostmask = network.hostmask.packed

    ipv4_match_octets: List[str] = []


    for byte_netmask, byte_hostmask, byte_nw_address in zip(netmask, hostmask, nw_address):
        if byte_netmask == BYTE_MASK:
            # If all bits in the byte are part of the netmask, just set
            # the byte as defined in the network address
            ipv4_match_octets.append(str(byte_nw_address))
        elif byte_netmask == 0:
            # If none of the bits of the byte are part of the netmask, the
            # byte is free and we can match any IP
            ipv4_match_octets.append('*')
        else:
            # In this case, the byte is partially fixed and we need to find the
            # range
            byte_min = byte_netmask & byte_nw_address
            byte_max = byte_min + byte_hostmask
            ipv4_match_octets.append(f'{byte_min}-{byte_max}')

    return '.'.join(ipv4_match_octets)


def prepare_desired_setting(
        connection_subnet_id: str,
        source_subnet: SourceSubnet,
        subnet_to_cidr: Dict[str, str]
) -> LoadBalancerIdentityRegistrationSetting:
    connection_subnet_cidr = subnet_to_cidr[connection_subnet_id]
    source_subnet_cidr = subnet_to_cidr[source_subnet.subnet_id]
    connection_subnet_ipv4_match = cidr_to_ipv4_match(connection_subnet_cidr)
    source_subnet_ipv4_match = cidr_to_ipv4_match(source_subnet_cidr)

    return LoadBalancerIdentityRegistrationSetting(
        # This is left blank since the downstream code does not use it
        settings_id='',
        settings_name=subnet_to_setting_name(connection_subnet_id, source_subnet.subnet_id),
        connection_ip_filter_type='IPv4Match',
        connection_ip_filter_value=connection_subnet_ipv4_match,
        source_ip_filter_type='IPv4Match',
        source_ip_filter_value=source_subnet_ipv4_match,
        default_role=source_subnet.role,
        default_status=source_subnet.registration_status,
        is_enabled=True,
    )


def delete_removed_settings(
        dl_secrets: DeadlineSecretsCommandClient,
        prior_rfdk_settings: List[LoadBalancerIdentityRegistrationSetting],
        connection_subnet_ids: List[str],
        source_subnets: List[SourceSubnet]
) -> None:
    desired_source_subnet_ids = set(source_subnet.subnet_id for source_subnet in source_subnets)
    desired_connection_subnet_ids = set(connection_subnet_ids)

    for prior_rfdk_setting in prior_rfdk_settings:
        match = RFDK_IDENTITY_REGISTRATION_SETTING_NAME_RE.search(prior_rfdk_setting.settings_name)
        if not match:
            raise ValueError('Recevied non-RFDK load balancer identity registration setting %s' % prior_rfdk_setting._asdict())
        source_subnet_id = match.group('SourceSubnetID')
        connection_subnet_id = match.group('ConnectionSubnetID')
        if source_subnet_id not in desired_source_subnet_ids or connection_subnet_id not in desired_connection_subnet_ids:
            print(f'Rule "{prior_rfdk_setting.settings_name}" removed from RFDK. Deleting setting from Deadline...')
            delete_setting(dl_secrets, prior_rfdk_setting)


def create_and_update_settings(
        dl_secrets: DeadlineSecretsCommandClient,
        prior_rfdk_settings: List[LoadBalancerIdentityRegistrationSetting],
        connection_subnet_ids: List[str],
        source_subnets: List[SourceSubnet],
        subnet_to_cidr: Dict[str, str],
) -> None:
    prior_settings_by_name = {
        prior_rfdk_setting.settings_name: prior_rfdk_setting
        for prior_rfdk_setting in prior_rfdk_settings
    }

    for connection_subnet_id in connection_subnet_ids:
        for source_subnet in source_subnets:
            setting_name = subnet_to_setting_name(connection_subnet_id, source_subnet.subnet_id)
            prior_rfdk_setting = prior_settings_by_name.get(setting_name, None)
            desired_rfdk_setting = prepare_desired_setting(
                connection_subnet_id,
                source_subnet,
                subnet_to_cidr
            )
            if prior_rfdk_setting:
                # Create a new desired setting with the "settings_id" field set to match the existing setting
                desired_rfdk_setting_fields = desired_rfdk_setting._asdict()
                desired_rfdk_setting_fields.update(settings_id=prior_rfdk_setting.settings_id)
                desired_rfdk_setting = LoadBalancerIdentityRegistrationSetting(**desired_rfdk_setting_fields)

                if setting_differs(prior_rfdk_setting, desired_rfdk_setting):
                    update_setting(dl_secrets, desired_rfdk_setting)
                else:
                    print(f'setting "{setting_name}" exists and is up-to-date, skipping')
            else:
                create_setting(dl_secrets, desired_rfdk_setting)


def setting_differs(
    setting_a: LoadBalancerIdentityRegistrationSetting,
    setting_b: LoadBalancerIdentityRegistrationSetting,
) -> bool:
    return setting_a != setting_b


def update_setting(
    dl_secrets: DeadlineSecretsCommandClient,
    setting: LoadBalancerIdentityRegistrationSetting,
) -> None:
    print(json.dumps(
        {
            "action": "update",
            "setting": setting._asdict(),
        },
        indent=2,
    ))
    print(dl_secrets.run_str(
        "UpdateLoadBalancerIdentityRegistrationSetting",
        setting.settings_id,
        setting.settings_name,
        setting.connection_ip_filter_type,
        setting.connection_ip_filter_value,
        setting.source_ip_filter_type,
        setting.source_ip_filter_value,
        setting.default_role,
        setting.default_status,
        str(setting.is_enabled),
    ))


def create_setting(
    dl_secrets: DeadlineSecretsCommandClient,
    setting: LoadBalancerIdentityRegistrationSetting,
) -> None:
    print(json.dumps(
        {
            "action": "create",
            "setting": setting._asdict(),
        },
        indent=2,
    ))
    print(dl_secrets.run_str(
        "CreateLoadBalancerIdentityRegistrationSetting",
        setting.settings_name,
        setting.connection_ip_filter_type,
        setting.connection_ip_filter_value,
        setting.source_ip_filter_type,
        setting.source_ip_filter_value,
        setting.default_role,
        setting.default_status,
        str(setting.is_enabled),
    ))


def apply_registration_settings(config):
    connection_subnets = config.connection_subnet # type: List[str]
    credentials = json.loads(fetch_secret(config.credentials))
    source_subnets = config.source_subnet # type: List[SourceSubnet]

    # Get the CIDR ranges of all subnets involved in the desired registration setting rules
    all_subnets = set(connection_subnets).union(
        source_subnet.subnet_id for source_subnet in source_subnets
    )
    subnet_to_cidr = get_subnet_cidrs(config.region, all_subnets)
    print('subnet_to_cidr = ' + json.dumps(subnet_to_cidr, indent=4))

    dl_secrets = DeadlineSecretsCommandClient(credentials['username'], credentials['password'])

    prior_rfdk_settings = get_rfdk_registration_settings(dl_secrets)

    delete_removed_settings(dl_secrets, prior_rfdk_settings, connection_subnets, source_subnets)
    create_and_update_settings(dl_secrets, prior_rfdk_settings, connection_subnets, source_subnets, subnet_to_cidr)


################################
#          ENTRY POINT         #
################################


def __main__(*args):
    """Main entrypoint function

    This function is named to be compatible with "deadlinecommand ExecuteScriptNoGui ..." which expects the python
    module to contain this function.
    """
    config = parse_args(args)
    validate_config(config)
    apply_registration_settings(config)


# If the function is called directly from a python interpreter, call the entrypoint with the arguments
if __name__ == '__main__':
    __main__(*sys.argv[1:])
