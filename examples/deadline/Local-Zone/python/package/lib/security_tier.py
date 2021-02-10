# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from aws_cdk.core import (
    Construct,
    Stack,
)
from aws_rfdk import (
    DistinguishedName,
    X509CertificatePem
)


class SecurityTier(Stack):
    """
    The security tier of the render farm.
    This stack contains resources used to ensure the render farm is secure.
    """
    def __init__(self, scope: Construct, stack_id: str, **kwargs):
        """
        Initialize a new instance of ServiceTier
        :param scope: The scope of this construct.
        :param stack_id: The ID of this construct.
        :param props: The properties for this construct.
        :param kwargs: Any kwargs that need to be passed on to the parent class.
        """
        super().__init__(scope, stack_id, **kwargs)

        # Our self-signed root CA certificate for the internal endpoints in the farm.
        self.root_ca = X509CertificatePem(
            self,
            'RootCA',
            subject=DistinguishedName(
                cn='SampleRootCA'
            )
        )
