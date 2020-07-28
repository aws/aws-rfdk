#!/bin/bash
set -euo pipefail

echo "Running end-to-end test of the kitchen sink example."
cd "$(dirname "$0")"

npm install

npm run stage

export AWS_DEFAULT_REGION=us-west-2

echo "Running cdk deploy..."
npx cdk deploy --require-approval never "*"

echo "Running cdk destroy..."
npx cdk destroy -f "*"

echo "Complete"
exit 0
