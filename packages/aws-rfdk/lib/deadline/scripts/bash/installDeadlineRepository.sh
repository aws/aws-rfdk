#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script downloads the deadline repository installer and executes it.
# Arguments:
# $1: s3 path for the deadline repository installer.
# $2: Path where deadline repository needs to be installed.
# $3: Deadline Repository Version being installed.
# $4: (Optional) Deadline Repository settings file to import.

# exit when any command fails
set -xeuo pipefail

S3PATH=$1
PREFIX=$2
DEADLINE_REPOSITORY_VERSION=$3
DEADLINE_REPOSITORY_SETTINGS_FILE=${4:-}
shift;shift;

# check if repository is already installed at the given path
REPOSITORY_FILE_PATH="$PREFIX/settings/repository.ini"
CONNECTION_FILE_PATH="$PREFIX/settings/connection.ini"

# Run the Function that the Database Connection created to set up the installer arguments.
declare -A INSTALLER_DB_ARGS
configure_database_installation_args

if test -f "$REPOSITORY_FILE_PATH"; then
    echo "File $REPOSITORY_FILE_PATH exists. Validating Database Connection"
    # File Exists

    INSTALLER_DB_HOSTNAME=${INSTALLER_DB_ARGS["--dbhost"]}
    INSTALLER_DB_PORT=${INSTALLER_DB_ARGS["--dbport"]}

    # Additionally, vadlidate the DB endpoint.
    source $CONNECTION_FILE_PATH > /dev/null 2>&1 || true
    if [ "$Hostname" != "$INSTALLER_DB_HOSTNAME" ] || [ "$Port" != "$INSTALLER_DB_PORT" ]; then
        echo "ERROR: Repository pre-exists but configured database endpoint($Hostname:$Port) does not match with provided database endpoint($INSTALLER_DB_HOSTNAME:$INSTALLER_DB_PORT)."
        exit 1
    fi
    echo "Database Connection is valid.  Validating Deadline Version."
    
    # Following runs the .ini file as a script while suppressing all the errors. This creates bash variables with
    # the key's name and sets its value to the value specified in .ini file.
    # This is a quick way to read the .ini values but is not a full-proof way. Since we dont have common keys in
    # multiple sections of the config files, this approach will work correctly.
    # The proper way to achieve this is to use a ini config manager tool to get the value of required key.
    source $REPOSITORY_FILE_PATH > /dev/null 2>&1 || true
    if [[ "$Version" = "$DEADLINE_REPOSITORY_VERSION" ]]; then
        echo "Repository version $DEADLINE_REPOSITORY_VERSION already exists at path $REPOSITORY_FILE_PATH. Not proceeding with Repository installation."
        exit 0
    else
        SplitVersion=(${Version//./ })
        SplitRepoVersion=(${DEADLINE_REPOSITORY_VERSION//./ })

        if [[ ${SplitVersion[0]} != ${SplitRepoVersion[0]} ]] || [[ ${SplitVersion[1]} != ${SplitRepoVersion[1]} ]]; then
            echo "ERROR: Repository pre-exists but configured Repository Version (${Version}) has a different Major or Minor Version than the provided installer (${DEADLINE_REPOSITORY_VERSION})."
            exit 1
        fi
    fi
fi

REPO_INSTALLER=/tmp/repo_installer.run

aws s3 cp $S3PATH $REPO_INSTALLER
chmod +x $REPO_INSTALLER

set +x

INSTALLER_DB_ARGS_STRING=''
for key in "${!INSTALLER_DB_ARGS[@]}"; do INSTALLER_DB_ARGS_STRING=$INSTALLER_DB_ARGS_STRING"${key} ${INSTALLER_DB_ARGS[$key]} "; done

REPOSITORY_SETTINGS_ARG_STRING=''
if [ ! -z "$DEADLINE_REPOSITORY_SETTINGS_FILE" ]; then
  if [ ! -f "$DEADLINE_REPOSITORY_SETTINGS_FILE" ]; then
    echo "WARNING: Repository settings file was specified but is not a file: $DEADLINE_REPOSITORY_SETTINGS_FILE. Repository settings will not be imported."
  else
    REPOSITORY_SETTINGS_ARG_STRING="--importrepositorysettings true --repositorysettingsimportoperation append --repositorysettingsimportfile \"$DEADLINE_REPOSITORY_SETTINGS_FILE\""
  fi
fi

$REPO_INSTALLER --mode unattended --setpermissions false --prefix "$PREFIX" --installmongodb false --backuprepo false ${INSTALLER_DB_ARGS_STRING} $REPOSITORY_SETTINGS_ARG_STRING

set -x

echo "Script completed successfully."
