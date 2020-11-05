#!/bin/bash
# --------------------------------------------------------------------------------------------------
#
# This script is intended to be used to bump the version of the RFDK modules, update package.json,
# package-lock.json, and create a commit.
#
# to start a version bump, run:
#     bump.sh <version | version Type>
#
# If a version is not provided, the 'minor' version will be bumped.
# The version can be an explicit version _or_ one of:
# 'major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', or 'prerelease'.
#
# This script utilizes the "lerna version" feature as well as the "standard-version" node package
#   https://github.com/lerna/lerna/tree/master/commands/version
#   https://www.npmjs.com/package/standard-version
#
# --------------------------------------------------------------------------------------------------

set -euxo pipefail
version=${1:-minor}

cd "$(dirname "$0")"

echo "Starting $version version bump"

export NODE_OPTIONS="--max-old-space-size=4096 ${NODE_OPTIONS:-}"

/bin/bash ./install.sh

npx lerna version $version --yes --exact --no-git-tag-version --no-push

# Another round of install to fix package-lock.jsons
/bin/bash ./install.sh

# align "peerDependencies" to actual dependencies after bump
# this is technically only required for major version bumps, but in the meantime we shall do it in every bump
/bin/bash ./scripts/fix-peer-deps.sh

# Generate CHANGELOG and create a commit
npx standard-version --skip.tag=true --commit-all

# Get the new version number to do some manual find and replaces
new_version=$(node -p "require('./package.json').version")

# Update the version of RFDK used in the python examples
for exampleSetupPy in $(find ./examples/ -name 'setup.py')
do
  sed -i "s/\"aws-rfdk==[0-9]*\.[0-9]*\.[0-9]*\"/\"aws-rfdk==$new_version\"/" "$exampleSetupPy"
done

# When standard-version adds a patch release to the changelog, it makes it a smaller header size. This undoes that.
if [[ $version == "patch" ]]; then
  version_header="#\(## \[$new_version](.*) (.*)\)"
  sed -i "s|$version_header|\1|" ./CHANGELOG.md
fi

version_header="# \[$new_version](.*) (.*)"

# Add a section to the changelog that states the supported Deadline versions
DEADLINE_RELEASE_NOTE_URL="https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html"
DEADLINE_SUPPORTED_VERSIONS=$(node ./scripts/getSupportedDeadlineVersions.ts)
MIN_DEADLINE_VERSION=$(echo "$DEADLINE_SUPPORTED_VERSIONS" | grep 'Min' | cut -f 2 -d ' ')
MAX_DEADLINE_VERSION=$(echo "$DEADLINE_SUPPORTED_VERSIONS" | grep 'Max' | cut -f 2 -d ' ')
deadline_version_section="\n\n\n### Officially Supported Deadline Versions\n\n* [${MIN_DEADLINE_VERSION} to ${MAX_DEADLINE_VERSION}](${DEADLINE_RELEASE_NOTE_URL})"
sed -i "s|\($version_header\)|\1$deadline_version_section|" ./CHANGELOG.md

# Add a section to the changelog that state the version of CDK being used
cdk_version=$(node -p "require('./package.json').devDependencies['aws-cdk']")
cdk_version_section="\n\n\n### Supported CDK Version\n\n* [$cdk_version](https://github.com/aws/aws-cdk/releases/tag/v$cdk_version)"
sed -i "s|\($version_header\)|\1$cdk_version_section|" ./CHANGELOG.md

git add .
git commit --amend --no-edit
