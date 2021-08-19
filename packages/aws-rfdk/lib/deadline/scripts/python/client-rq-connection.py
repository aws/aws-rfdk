# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
Configures the Deadline Client to connect to the Render Queue
"""

import argparse
import base64
from collections import namedtuple
import errno
import os
import re
import subprocess
from sys import platform

import boto3

# Regex's for validating and splitting arguments
RENDER_QUEUE_URI_RE = re.compile(r'^(?P<Scheme>https?)://(?P<Address>.*)$')
SECRET_ARN_RE = re.compile(r'^arn:(aws[a-zA-Z-]*)?:secretsmanager:(?P<Region>[a-z]{2}((-gov)|(-iso(b?)))?-[a-z]+-\d{1}):\d{12}:secret:[a-zA-Z0-9-_/+=.@]+$')
FILE_URI_RE = re.compile(r'^file:///(?P<FilePath>((?:[^/]*/)*)(.*))$')

# Regex for counting the number of certificates in a cert chain
CERT_COUNT_RE = re.compile(r'-----BEGIN CERTIFICATE-----')

# Named tuples for storing arguments
RenderQueue = namedtuple('RenderQueue','uri,scheme,address')
AwsSecret = namedtuple('AwsSecret','arn,region')
FileSecret = namedtuple('FileSecret', 'filepath')

# Locations to store certificates
if platform.startswith('win'):
    CERT_DIR = os.path.join(os.path.expanduser('~'), 'tls_cert')
else:
    CERT_DIR = '/app/tls_cert'

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
        :return: AwsSecret or FileSecret based on the value
        :exception argparse.ArgumentTypeError: if the argument cannot be converted properly.
        """

        match = SECRET_ARN_RE.match(value)
        if match:
            named_groups = match.groupdict()
            return AwsSecret( arn=value,region=named_groups["Region"] )

        match = FILE_URI_RE.match( value )
        if match:
            named_groups = match.groupdict()
            return FileSecret( arn=named_groups['FilePath'] )

        raise argparse.ArgumentTypeError('Given argument "%s" is not a valid secret' % value)

    def _render_queue(value):
        """
        A type function for converting args that represent render queue URI's into a named Tuple

        :param value: The string representing the argument
        :return: A RenderQueue named tuple
        :exception argparse.ArgumentTypeError: if the argument cannot be converted properly.
        """

        match = RENDER_QUEUE_URI_RE.match(value)
        if match:
            named_groups = match.groupdict()
            return RenderQueue(
                uri=value,
                scheme=named_groups['Scheme'],
                address=named_groups['Address']
            )
        raise argparse.ArgumentTypeError()

    parser = argparse.ArgumentParser(description="Configures the Deadline Client to connect to the Render Queue")
    parser.add_argument(
        '--render-queue',
        required=True,
        type=_render_queue,
        help="Specifies how to connect to the Deadline Render Queue. The URI must must include"
             " the scheme (http vs https), a hostname and an optional port number.\n\n"
             "    http[s]://<HOSTNAME>[:<PORT>]\n\n"
             "When the URI is https, then one (and only one) of tls-ca and client-tls-cert may be specified"
    )
    parser.add_argument(
        '--tls-ca',
        type=_secret,
        help="Specifies a X509 CA certificate to use to validate the TLS server certificate."
    )
    parser.add_argument(
        '--client-tls-cert',
        type=_secret,
        help="Specifies a TLS client certificate that will be presented for authentication to the Deadline Render Queue."
    )
    parser.add_argument(
        '--client-tls-cert-passphrase',
        type=_secret,
        help="Specifies a X509 CA certificate to use to validate the TLS server certificate."
    )

    return parser.parse_args(args)

def validate_config(config):
    """
    Validate a parsed configuration to ensure that it is valid for use

    :param config: The parse configuration object
    :exception: Value Error if the configuration is invalid.
    """

    # If we are using tls then we must be given exactly one of tls_ca and client_tls_cert
    if config.render_queue.scheme == 'https':
        if sum([bool(config.tls_ca), bool(config.client_tls_cert)]) != 1:
            raise ValueError("Exactly one of --tls-ca or --client-tls-cert arguments must be passed specified when using TLS")

