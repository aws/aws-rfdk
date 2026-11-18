# Upgrading to RFDK v1.7.x or Newer

## Updating Node.js

Node.js 18 and Node.js 20 have reached End of Life. RFDK >= 1.7.x depends on `aws-cdk-lib` 2.269.0, which requires
Node.js 20.0.0 or newer, so Node.js 18 and older are no longer supported. Because Node.js 20 is also End of Life, we
recommend using an [Active LTS release](https://nodejs.org/en/about/previous-releases) (Node.js 22 or newer).

You can follow our [installation guide](../../../../CONTRIBUTING.md#installing-nodejs) for Node.js to upgrade to the latest version.

## Updating Python

RFDK >= 1.7.x depends on `aws-cdk-lib` 2.269.0, which requires Python 3.10 or newer.

## AWS Lambda runtime

The AWS Lambda functions that RFDK deploys now use the `nodejs24.x` runtime instead of `nodejs18.x`. Deploying a stack
with RFDK 1.7.x updates these functions in place; no action is needed. If you have tooling that checks or pins the
runtime of these functions, update it to allow `nodejs24.x`.
