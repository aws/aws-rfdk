# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

param (
    [Parameter(Mandatory=$True)]
    $healthCheckPort,
    [Parameter(Mandatory=$True)]
    $minimumSupportedDeadlineVersion
)

Set-PSDebug -Trace 1

$ErrorActionPreference = "Stop"

$DEADLINE_PATH = (get-item env:"DEADLINE_PATH").Value
if (!(Test-Path $DEADLINE_PATH)) {
    Write-Host "DEADLINE_PATH does not exists. Exiting..."
    exit 1
}
$DEADLINE_COMMAND = $DEADLINE_PATH + '/deadlinecommand.exe'

if (!(Test-Path $DEADLINE_COMMAND)) {
    Write-Host "DeadlineCommand.exe does not exists. Exiting..."
    exit 1
}

$DeadlineVersion = (& $DEADLINE_COMMAND -Version | Out-String) | Select-String -Pattern '[v](\d+\.\d+\.\d+\.\d+)\b' | % {$_.Matches.Groups[1].Value}
if ([string]::IsNullOrEmpty($DeadlineVersion)) {
    Write-Host "ERROR: Unable to identify the version of installed Deadline Client. Exiting..."
    exit 1
}

if([System.Version]$DeadlineVersion -lt  [System.Version]$minimumSupportedDeadlineVersion) {
    Write-Host "ERROR: Installed Deadline Version ($($DeadlineVersion)) is less than the minimum supported version ($($minimumSupportedDeadlineVersion)). Exiting..."
    exit 1
}

# enabling the health check port
& $DEADLINE_COMMAND -SetIniFileSetting ResourceTrackerVersion V2 | Out-Default
# health check port
& $DEADLINE_COMMAND -SetIniFileSetting LauncherHealthCheckPort $healthCheckPort | Out-Default
# Adding firewall rule to allow health-checks
& New-NetFirewallRule -DisplayName "Allow Deadline Health-Checks" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $healthCheckPort  | Out-Default


$serviceName="deadline10launcherservice"
If (Get-Service $serviceName -ErrorAction SilentlyContinue) {
    Restart-Service $serviceName
} Else {
    $DEADLINE_LAUNCHER = $DEADLINE_PATH + '/deadlinelauncher.exe'
    & $DEADLINE_LAUNCHER -shutdownall | Out-Default
    & $DEADLINE_LAUNCHER
}

Write-Host "Script completed successfully."