def configure_deadline( config ):
    """
    Configures Deadline to be able to connect to the given Render Queue

    :param config: The parsed configuration object
    """

    # Ensure that the client is configured to connect to a Remote RCS.
    call_deadline_command(['SetIniFileSetting', 'ConnectionType', 'Remote'])

    repo_args = ['ChangeRepository','Proxy',config.render_queue.address]
    if config.render_queue.scheme == 'http':
        print( "Configuring Deadline to connect to the Render Queue (%s) using HTTP Traffic" % config.render_queue.address )
        #Ensure SSL is disabled
        call_deadline_command(['SetIniFileSetting','ProxyUseSSL','False'])
        call_deadline_command(['SetIniFileSetting', 'ProxySSLCA', ''])
        call_deadline_command(['SetIniFileSetting', 'ClientSSLAuthentication', 'NotRequired'])

    else:
        print("Configuring Deadline to connect to the Render Queue using HTTPS Traffic")
        call_deadline_command(['SetIniFileSetting','ProxyUseSSL','True'])

        try:
            os.makedirs(CERT_DIR)
        except OSError as e:
            if e.errno != errno.EEXIST:
                raise

        if config.tls_ca:
            """
            If we are configuring Deadline to connect using a CA for trust then we need to:
            * Fetch the cert chain
            * Confirm the chain contains only 1 cert
            * Tell Deadline that SSL Authentication is not required
            """
            cert_path = os.path.join(CERT_DIR,'ca.crt')
            cert_contents = fetch_secret(config.tls_ca)
            if len( CERT_COUNT_RE.findall(cert_contents) ) != 1:
                raise ValueError("The TLS CA Cert must contain exactly 1 certificate")
            with open(cert_path, 'w') as f:
                f.write(cert_contents)

            call_deadline_command(['SetIniFileSetting', 'ProxySSLCA', cert_path])
            call_deadline_command(['SetIniFileSetting', 'ClientSSLAuthentication', 'NotRequired'])
            repo_args.append(cert_path)
        else:
            """
            If we are configuring Deadline to connect using a client cert we need to:
            * Fetch the pkcs12 binary file
            * Optionally fetch the password
            * Tell Deadline that SSL Authentication is Required
            """

            cert_path = os.path.join(CERT_DIR, 'client.pfx')
            cert_contents = fetch_secret(config.client_tls_cert)
            with open(cert_path, 'wb') as f:
                f.write(cert_contents)

            call_deadline_command(['SetIniFileSetting', 'ProxySSLCA', cert_path])
            call_deadline_command(['SetIniFileSetting', 'ClientSSLAuthentication', 'Required'])
            repo_args.append(cert_path)
            if config.client_tls_cert_passphrase:
                passphrase = fetch_secret(config.client_tls_cert_passphrase)
                repo_args.append(passphrase)

            change_repo_results = call_deadline_command(repo_args)
            if change_repo_results.startswith('Deadline configuration error:'):
                print(change_repo_results)
                raise Exception(change_repo_results)

def call_deadline_command(arguments):
    """
    Executes a deadline command and return the output

    :param arguments: the list of arguments to be passed to Deadline.
    """
    deadline_command = get_deadline_command()
    arguments.insert(0, deadline_command)
    try:
        proc = subprocess.Popen(arguments, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except:
        raise Exception('Failed to call Deadline.')

    output, errors = proc.communicate()
    return output

def get_deadline_command():
    """
    Find the Deadline executable on the current machine

    :return: the string path to the Deadline executable.
    """

    deadline_bin = ""
    try:
        deadline_bin = os.environ['DEADLINE_PATH']
    except KeyError:
        # if the error is a key error it means that DEADLINE_PATH is not set. however Deadline command may be in the PATH or on OSX it could be in the file /Users/Shared/Thinkbox/DEADLINE_PATH
        pass

    # On OSX, we look for the DEADLINE_PATH file if the environment variable does not exist.
    if deadline_bin == "" and os.path.exists("/Users/Shared/Thinkbox/DEADLINE_PATH"):
        with open("/Users/Shared/Thinkbox/DEADLINE_PATH") as f:
            deadline_bin = f.read().strip()

    deadlineCommand = os.path.join(deadline_bin, "deadlinecommand")

    return deadlineCommand

def fetch_secret( secret, binary=False ):
    """
    Fetch a secret from AWS or from a local file

    :return: returns the contents of the secret
    """
    if isinstance(secret, AwsSecret):
        secrets_client = boto3.client('secretsmanager', region_name=secret.region)
        secret_value = secrets_client.get_secret_value(SecretId=secret.arn)
        if binary:
            return base64.b64decode(secret_value.get('SecretBinary'))
        else:
            return secret_value.get('SecretString')
    elif isinstance(secret,FileSecret):
        with open(secret.filepath,'r') as f:
            return f.read()
    else:
        raise TypeError('Unknown Secret type.')

def __main__(*args):
    config = parse_args( args )
    validate_config(config)

    configure_deadline(config)