# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script downloads, installs and configures the cloudwatch agent. Must be run as sudo capable user.
# Arguments:
# $1: SSM parameter name
# [Switch] s: Skips the verification of the cloudwatch agent installer

param (
    [Parameter(Mandatory=$True)] $ssmParameterName,

    # This parameter name intentionally does not follow the standard PascalCase style used in Powershell
    # so that in our Typescript code, we can pass the same flag regardless of the script being called
    [switch] $s = $False
)

$ErrorActionPreference = "Stop"

$file = "$env:temp\amazon-cloudwatch-agent.msi"

# We hardcode the version number here since the verification below is tightly coupled with this specific version
try {
  Read-S3Object -BucketName amazoncloudwatch-agent -Key windows/amd64/1.242486.0/amazon-cloudwatch-agent.msi -File $file -Region us-east-1
} catch {
  # Fallback to the latest version (this is the case when the above version is currently "latest")
  Write-Output "Initial attempt to download Amazon CloudWatch agent failed. Falling back to the latest version."
  try {
    Read-S3Object -BucketName amazoncloudwatch-agent -Key windows/amd64/latest/amazon-cloudwatch-agent.msi -File $file -Region us-east-1
  } catch {
    Write-Output "Failed to download CloudWatchAgent installer."
    Exit 1
  }
}

# The below verification is tied to the version of the msi installer
# If the installer version changes, the below verification could break and should be updated accordingly.
# See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/verify-CloudWatch-Agent-Package-Signature.html
if (-Not $s) {
  $sig = Get-AuthenticodeSignature $file
  $status = $sig | Select-Object -ExpandProperty 'Status'
  if ( $status -ne 'Valid' ) {
    Write-Output "CloudWatchAgent installer does not have a valid signature."
    Exit 1
  }

  # CA Certificate is:
  #  - Subject: CN=DigiCert Timestamp Responder, O=DigiCert, C=US
  #  - Valid: [Not After] 10/21/2024 7:00:00 PM
  #  - Thumbprint: 614D271D9102E30169822487FDE5DE00A352B01D
  $ca = $sig | Select-Object -ExpandProperty 'TimeStamperCertificate'
  $ca_thumbprint = $ca | Select-Object -ExpandProperty 'Thumbprint'
  if ( $ca_thumbprint -ne '614D271D9102E30169822487FDE5DE00A352B01D' ) {
    Write-Output "CA Thumbprint failed verification. Has the CA certificate been changed? If so, then please submit a PR to fix this."
    Write-Output $( $ca | Format-List )
    Exit 1
  }

  # Amazon.com certificate is:
  #  - Subject: 'CN=Amazon.com Services LLC, OU=Software Services, O=Amazon.com Services LLC, L=Seattle, S=Washington, C=US'
  #  We do not check the Thumbprint because it will change when the certificate is rotated. This seems to be yearly.
  $cert = $sig | Select-Object -ExpandProperty 'SignerCertificate'
  $cert_subject = $cert | Select-Object -ExpandProperty 'Subject'
  if ( $cert_subject -ne 'CN=Amazon.com Services LLC, OU=Software Services, O=Amazon.com Services LLC, L=Seattle, S=Washington, C=US' ) {
    Write-Output "Amazon.com is not the issuer of this installer. If this is the correct then please submit a PR to fix this."
    Write-Output $( $cert | Format-List )
    Exit 1
  }
}

# Install the agent
Start-Process "msiexec.exe" -ArgumentList "/i $env:temp\amazon-cloudwatch-agent.msi /qn /norestart" -Wait -Passthru -NoNewWindow

# Configure the agent from an ssm parameter-store parameter.
& 'C:/Program Files/Amazon/AmazonCloudWatchAgent/amazon-cloudwatch-agent-ctl.ps1' -a append-config -m ec2 -c ssm:$ssmParameterName -s

Remove-Item -Path $file -Force
Write-Output "CloudWatchAgent has been successfully installed and configured"
