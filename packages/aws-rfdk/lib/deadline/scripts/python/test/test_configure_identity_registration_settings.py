#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
Tests for configure_identity_registration_settings.py
"""

import json
import re
import subprocess
import sys
import unittest
from unittest.mock import MagicMock, Mock, patch

sys.modules['boto3'] = Mock()

import configure_identity_registration_settings as subject

RFDK_REG_SETTING_JSON_1 = {
    "ConnectionIpFilterType":"IPv4Match",
    "ConnectionIpFilterValue":"111.111.*.*", # 111.111.0.0/16
    "SourceIpFilterType":"IPv4Match",
    "SourceIpFilterValue":"123.123.123.*", # 123.123.123.0/24
    "SettingsId":"settings1",
    "SettingsName":"RfdkSubnet|subnet-aaaaaaa|subnet-1111111",
    "IsEnabled":True,
    "DefaultStatus":"Registered",
    "DefaultRole":"Client"
}
RFDK_REG_SETTING_1 = subject.LoadBalancerIdentityRegistrationSetting(
    connection_ip_filter_type=RFDK_REG_SETTING_JSON_1["ConnectionIpFilterType"],
    connection_ip_filter_value=RFDK_REG_SETTING_JSON_1["ConnectionIpFilterValue"],
    source_ip_filter_type=RFDK_REG_SETTING_JSON_1["SourceIpFilterType"],
    source_ip_filter_value=RFDK_REG_SETTING_JSON_1["SourceIpFilterValue"],
    settings_id=RFDK_REG_SETTING_JSON_1["SettingsId"],
    settings_name=RFDK_REG_SETTING_JSON_1["SettingsName"],
    is_enabled=RFDK_REG_SETTING_JSON_1["IsEnabled"],
    default_status=RFDK_REG_SETTING_JSON_1["DefaultStatus"],
    default_role=RFDK_REG_SETTING_JSON_1["DefaultRole"],
)

RFDK_REG_SETTING_JSON_2 = {
    "ConnectionIpFilterType":"IPv4Match",
    "ConnectionIpFilterValue":"255.*.*.*", # 255.0.0.0/8
    "SourceIpFilterType":"IPv4Match",
    "SourceIpFilterValue":"3.3.0-63.*", # 3.3.0.0/18
    "SettingsId":"settings3",
    "SettingsName":"RfdkSubnet|subnet-bbbbbbb|subnet-2222222",
    "IsEnabled":True,
    "DefaultStatus":"Registered",
    "DefaultRole":"Client"
}
RFDK_REG_SETTING_2 = subject.LoadBalancerIdentityRegistrationSetting(
    connection_ip_filter_type=RFDK_REG_SETTING_JSON_2["ConnectionIpFilterType"],
    connection_ip_filter_value=RFDK_REG_SETTING_JSON_2["ConnectionIpFilterValue"],
    source_ip_filter_type=RFDK_REG_SETTING_JSON_2["SourceIpFilterType"],
    source_ip_filter_value=RFDK_REG_SETTING_JSON_2["SourceIpFilterValue"],
    settings_id=RFDK_REG_SETTING_JSON_2["SettingsId"],
    settings_name=RFDK_REG_SETTING_JSON_2["SettingsName"],
    is_enabled=RFDK_REG_SETTING_JSON_2["IsEnabled"],
    default_status=RFDK_REG_SETTING_JSON_2["DefaultStatus"],
    default_role=RFDK_REG_SETTING_JSON_2["DefaultRole"],
)

NON_RFDK_REG_SETTING_JSON = {
    "ConnectionIpFilterType":"IPv4Match",
    "ConnectionIpFilterValue":"2.2.2.2",
    "SourceIpFilterType":"IPv4Match",
    "SourceIpFilterValue":"1.1.1.1",
    "SettingsId":"settings2",
    "SettingsName":"LBSetting2",
    "IsEnabled":False,
    "DefaultStatus":"Registered",
    "DefaultRole":"Server"
}


class TestConfigureIdentityRegistrationSettingsConfigAndHelpers(unittest.TestCase):
    def test_camel_to_snake_case(self):
        test_cases = {
            'CamelCase': 'camel_case',
            'camelCamelCase': 'camel_camel_case',
            'Camel2Camel2Case': 'camel_2_camel_2_case',
            'GetHTTPResponseCode': 'get_http_response_code',
            'get200HTTPResponseCode': 'get_200_http_response_code',
            'getHTTP200ResponseCode': 'get_http_200_response_code',
            'HTTPResponseCode': 'http_response_code',
            'ResponseHTTP': 'response_http',
            'ResponseHTTP2': 'response_http_2',
            '10CoolDudes': '10_cool_dudes',
            'aB': 'a_b'
        }
        for camel_case, snake_case in test_cases.items():
            self.assertEqual(subject._camel_to_snake_case(camel_case), snake_case)


    def test_parsing_basic_config(self):
        config = subject.parse_args([
            "--credentials", "arn:aws:secretsmanager:us-west-2:111122223333:secret:aes128-1a2b3c",
            "--region", "test-region",
            "--connection-subnet", "subnet-7e572",
            "--source-subnet", "subnet-50c34,Client,Registered"
        ])

        self.assertEqual(config.credentials, subject.AwsSecret(arn="arn:aws:secretsmanager:us-west-2:111122223333:secret:aes128-1a2b3c", region="us-west-2"))
        self.assertEqual(config.region, "test-region")
        self.assertEqual(config.connection_subnet, ["subnet-7e572"])
        self.assertListEqual( config.source_subnet, [ subject.SourceSubnet(subnet_id="subnet-50c34", role="Client", registration_status="Registered") ] )


    def test_parsing_complex_config(self):
        config = subject.parse_args([
            "--credentials", "arn:aws:secretsmanager:us-west-2:111122223333:secret:aes128-1a2b3c",
            "--region", "test-region",
            "--connection-subnet", "subnet-7e573",
            "--connection-subnet", "subnet-7e574",
            "--source-subnet", "subnet-50c31,Client,Registered",
            "--source-subnet", "subnet-50c32,Server,Pending"
        ])

        self.assertEqual(config.credentials, subject.AwsSecret(arn="arn:aws:secretsmanager:us-west-2:111122223333:secret:aes128-1a2b3c", region="us-west-2"))
        self.assertEqual(config.region, "test-region")
        self.assertListEqual(config.connection_subnet, [ "subnet-7e573", "subnet-7e574" ])
        self.assertListEqual(
            config.source_subnet,
            [
                subject.SourceSubnet(subnet_id="subnet-50c31", role="Client", registration_status="Registered"),
                subject.SourceSubnet(subnet_id="subnet-50c32", role="Server", registration_status="Pending")
            ]
        )


    def test_validate_config(self):
        config = subject.parse_args([
            "--credentials", "arn:aws:secretsmanager:us-west-2:111122223333:secret:aes128-1a2b3c",
            "--region", "test-region",
            "--connection-subnet", "subnet-7e573",
            "--connection-subnet", "subnet-7e574",
            "--source-subnet", "subnet-50c31,Client,Registered",
            "--source-subnet", "subnet-50c32,Server,Pending"
        ])

        # Shouldn't throw
        subject.validate_config(config)


    def test_validate_config_no_connection(self):
        config = subject.parse_args([
            "--credentials", "arn:aws:secretsmanager:us-west-2:111122223333:secret:aes128-1a2b3c",
            "--region", "test-region",
            "--source-subnet", "subnet-50c31,Client,Registered"
        ])

        self.assertRaisesRegex(ValueError, "no --connection-subnet specified", lambda: subject.validate_config(config))


    def test_validate_config_duplicate_subnet(self):
        subnet_id = "subnet-8008135"
        config = subject.parse_args([
            "--credentials", "arn:aws:secretsmanager:us-west-2:111122223333:secret:aes128-1a2b3c",
            "--region", "test-region",
            "--connection-subnet", "subnet-7e573",
            "--connection-subnet", "subnet-7e574",
            "--source-subnet", f"{subnet_id},Client,Registered",
            "--source-subnet", f"{subnet_id},Server,Pending"
        ])

        self.assertRaisesRegex(ValueError, f"Subnet \"{subnet_id}\" is not unique", lambda: subject.validate_config(config))


    def test_cidr_to_ipv4_match(self):
        cidr_to_ipv4_dict = {
            "0.0.0.0/1": "0-127.*.*.*",
            "0.0.0.0/2": "0-63.*.*.*",
            "0.0.0.0/3": "0-31.*.*.*",
            "0.0.0.0/4": "0-15.*.*.*",
            "0.0.0.0/5": "0-7.*.*.*",
            "0.0.0.0/6": "0-3.*.*.*",
            "0.0.0.0/7": "0-1.*.*.*",
            "0.0.0.0/8": "0.*.*.*",
            "0.0.0.0/9": "0.0-127.*.*",
            "0.0.0.0/10": "0.0-63.*.*",
            "0.0.0.0/11": "0.0-31.*.*",
            "0.0.0.0/12": "0.0-15.*.*",
            "0.0.0.0/13": "0.0-7.*.*",
            "0.0.0.0/14": "0.0-3.*.*",
            "0.0.0.0/15": "0.0-1.*.*",
            "0.0.0.0/16": "0.0.*.*",
            "0.0.0.0/17": "0.0.0-127.*",
            "0.0.0.0/18": "0.0.0-63.*",
            "0.0.0.0/19": "0.0.0-31.*",
            "0.0.0.0/20": "0.0.0-15.*",
            "0.0.0.0/21": "0.0.0-7.*",
            "0.0.0.0/22": "0.0.0-3.*",
            "0.0.0.0/23": "0.0.0-1.*",
            "0.0.0.0/24": "0.0.0.*"
        }
        for cidr, ipv4 in cidr_to_ipv4_dict.items():
            self.assertEqual(subject.cidr_to_ipv4_match(cidr), ipv4)


class TestConfigureIdentityRegistrationSettingsCRUD(unittest.TestCase):
    def setUp(self):
        self.dl_secrets = Mock()

        # All these tests are set up to already have these identity registration settings applied
        self.prior_rfdk_reg_settings_json = [ RFDK_REG_SETTING_JSON_1, RFDK_REG_SETTING_JSON_2 ]
        self.prior_rfdk_reg_settings = [
            RFDK_REG_SETTING_1, # Uses subnet_id="subnet-aaaaaaa"
            RFDK_REG_SETTING_2 # Uses subnet_id="subnet-bbbbbbb"
        ]


    def test_get(self):
        '''
        Makes sure that a call to `get_rfdk_registration_settings` returns all the currently applied identity
        registration settings that were created by RFDK and excludes the non-RFDK setting
        '''
        # GIVEN
        configured_reg_settings = self.prior_rfdk_reg_settings_json.copy()
        configured_reg_settings.append(NON_RFDK_REG_SETTING_JSON)
        self.dl_secrets.run_json = MagicMock(return_value=configured_reg_settings)

        # WHEN
        rfdk_managed_settings = subject.get_rfdk_registration_settings(self.dl_secrets)

        # THEN
        self.dl_secrets.run_json.assert_called_once_with('GetLoadBalancerIdentityRegistrationSettings')
        self.assertListEqual(
            rfdk_managed_settings,
            self.prior_rfdk_reg_settings
        )


    def test_create(self):
        '''
        Calls `create_and_update_settings` a connection subnet ID that's used in one of the current registration
        settings and a source subnet ID that is used in a different registration setting. Since the two subnets aren't
        used together in a registration setting, a new one should be created.
        '''
        # GIVEN
        connection_subnet_ids = [
            "subnet-aaaaaaa" # Used by REG_SETTING_RFDK_1
        ]
        source_subnets = [
            subject.SourceSubnet(subnet_id="subnet-2222222", role="Client", registration_status="Registered"), # Used by REG_SETTING_RFDK_2,
        ]
        subnet_to_cidr = {
            "subnet-aaaaaaa": "111.111.0.0/16", # "111.111.*.*" Used by REG_SETTING_RFDK_1
            "subnet-2222222": "3.3.0.0/18", # "3.3.0-63.*" # Used by REG_SETTING_RFDK_2
        }

        # WHEN
        subject.create_and_update_settings(self.dl_secrets, self.prior_rfdk_reg_settings, connection_subnet_ids, source_subnets, subnet_to_cidr)

        # THEN
        expected = subject.LoadBalancerIdentityRegistrationSetting(
            connection_ip_filter_type="IPv4Match",
            connection_ip_filter_value=subject.cidr_to_ipv4_match(subnet_to_cidr[connection_subnet_ids[0]]),
            source_ip_filter_type="IPv4Match",
            source_ip_filter_value=subject.cidr_to_ipv4_match(subnet_to_cidr[source_subnets[0].subnet_id]),
            settings_id="", # Ignored
            settings_name=f"RfdkSubnet|{connection_subnet_ids[0]}|{source_subnets[0].subnet_id}",
            is_enabled=True,
            default_status=source_subnets[0].registration_status,
            default_role=source_subnets[0].role
        )

        self.dl_secrets.run_str.assert_called_once_with(
            "CreateLoadBalancerIdentityRegistrationSetting",
            expected.settings_name,
            expected.connection_ip_filter_type,
            expected.connection_ip_filter_value,
            expected.source_ip_filter_type,
            expected.source_ip_filter_value,
            expected.default_role,
            expected.default_status,
            str(expected.is_enabled),
        )


    def test_update(self):
        '''
        Calls `create_and_update_settings` with a connection subnet and source subnet that are currently used
        in an applied registration setting, but the role and registration status are different, so the existing
        registration setting should be updated.
        '''
        # GIVEN
        connection_subnet_ids = [
            "subnet-aaaaaaa" # Used by REG_SETTING_RFDK_1
        ]
        source_subnets = [
            subject.SourceSubnet(subnet_id="subnet-1111111", role="Server", registration_status="Pending"), # ID ised by REG_SETTING_RFDK_1,
        ]
        subnet_to_cidr = {
            "subnet-aaaaaaa": "111.111.0.0/16", # "111.111.*.*" Used by REG_SETTING_RFDK_1
            "subnet-1111111": "123.123.123.0/24", # "123.123.123.*" # Used by REG_SETTING_RFDK_1
        }

        # WHEN
        subject.create_and_update_settings(self.dl_secrets, self.prior_rfdk_reg_settings, connection_subnet_ids, source_subnets, subnet_to_cidr)

        # THEN
        expected = subject.LoadBalancerIdentityRegistrationSetting(
            # We expect RFDK_REG_SETTING_1 to be updated
            settings_id=RFDK_REG_SETTING_1.settings_id,
            connection_ip_filter_type=RFDK_REG_SETTING_1.connection_ip_filter_type,
            connection_ip_filter_value=subject.cidr_to_ipv4_match(subnet_to_cidr[connection_subnet_ids[0]]),
            source_ip_filter_type=RFDK_REG_SETTING_1.source_ip_filter_type,
            source_ip_filter_value=subject.cidr_to_ipv4_match(subnet_to_cidr[source_subnets[0].subnet_id]),
            settings_name=RFDK_REG_SETTING_1.settings_name,
            is_enabled=True,
            default_status="Pending",
            default_role="Server"
        )

        self.dl_secrets.run_str.assert_called_once_with(
            "UpdateLoadBalancerIdentityRegistrationSetting",
            expected.settings_id,
            expected.settings_name,
            expected.connection_ip_filter_type,
            expected.connection_ip_filter_value,
            expected.source_ip_filter_type,
            expected.source_ip_filter_value,
            expected.default_role,
            expected.default_status,
            str(expected.is_enabled),
        )


    def test_create_multiple(self):
        # GIVEN
        connection_subnet_ids = [
            "subnet-ccccccc",
            "subnet-ddddddd"
        ]
        source_subnets = [
            subject.SourceSubnet(subnet_id="subnet-3333333", role="Client", registration_status="Registered"),
            subject.SourceSubnet(subnet_id="subnet-4444444", role="Client", registration_status="Registered"),
        ]
        subnet_to_cidr = {
            "subnet-ccccccc": "10.10.0.0/16", # 10.10.*.*
            "subnet-ddddddd": "11.11.0.0/16", # 11.11.*.*
            "subnet-3333333": "96.0.0.0/5", # 96-103.*.*.*
            "subnet-4444444": "104.0.0.0/22", # 104.0.0-3.*
        }

        # WHEN
        subject.create_and_update_settings(self.dl_secrets, [], connection_subnet_ids, source_subnets, subnet_to_cidr)

        # THEN
        for connection_subnet_id in connection_subnet_ids:
            for source_subnet in source_subnets:
                expected = subject.LoadBalancerIdentityRegistrationSetting(
                    connection_ip_filter_type  = "IPv4Match",
                    connection_ip_filter_value = subject.cidr_to_ipv4_match(subnet_to_cidr[connection_subnet_id]),
                    source_ip_filter_type      = "IPv4Match",
                    source_ip_filter_value     = subject.cidr_to_ipv4_match(subnet_to_cidr[source_subnet.subnet_id]),
                    settings_id                = '', # Unused
                    settings_name              = f"RfdkSubnet|{connection_subnet_id}|{source_subnet.subnet_id}",
                    is_enabled                 = True,
                    default_status             = source_subnet.registration_status,
                    default_role               = source_subnet.role
                )
                self.dl_secrets.run_str.assert_any_call(
                    "CreateLoadBalancerIdentityRegistrationSetting",
                    expected.settings_name,
                    expected.connection_ip_filter_type,
                    expected.connection_ip_filter_value,
                    expected.source_ip_filter_type,
                    expected.source_ip_filter_value,
                    expected.default_role,
                    expected.default_status,
                    str(expected.is_enabled)
                )


    def test_create_and_update_no_connection_subnets(self):
        '''
        Calls `create_and_update_settings` with no connection subnet ID's, so no registration settings should be created or updated
        '''
        # GIVEN
        connection_subnet_ids = []
        source_subnets = [
            subject.SourceSubnet(subnet_id="subnet-2222222", role="Client", registration_status="Registered"), # Used by REG_SETTING_RFDK_2
        ]
        subnet_to_cidr = {
            "subnet-2222222": "3.3.0.0/18", # "3.3.0-63.*" # Used by REG_SETTING_RFDK_2
        }

        # WHEN
        subject.create_and_update_settings(self.dl_secrets, self.prior_rfdk_reg_settings, connection_subnet_ids, source_subnets, subnet_to_cidr)

        # THEN
        self.dl_secrets.run_str.assert_not_called()


    def test_create_and_update_no_source_subnets(self):
        '''
        Calls `create_and_update_settings` with no source subnet ID's, so no registration settings should be created or updated
        '''
        # GIVEN
        connection_subnet_ids = [
            "subnet-aaaaaaa"
        ]
        source_subnets = []
        subnet_to_cidr = {
            "subnet-aaaaaaa": "111.111.0.0/16",
        }

        # WHEN
        subject.create_and_update_settings(self.dl_secrets, self.prior_rfdk_reg_settings, connection_subnet_ids, source_subnets, subnet_to_cidr)

        # THEN
        self.dl_secrets.run_str.assert_not_called()


    def test_create_and_update_no_changes(self):
        '''
        Calls `create_and_update_settings` with a connection subnet and source subnet that are currently used
        in an applied registration setting, with the same role and registration status, so the existing
        registration setting shouldn't be changed..
        '''
        # GIVEN
        connection_subnet_ids = [
            "subnet-aaaaaaa" # Used by REG_SETTING_RFDK_1
        ]
        source_subnets = [
            subject.SourceSubnet(subnet_id="subnet-1111111", role="Client", registration_status="Registered"), # ID ised by REG_SETTING_RFDK_1,
        ]
        subnet_to_cidr = {
            "subnet-aaaaaaa": "111.111.0.0/16", # "111.111.*.*" Used by REG_SETTING_RFDK_1
            "subnet-1111111": "123.123.123.0/24", # "123.123.123.*" # Used by REG_SETTING_RFDK_1
        }

        # WHEN
        subject.create_and_update_settings(self.dl_secrets, self.prior_rfdk_reg_settings, connection_subnet_ids, source_subnets, subnet_to_cidr)

        # THEN
        self.dl_secrets.run_str.assert_not_called()


    def test_delete_removed_settings(self):
        '''
        Calls `delete_removed_settings` with connection subnets that are used by `REG_SETTING_RFDK_1` and `REG_SETTING_RFDK_2`,
        but only the source subnet for `REG_SETTING_RFDK_1` is added. Since the source subnet for `REG_SETTING_RFDK_2` is
        missing, we expect `REG_SETTING_RFDK_2` to be deleted.
        '''
        # GIVEN
        self.dl_secrets.run_str = Mock(return_value="Pass")
        connection_subnet_ids = [
            "subnet-aaaaaaa", # Used by REG_SETTING_RFDK_1
            "subnet-bbbbbbb", # Used by REG_SETTING_RFDK_2
            "subnet-ccccccc"
        ]
        source_subnets = [
            subject.SourceSubnet(subnet_id="subnet-1111111", role="Client", registration_status="Registered"), # Used by REG_SETTING_RFDK_1
            subject.SourceSubnet(subnet_id="subnet-1234567", role="Server", registration_status="Pending")
        ]

        # WHEN
        subject.delete_removed_settings(self.dl_secrets, self.prior_rfdk_reg_settings, connection_subnet_ids, source_subnets)

        # THEN
        self.dl_secrets.run_str.assert_called_once_with(
            'DeleteLoadBalancerIdentityRegistrationSetting',
            RFDK_REG_SETTING_JSON_2["SettingsId"]
        )


    def test_delete_no_removed_settings(self):
        '''
        Calls `delete_removed_settings` with the connection and source subnets used by `REG_SETTING_RFDK_1` and `REG_SETTING_RFDK_2`.
        Since both previously configured settings still exist, nothing should be deleted.
        '''
        # GIVEN
        self.dl_secrets.run_str = Mock(return_value="Pass")
        connection_subnet_ids = [
            "subnet-aaaaaaa", # Used by REG_SETTING_RFDK_1
            "subnet-bbbbbbb", # Used by REG_SETTING_RFDK_2
            "subnet-ccccccc"
        ]
        source_subnets = [
            subject.SourceSubnet(subnet_id="subnet-1111111", role="Client", registration_status="Registered"), # Used by REG_SETTING_RFDK_1
            subject.SourceSubnet(subnet_id="subnet-2222222", role="Client", registration_status="Registered"), # Used by REG_SETTING_RFDK_2
            subject.SourceSubnet(subnet_id="subnet-1234567", role="Server", registration_status="Pending")
        ]

        # WHEN
        subject.delete_removed_settings(self.dl_secrets, self.prior_rfdk_reg_settings, connection_subnet_ids, source_subnets)

        # THEN
        self.dl_secrets.run_str.assert_not_called()


class TestAwsInteraction(unittest.TestCase):
    def test_aws_cli_success(self):
        """
        Tests that the aws_cli function creates a subprocess using the supplied arguments, decodes the JSON output and
        returns the result.
        """
        # GIVEN
        args = ['foo', 'bar']
        expected = { "foo": 1 }
        return_val = json.dumps(expected)

        with patch.object(subject.subprocess, 'check_output', return_value=return_val) as check_output_mock:
            # WHEN
            result = subject.aws_cli(args)
        
            # THEN
            check_output_mock.assert_called_once_with(['aws'] + args, text=True)
            self.assertDictEqual(expected, result)

    def test_aws_cli_error(self):
        """
        Tests that when the subprocess fails with a non-zero exit code, that the aws_cli function raises a user-friendly
        error message that includes the exit code, standard output contents, and standard error contents.
        """
        # GIVEN
        args = ['foo', 'bar']
        exception = subprocess.CalledProcessError(
            cmd=['aws'] + args,
            output='output',
            stderr='stderr',
            returncode=-1
        )

        with patch.object(subject.subprocess, 'check_output', side_effect=exception) as check_output_mock:
            # THEN
            with self.assertRaises(Exception, msg=f'failed to call AWS CLI ({exception.returncode}): \n{exception.output}\n\n{exception.stderr}') as raise_assertion:
                # WHEN
                subject.aws_cli(args)

            # Assert that the exception thrown from subprocess.check_output is chained to the thrown exception
            chained_exception = raise_assertion.exception.__cause__
            self.assertIs(chained_exception, exception)

            # Assert that subprocess.check_output was called with the supplied arguments
            check_output_mock.assert_called_once_with(['aws'] + args, text=True)

    def test_aws_cli_non_json(self):
        """
        Tests that when the AWS CLI subprocess returns output that is not valid JSON, that aws_cli raises a new
        exception with a more user-friendly error message.
        """
        # GIVEN
        args = ['foo', 'bar']
        aws_cli_output = 'not valid JSON'

        with patch.object(subject.subprocess, 'check_output', return_value=aws_cli_output):
            # THEN
            with self.assertRaises(Exception) as raises_assertion:
                # WHEN
                subject.aws_cli(args)

            msg = raises_assertion.exception.args[0]

            # Assert that the exception thrown has a chained JSONDecodeError exception
            chained_exception = raises_assertion.exception.__cause__
            self.assertIsInstance(chained_exception, json.JSONDecodeError)
            json_exception_msg = chained_exception.msg

            self.assertRegexpMatches(msg, f'^AWS CLI did not output JSON as expected \\({re.escape(json_exception_msg)}\\). Output was:\n{re.escape(aws_cli_output)}')

    def test_fetch_secret(self):
        """
        Tests that the fetch_secret function calls the aws_cli function with expected arguments, and returns the
        contents of the "SecretString" field of the returned JSON object.
        """
        # GIVEN
        arn = 'arn'
        region = 'region'
        secret_string = 'abc'
        secret = {
            "SecretString": secret_string
        }
        with patch.object(subject, 'aws_cli', return_value=secret) as mock_aws_cli:
            # WHEN
            result = subject.fetch_secret(subject.AwsSecret(
                arn='arn',
                region='region'
            ))

            # THEN
            self.assertEqual(secret_string, result)
            mock_aws_cli.assert_called_with([
                'secretsmanager',
                '--region', region,
                'get-secret-value',
                '--secret-id', arn
            ])

    def test_get_subnet_cidrs(self):
        """
        Tests that the get_subnet_cidrs function calls the aws_cli function with expected arguments, and transforms the
        JSON output into the expected subnet ID -> subnet CIDR mapping
        """

        # GIVEN
        subnet_id_1 = 'aaa'
        subnet_id_2 = 'bbb'
        subnet_ids = [subnet_id_1, subnet_id_2]
        subnets = [
            {
                'SubnetId': subnet_id_1,
                'CidrBlock': '1.2.3.4'
            },
            {
                'SubnetId': subnet_id_2,
                'CidrBlock': '2.3.4.5'
            }
        ]
        aws_cli_result = {
            'Subnets': subnets
        }
        expected_mapping = {
            entry['SubnetId']: entry['CidrBlock']
            for entry in subnets
        }
        region = 'region'
        with patch.object(subject, 'aws_cli', return_value=aws_cli_result) as mock_aws_cli:
            # WHEN
            result = subject.get_subnet_cidrs(region, subnet_ids)

            # THEN
            self.assertEqual(result, expected_mapping)
            mock_aws_cli.assert_called_with([
                '--region', region,
                'ec2',
                'describe-subnets',
                '--filters',
                f'Name=subnet-id,Values={",".join(subnet_ids)}'
            ])


if __name__ == '__main__':
    unittest.main()
