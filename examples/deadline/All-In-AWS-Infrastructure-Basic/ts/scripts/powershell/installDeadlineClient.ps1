# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

param (
    [Parameter(Mandatory=$True)]
    $region,
    [Parameter(Mandatory=$True)]
    $deadlineInstallerBucketName,
    [Parameter(Mandatory=$True)]
    $deadlineInstallerObjectName
)

Set-PSDebug -Trace 1

$ErrorActionPreference = "Stop"

$deadlineInstaller = "$env:temp\$deadlineInstallerObjectName"
Read-S3Object -BucketName $deadlineInstallerBucketName -Key $deadlineInstallerObjectName -File $deadlineInstaller -Region $region

$installerArgs = "--mode unattended --licensemode UsageBased  --connectiontype Remote --noguimode true --slavestartup false --restartstalled true --launcherservice true --serviceuser `"NT AUTHORITY\NetworkService`" --autoupdateoverride false"

Start-Process -FilePath $deadlineInstaller -ArgumentList $installerArgs -Wait

if (-not (net localgroup administrators | Select-String "^NT AUTHORITY\\NETWORK SERVICE$" -Quiet)) {
    net localgroup administrators /add "NT AUTHORITY\NETWORK SERVICE"
}

foreach($level in "Machine","User") {
    [Environment]::GetEnvironmentVariables($level).GetEnumerator() | % {
        # For Path variables, append the new values, if they're not already in there
        if($_.Name -match 'Path$') {
            $_.Value = ($((Get-Content "Env:$($_.Name)") + ";$($_.Value)") -split ';' | Select -unique) -join ';'
        }
        $_
    } | Set-Content -Path { "Env:$($_.Name)" }
}



$DEADLINE_PATH = [Environment]::GetEnvironmentVariables("Machine")["DEADLINE_PATH"]
if (!(Test-Path $DEADLINE_PATH)) {
    Write-Host "DEADLINE_PATH does not exists. Exiting..."
    exit 1
}
$DEADLINE_COMMAND = $DEADLINE_PATH + '/deadlinecommand.exe'

if (!(Test-Path $DEADLINE_COMMAND)) {
    Write-Host "DeadlineCommand.exe does not exists. Exiting..."
    exit 1
}

# keep worker running
& $DEADLINE_COMMAND -SetIniFileSetting KeepWorkerRunning False | Out-Default
# Disable S3Backed Cache
& $DEADLINE_COMMAND -SetIniFileSetting UseS3BackedCache False | Out-Default
# Blank the S3BackedCache Url
& $DEADLINE_COMMAND -SetIniFileSetting S3BackedCacheUrl "" | Out-Default

Stop-Service -Name "deadline10launcherservice"
taskkill /f /fi "IMAGENAME eq deadlineworker.exe"
Start-Service -Name "deadline10launcherservice"

Write-Host "Script completed successfully."
