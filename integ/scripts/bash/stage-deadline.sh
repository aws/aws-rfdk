#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

# Check if Deadline assets are staged at configured path
if [ ! $(ls "$DEADLINE_STAGING_PATH/manifest.json" 2> /dev/null) ]; then
    # If DEADLINE_VERSION is not defined set empty value to get the latest version
    if [ -z ${DEADLINE_VERSION+x} ]; then
        export DEADLINE_VERSION=""
    fi
    # Stage Deadline assets
    echo "Staging Deadline version ${DEADLINE_VERSION+latest}"
    npx stage-deadline --output "$DEADLINE_STAGING_PATH" $DEADLINE_VERSION

    staged_version=$(jq -r '.version' "$DEADLINE_STAGING_PATH/manifest.json")
    echo "Staged Deadline $staged_version"

    echo "Injecting Secrets Management installer + Docker recipes"
    cp "$JERICHT_SM_DL_INSTALLER_PATH" "./stage/bin/DeadlineClient-$staged_version-linux-x64-installer.run"

    cat << 'EOF' > ./stage/rcs/root/app/configure-rcs.sh
#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Configures the Deadline RCS
# 
# Input Environment Variables
# ---------------------------
#
# - REPO_URI
# - DB_CREDENTIALS_URI
# - DB_TLS_CLIENT_CERT_URI
# - DB_TLS_CLIENT_CERT_PASSWORD_URI
# - RCS_TLS_CERT_URI
# - RCS_TLS_CERT_PASSPHRASE_URI
# - RCS_TLS_CA_CERT_URI
# - RCS_TLS_REQUIRE_CLIENT_CERT
# - RCS_SM_CREDENTIALS_URI
#
# Consult ../../README.md for documentation on what values these environment
# variables accept.

set -euo pipefail

CONFIGS=( "direct-repo-connection" "rcs-tls" "rcs-secrets-management" )
for config in "${CONFIGS[@]}"; do
    echo "configuring: [${config}]"
    dlconfig "${config}"
done

# Run the docker command
exec "$@"

EOF

    cat << 'EOF' > ./stage/rcs/root/dlconfig/rcs-secrets-management
#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Configures the RCS as a server role with Deadline Secrets Management
# 
# Input Environment Variables
# ---------------------------
#
# - RCS_SM_CREDENTIALS_URI
#
# Consult ../../README.md for documentation on what values these environment
# variables accept.

set -euo pipefail

RCS_SM_CREDENTIALS_URI="${RCS_SM_CREDENTIALS_URI:=}"

if [ ! -z "${RCS_SM_CREDENTIALS_URI}" ]; then
  export RCS_SM_CREDENTIALS=$(fetch_secret "${RCS_SM_CREDENTIALS_URI}")
  export RCS_SM_USERNAME=$(printenv RCS_SM_CREDENTIALS | json-query --raw 'username')
  export RCS_SM_PASSWORD=$(printenv RCS_SM_CREDENTIALS | json-query --raw 'password')

  if [ -z "${RCS_SM_USERNAME}" ] || [ -z "${RCS_SM_PASSWORD}" ]; then
    echo "ERROR: Secrets Management username or password is empty."
    exit 1
  fi

  deadlinecommand secrets ConfigureServerMachine "${RCS_SM_USERNAME}" defaultKey "$(id -un)" --configureAll --password env:RCS_SM_PASSWORD
  echo "Successfully configured Deadline Secrets Management"

  unset RCS_SM_USERNAME
  unset RCS_SM_PASSWORD
  unset RCS_SM_CREDENTIALS
else
  echo "Skipping Secrets Management setup"
fi

unset RCS_SM_CREDENTIALS_URI

EOF

    cat << 'EOF' > ./stage/Dockerfile
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

##########################################################################
####                                                                  ####
####                  Deadline Docker Image Recipes                   ####
####                                                                  ####
##########################################################################


# This set of recipes is written as a Docker multi-stage build. The pattern
# unifies the redundant commands to run before/after the recipe-specific
# commands. The chart below depicts the initial recipe and potential future
# recipes.
#
#                                 builder
#                                    │
#                                   base
#                                    │
#            ┌───────────────────────┼╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┐
#            │                       ╷                       ╷
#            │                       ╷                       ╷
#            v                       v                       v
#       deadline-rcs     deadline-license-forwarder     deadline-*
#            │                       ╷                       ╷
#            │                       v                       ╷
#            └─────────────────>  (final)  <╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┘
#                                    │
#                                    v
#                                [ IMAGE ]
#

##########################################################################
####                                                                  ####
####                       Global build arguments                     ####
####                                                                  ####
####   Docker ARGs declared before the first FROM command are global  ####
####      build arguments that are available to all build stages.     ####
####                                                                  ####
##########################################################################

# The Deadline client application that the build is targeting
ARG DL_CLIENT

# The version of Deadline used to build the image
ARG DL_VERSION

# The user that will be created and Deadline will be configured to run as
ARG DL_USER="ec2-user"

##########################################################################
####                                                                  ####
####                          "builder" stage                         ####
####                                                                  ####
##########################################################################

# This is the initial builder stage that is used to stage the file-system to be
# copied into the "base" stage that follows. The contents of the builder
# file-system is compress from multiple AUFS layers into a single layer,
# which is done to reclaim unused space that in an intermediate layer used to
# add the Deadline Client installer.

