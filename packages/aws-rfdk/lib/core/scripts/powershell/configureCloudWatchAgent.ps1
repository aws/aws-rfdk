# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script downloads, installs and configures the cloudwatch agent. Must be run as sudo capable user.
# Arguments:
# $1: The region this script is running in
# $2: SSM parameter name
# [Switch] s: Skips the verification of the CloudWatch agent installer
# [Switch] i: Attempts to install the CloudWatch agent

param (
  [Parameter(Mandatory=$True)] $region,
  [Parameter(Mandatory=$True)] $ssmParameterName,

  # These parameter names intentionally do not follow the standard PascalCase style used in Powershell
  # so that in our Typescript code, we can pass the same flag regardless of the script being called
  [switch] $i = $False,
  [switch] $s = $False
)


function Install-CloudWatchAgent($region) {
  try {
    # If this command doesn't throw an error, we have the CloudWatch agent installed already
    $status = & $Env:ProgramFiles\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1 -m ec2 -a status
    Write-Output "Found CloudWatch agent already installed, skipping installation."
    return
  } catch {
    Write-Output "CloudWatch agent is not already installed, proceeding with installation."
  }

  $cwa_installer = "$env:temp\amazon-cloudwatch-agent.msi"
  try {
    Read-S3Object -BucketName amazoncloudwatch-agent-$region -Key windows/amd64/latest/amazon-cloudwatch-agent.msi -File $cwa_installer -Region $region
  } catch {
    Write-Output "Failed to download CloudWatch agent installer."
    return
  }

  $cwa_installer_sig = "$env:temp\amazon-cloudwatch-agent.msi.sig"
  try {
    Read-S3Object -BucketName amazoncloudwatch-agent-$region -Key windows/amd64/latest/amazon-cloudwatch-agent.msi.sig -File $cwa_installer_sig -Region $region
  } catch {
    Write-Output "Failed to download CloudWatch agent installer signature file."
    Remove-Item -Path $cwa_installer -Force
    return
  }

  if (-Not $s) {
    $gpg_keyring = "$env:temp\keyring.gpg"

    # Download GPG
    $gpg_installer = "$env:temp\gnupg-w32-2.2.27_20210111.exe"
    try {
      Read-S3Object -BucketName rfdk-external-dependencies-$region -Key gnupg-w32-2.2.27_20210111.exe -File $gpg_installer -Region $region
    } catch {
      Write-Output "Failed downloading GPG to verify CloudWatch agent."
      Remove-Item -Path $cwa_installer -Force
      Remove-Item -Path $cwa_installer_sig -Force
      return
    }

    # Verify GPG
    $gpg_sig = Get-AuthenticodeSignature $gpg_installer
    $status = $gpg_sig | Select-Object -ExpandProperty 'Status'
    if ( $status -ne 'Valid' ) {
      Write-Output "GPG installer does not have a valid signature."
      Remove-Item -Path $cwa_installer -Force
      Remove-Item -Path $cwa_installer_sig -Force
      Remove-Item -Path $gpg_installer -Force
      return
    }

    $sha256_expected = '5D89E239790822711EAE2899467A764879D21440AB68E9413452FA96CEDEBA50'
    $sha256 = Get-FileHash $gpg_installer -Algorithm SHA256
    if ( $sha256 -inotmatch $sha256_expected) {
      Write-Output "GPG failed checksum verification. Expected sha256 to equal $sha256_expected but got:"
      Write-Output $sha256
      Remove-Item -Path $cwa_installer -Force
      Remove-Item -Path $cwa_installer_sig -Force
      Remove-Item -Path $gpg_installer -Force
      return
    }

    # Install GPG
    Start-Process -Wait -FilePath $gpg_installer -ArgumentList "/S /v/qn" -PassThru

    # Refresh the PATH so gpg is available
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")

    # Download Amazon's public key and import it to GPG's keyring
    $cloudwatch_pub_key = "$env:temp\amazon-cloudwatch-agent.gpg"

    try {
      Read-S3Object -BucketName amazoncloudwatch-agent-$region -Key assets/amazon-cloudwatch-agent.gpg -File $cloudwatch_pub_key -Region $region
    } catch {
      Write-Output "Failed to download CloudWatch's GPG key."
      Remove-Item -Path $cwa_installer -Force
      Remove-Item -Path $cwa_installer_sig -Force
      Remove-Item -Path $gpg_installer -Force
      return
    }

    gpg --no-default-keyring --keyring $gpg_keyring --import $cloudwatch_pub_key

    # Verify that the imported key has the correct fingerprint
    $fingerprint = '937616F3450B7D806CBD9725D58167303B789C72'
    $keys = gpg --no-default-keyring --keyring $gpg_keyring -k
    $keys = ($keys | Out-String).Trim() -replace "\r", "" -replace "\n", "" -replace "\[", "" -replace "\]", ""

    if ($keys -inotlike "*$fingerprint*") {
      Write-Output "Expected CloudWatch agent's public key to equal $fingerprint but got:"
      Get-Content $keys
      Remove-Item -Path $cwa_installer -Force
      Remove-Item -Path $cwa_installer_sig -Force
      Remove-Item -Path $gpg_installer -Force
      Remove-Item -Path $cloudwatch_pub_key -Force
      Remove-Item -Path $gpg_keyring -Force
      return
    }

    # Now that we have the public key on the keyring, we can use gpg to perform the verification of the installer with the signature file.
    # We will write the output to file and then perform a text search to make sure there's a good signature present in it
    $gpg_output = "$env:temp\gpg_out.txt"
    Start-Process gpg -ArgumentList " --no-default-keyring --keyring $gpg_keyring --verify $cwa_installer_sig $cwa_installer" `
    -wait -NoNewWindow -PassThru -RedirectStandardError $gpg_output

    $verification = Select-String -Path $gpg_output -Pattern 'Good signature from "Amazon CloudWatch Agent"' | Select-Object -ExpandProperty Matches -First 1
    if (-Not $verification) {
      Write-Output "Could not verify CloudWatch agent's signature file with GPG."
      Get-Content $gpg_output
      Remove-Item -Path $cwa_installer -Force
      Remove-Item -Path $cwa_installer_sig -Force
      Remove-Item -Path $gpg_installer -Force
      Remove-Item -Path $cloudwatch_pub_key -Force
      Remove-Item -Path $gpg_keyring -Force
      Remove-Item -Path $gpg_output -Force
      return
    }

    return
  }

  # Install the agent
  Start-Process "msiexec.exe" -ArgumentList "/i $cwa_installer /qn /norestart" -Wait -Passthru -NoNewWindow

  Remove-Item -Path $cwa_installer -Force
  Remove-Item -Path $cwa_installer_sig -Force
  Remove-Item -Path $gpg_installer -Force
  Remove-Item -Path $cloudwatch_pub_key -Force
  Remove-Item -Path $gpg_keyring -Force
  Remove-Item -Path $gpg_output -Force
}


Write-Output "Starting CloudWatch installation and configuration script."

if ($i) {
  Install-CloudWatchAgent $region
} else {
  Write-Output "Skipped installation of CloudWatch agent"
}

try  {
  # Configure the agent from an ssm parameter-store parameter.
  & 'C:/Program Files/Amazon/AmazonCloudWatchAgent/amazon-cloudwatch-agent-ctl.ps1' -a append-config -m ec2 -c ssm:$ssmParameterName -s
} catch {
  Write-Output "Failed attempt to configure the CloudWatch agent"
}

Write-Output "CloudWatch agent script has completed successfully"
