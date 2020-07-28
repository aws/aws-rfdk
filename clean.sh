#!/bin/bash
set -euo pipefail

echo "Cleaning base directory and tools..."

# Installation directories
rm -rf ./node_modules/
rm -rf ./tools/awslint/node_modules/
rm -rf ./tools/cdk-build-tools/node_modules/
rm -rf ./tools/pkglint/node_modules/

# Build files
if [ -f .BUILD_COMPLETED ]; then
    rm .BUILD_COMPLETED
fi

# Packaging directory
rm -rf ./dist

echo "Done"
