#!/bin/bash

# Fetches the amazonlinux Docker image from the official regional ECR and tags
# it as-if it were fetched from DockerHub. This avoids any egress to the
# internet when pulling images from AWS and also can be used to avoid DockerHub
# rate limits.
#
# This assumes that the AWS CLI is configured to use AWS credentials with
# sufficient access to query and pull images from the amazon linux ECR.
#
# For more information, see:
# https://docs.aws.amazon.com/AmazonECR/latest/userguide/amazon_linux_container_image.html
# https://docs.aws.amazon.com/IAM/latest/UserGuide/list_amazonelasticcontainerregistry.html
#
# USAGE
#
#   pull_amazonlinux_from_ecr.sh REGION [VERSION ...]
#
# ARGUMENTS
#
#   REGION
#     The AWS region of the ECR repository to pull from
#
#   VERSION
#     One or more Docker version tags to pull. If not specified, the "latest"
#     tag will be pulled
#
# EXAMPLES
#
#   # Pulls the "latest" version from the us-east-1 ECR repo
#   pull_amazonlinux_from_ecr.sh us-east-1
#
#   # Pulls the "amazonlinux:2" from the us-west-2 ECR repo
#   pull_amazonlinux_from_ecr.sh us-west-2 2


set -euo pipefail

# The AWS account that contains the regional amazonlinux ECRs
AWS_AL_ACCOUNT_ID=137112412989

if [ "$#" -lt 1 ]; then
    echo "ERROR: No region specified"
    exit 1
fi

# Extract the AWS region from the first argument
AWS_REGION="$1"; shift

# Remaining arguments are the image version tags. If not specified, "latest" is
# used.
if [ "$#" -gt 0 ]; then
    TAG_VERSIONS=( "$@" )
else
    TAG_VERSIONS=( "latest" )
fi

# Compute the ECR URI for the specified region
AWS_AL_URI="${AWS_AL_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/amazonlinux"
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${AWS_AL_URI}"

for TAG_VERSION in "${TAG_VERSIONS[@]}"; do
    echo "Pulling amazonlinux:${TAG_VERSION}..."
    docker pull "${AWS_AL_URI}:${TAG_VERSION}"
    echo "Tagging amazonlinux:${TAG_VERSION}..."
    docker tag "${AWS_AL_URI}:${TAG_VERSION}" "amazonlinux:${TAG_VERSION}"
    echo "done"
done