FROM amazonlinux:2 AS builder

# Build-time arguments for this stage
ARG DL_VERSION
ARG DL_USER

# The URL/path to the Deadline Client installer
ARG DL_CLIENT_INSTALLER=bin/DeadlineClient-$DL_VERSION-linux-x64-installer.run

# Update installed packages and install extra deps from distro
RUN yum update -y           &&  \
    yum install -y              \
        awscli                  \
        bzip2                   \
        unzip                   \
        file                    \
        procps-ng               \
        shadow-utils            \
        tar                 &&  \
    yum clean all           &&  \
    rm -rf /var/cache/yum

# Create the user
RUN adduser $DL_USER

# Add the staged Deadline Client installer and execute it
RUN mkdir -p /installer
WORKDIR /installer
ADD $DL_CLIENT_INSTALLER ./dl-client-installer.run
RUN ./dl-client-installer.run \
        --mode unattended \
        --connectiontype Remote \
        --proxyrootdir 127.0.0.1:8080 \
        --noguimode true \
        --slavestartup false \
        --launcherdaemon true \
        --daemonuser $DL_USER \
        --restartstalled true \
        --autoupdateoverride False && \
    rm -rf /installer


##########################################################################
####                                                                  ####
####                             "base" stage                         ####
####                                                                  ####
##########################################################################

# We create a new stage from "scratch" (minimal base image) and copy the root
# file-system from the "builder" stage. This is done to conserve space in the
# final image.
#
# This technique conserves space for three use cases:
#     1. Pulling the layers on a Docker host for the first time
#     2. Pulling the layers on a Docker host with caching disabled
#     3. When the intermediate layers introduce a large file that is later
#        deleted
#
# The Deadline Client installer is large (around 1GB). The ADD command creates a
# new layer. Once the installation is finished, we delete the installer, but the
# previous layer that added the installer is still part of the final image.
#
# This technique comes at the expense of not being able to cache upstream
# to save transfer and disk space when the downstream layers are fetched and
# used. See:
# https://docs.docker.com/develop/develop-images/baseimages/#create-a-simple-parent-image-using-scratch
FROM scratch as base

ARG DL_VERSION
ARG DL_USER

COPY --from=builder / /

# Additional environment variables
ENV DEADLINE_PATH="/opt/Thinkbox/Deadline10/bin"

ADD dlconfig /dlconfig

ENV PATH="${DEADLINE_PATH}:/dlconfig:${PATH}"

# Do three things in this RUN to reduce the number of layers in the image:
# 1. Set up the container startup directory
# 2. Set the executable bits for the configuration files so that when building from Windows, we can be sure
# that the resulting files are executable
# 3. Create an app configuration directory (/app/config) that is writable by the container's default user
#    This allows the container entrypoint to be able to write configuration files to this location.
# 4. Creates the directory where Deadline stores its RSA keypairs at ~$DL_USER/.config/.mono/keypairs so that
# its identity can be persisted between containers by using docker volumes or bind mounts at that location.
RUN mkdir -p /app && \
    chmod +x ./dlconfig/fetch_file \
             ./dlconfig/fetch_secret \
             ./dlconfig/dlconfig \
             ./dlconfig/json-query && \
    install -g $DL_USER -m 775 -d /app/config && \
    DL_USER_HOME=$(getent passwd "$DL_USER" | cut -d: -f6) && \
    install -g $DL_USER -o $DL_USER -m 755 -d "$DL_USER_HOME/.config" \
    install -g $DL_USER -o $DL_USER -m 755 -d "$DL_USER_HOME/.config/.mono" && \
    install -g $DL_USER -o $DL_USER -m 700 -d "$DL_USER_HOME/.config/.mono/keypairs"
WORKDIR /app

# Bake version build arg 
RUN echo ${DL_VERSION} > VERSION

# Configure the default user
USER $DL_USER

##########################################################################
####                                                                  ####
####     "Deadline Client"-specific branches of the docker recipe     ####
####                                                                  ####
##########################################################################

#######
# RCS #
#######
FROM base AS deadline-rcs

EXPOSE 8080
ADD rcs/root /
ENTRYPOINT ["./configure-rcs.sh"]
CMD ["deadlinercs"]

# Set the executable bits for the configuration script so that when building from Windows, we can be sure
# that the resulting file is executable
USER root
RUN chmod +x /app/configure-rcs.sh

#####################
# License Forwarder #
#####################
FROM base AS deadline-license-forwarder
ADD license-forwarder/root /
ENTRYPOINT ["./configure-license-forwarder.sh"]
CMD ["deadlinelicenseforwarder", "-sslpath", "/app/config/ubl_certs", "-verbose"]

# Set the executable bits for the configuration script so that when building from Windows, we can be sure
# that the resulting file is executable
USER root
RUN chmod +x /app/configure-license-forwarder.sh

##########################################################################
####                                                                  ####
####                      Resume after branches                       ####
####                                                                  ####
##########################################################################
FROM deadline-$DL_CLIENT

ARG DL_CLIENT
ARG DL_VERSION
ARG DL_USER

# Promote build arguments to image environment variables
ENV DL_VERSION=$DL_VERSION
ENV DL_CLIENT=$DL_CLIENT

# Configure the default user
USER $DL_USER

EOF
fi

exit 0
