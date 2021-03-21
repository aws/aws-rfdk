# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

param (
    [Parameter(Mandatory=$True)]
    $workerGroups,
    [Parameter(Mandatory=$True)]
    $workerPools,
    [Parameter(Mandatory=$True)]
    $workerRegion,
    [Parameter(Mandatory=$True)]
    $minimumSupportedDeadlineVersion,
    [Parameter(Mandatory=$True)]
    $workerListeningPort,
    [Parameter(Mandatory=$True)]
    $workerListeningPortConfigScript
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

# launch worker at launcher startup
& $DEADLINE_COMMAND -SetIniFileSetting LaunchSlaveAtStartup True | Out-Default
# keep worker running
& $DEADLINE_COMMAND -SetIniFileSetting KeepWorkerRunning True | Out-Default
# restart stalled worker
& $DEADLINE_COMMAND -SetIniFileSetting RestartStalledSlave True | Out-Default
# auto update
& $DEADLINE_COMMAND -SetIniFileSetting AutoUpdateOverride False | Out-Default
# Disable S3Backed Cache
& $DEADLINE_COMMAND -SetIniFileSetting UseS3BackedCache False | Out-Default
# Blank the S3BackedCache Url
& $DEADLINE_COMMAND -SetIniFileSetting S3BackedCacheUrl "" | Out-Default

# setting the group, pool and region for this worker
if (![string]::IsNullOrEmpty($workerRegion)) {
    & $DEADLINE_COMMAND -SetIniFileSetting Region $workerRegion | Out-Default
}

$WORKER_NAME_PREFIX=$env:COMPUTERNAME

# Fetching all workers in this node
$WORKER_NAMES = @()
Get-ChildItem $env:PROGRAMDATA"\Thinkbox\Deadline10\slaves" -Filter *.ini |
Foreach-Object {
    $workerConfigName=([io.path]::GetFileNameWithoutExtension($_.FullName))
    if([string]::IsNullOrEmpty($workerConfigName)) {
        $WORKER_NAMES+=$WORKER_NAME_PREFIX
    } else {
        $WORKER_NAMES+="$WORKER_NAME_PREFIX-$workerConfigName"
    }
}
if ( $WORKER_NAMES.count -eq 0 )
{
    $WORKER_NAMES+=$WORKER_NAME_PREFIX
}

$WORKER_NAMES_CSV=$WORKER_NAMES -join ","

# Setting Groups for all workers in this node
$WORKER_GROUPS=$workerGroups.Split(",")
if($WORKER_GROUPS) {
    foreach ($group in $WORKER_GROUPS) {
        $existingGroups= (& $DEADLINE_COMMAND -GetGroupNames | Out-String).Split([Environment]::NewLine)
        if($group -notin $existingGroups) {
            & $DEADLINE_COMMAND -AddGroup $group | Out-Default
        }
    }
    & $DEADLINE_COMMAND -SetGroupsForSlave $WORKER_NAMES_CSV $workerGroups | Out-Default
}

# Setting Pools for all workers in this node
$WORKER_POOLS=$workerPools.Split(",")
if($WORKER_POOLS) {
    foreach ($pool in $WORKER_POOLS) {
        $existingPools= (& $DEADLINE_COMMAND -GetPoolNames | Out-String).Split([Environment]::NewLine)
        if($pool -notin $existingPools) {
            & $DEADLINE_COMMAND -AddPool $pool | Out-Default
        }
    }
    & $DEADLINE_COMMAND -SetPoolsForSlave $WORKER_NAMES_CSV $workerPools | Out-Default
}

# Setting listening port for the workers on this node (we cannot have multiple workers listening on the same port)
[int]$portOffset=0
if ($WORKER_NAMES) {
    foreach ($workerName in $WORKER_NAMES) {
        $currentPort=([int]$workerListeningPort + $portOffset)

        & $DEADLINE_COMMAND -ExecuteScriptNoGui "$workerListeningPortConfigScript" -n $workerName -p $currentPort | Out-Default
        & netsh advfirewall firewall add rule name="Worker Log Listening" dir=in action=allow protocol=TCP localport=$currentPort | Out-Default

        $portOffset++
    }
}

$serviceName="deadline10launcherservice"
If (Get-Service $serviceName -ErrorAction SilentlyContinue) {
    Stop-Service $serviceName
    taskkill /f /fi "IMAGENAME eq deadlineworker.exe"
    Start-Service $serviceName
} Else {
    $DEADLINE_LAUNCHER = $DEADLINE_PATH + '/deadlinelauncher.exe'
    & $DEADLINE_LAUNCHER -shutdownall | Out-Default
    taskkill /f /fi "IMAGENAME eq deadlineworker.exe"
    & $DEADLINE_LAUNCHER -nogui
}

Write-Host "Script completed successfully."
