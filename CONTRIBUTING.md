# Contributing to the Render Farm Deployment Kit on AWS (RFDK)

Thanks for your interest in contributing to the RFDK! ❤️

This document describes how to set up a development environment and submit your contributions. Please read it carefully
and let us know if it's not up-to-date (even better, submit a PR with your  corrections ;-)).

- [Prerequisites](#prerequisites)
  - [Installing Node.js](#installing-node.js)
  - [Installing docker](#installing-docker)
- [Building the packages](#building-the-packages)
  - [Using your self-built RFDK packages](#using-your-self-built-rfdk-packages)
  - [Cleaning up stale build artifacts](#cleaning-up-stale-build-artifacts)
- [Pull Requests](#pull-requests)
  - [Pull Request Checklist](#pull-request-checklist)
  - [Step 1: Open Issue](#step-1-open-issue)
  - [Step 2: Design (optional)](#step-2-design-optional)
  - [Step 3: Work your Magic](#step-3-work-your-magic)
  - [Step 4: Commit](#step-4-commit)
  - [Step 5: Pull Request](#step-5-pull-request)
  - [Step 6: Merge](#step-6-merge)
- [Dependencies](#dependencies)
- [Bumping the RFDK Version Number](#bumping-the-rfdk-version-number)

## Prerequisites

The RFDK is written in Typescript and converted, using [jsii](https://github.com/aws/jsii), into Python. Thus, the
minimal development environment must include:

- Node.js >= 10.21.0
- docker >= 18

We also recommend developing on a Linux system.

### Installing Node.js

To set up a local Node.js environment, we suggest using the [Node Version Manager](https://github.com/nvm-sh/nvm). Follow
the [instructions](https://github.com/nvm-sh/nvm#installing-and-updating) to install it into your system. Once nvm is installed
then you can install a version of Node.js and set your shell to make it available when you login:

```bash
# For example, the latest version of Node.js 12.x

# Find out the version number for latest
LATEST_VERSION=$(nvm ls-remote | grep v12 | grep 'Latest' | awk '{print $1}')

# Install it
nvm install ${LATEST_VERSION}

# Set your shell to use that version when starting (for bash)
echo "nvm use --delete-prefix ${LATEST_VERSION}" >> ${HOME}/.bashrc
# or for zsh
echo "nvm use --delete-prefix ${LATEST_VERSION}" >> ${HOME}/.zshrc

# Alternatively, just enter the Node.js environment when you want.
nvm use --delete-prefix ${LATEST_VERSION}
```

Once you have set up Node.js, then you will want to set up the [Yarn package manager](https://yarnpkg.com/), and
Typescript:

```bash
npm install -g yarn typescript
```

### Installing docker

The [official installation instructions](https://docs.docker.com/engine/install/) are great. We suggest following the
[post-installation steps](https://docs.docker.com/engine/install/linux-postinstall/) as well for convenience.

## Building the packages

It is recommended you build the packages within a docker container on a Linux-compatible system.
The developers actively use Linux for development, but macOS and the Windows Subsystem for Linux #2 may also work.

To build, we use the [jsii/superchain docker container](https://hub.docker.com/r/jsii/superchain).

1. Acquire the latest `jsii/superchain` docker image, if you do not already have it.

    ```bash
    docker pull jsii/superchain
    ```

2. Enter the docker container

    ```bash
    cd <directory containing this file>
    ./scripts/rfdk_build_environment.sh
    >>> bash-4.2#
    ```

3. Now that you are in the docker container you can build.

    ```bash
    # To build the required build tools, and all packages:
    >>> bash-4.2$
    ./build.sh

    # To package the npm and python packages (they will be built into dist/)
    >>> bash-4.2$
    ./pack.sh

    # To build & test your changes to the RFDK package
    # Note: Must have done at least one run of ./build.sh to build the build tools.
    >>> bash-4.2$
    cd packages/aws-rfdk
    >>> bash-4.2$
    yarn build+test
    ```

### Using your self-built RFDK packages

#### Option 1 -- Linking against this repository

The script `./link-all.sh` can be used to generate symlinks to all modules in this repository under some `node_module`
directory. This can be used to develop against this repo as a local dependency.

One can use the `postinstall` script to symlink this repo. For example:

```json
{
  "scripts": {
    "postinstall": "../AWS-RFDK/link-all.sh"
  }
}
```

This assumes this repo is a sibling of the target repo and will install the CDK as a linked dependency during
__yarn install__.

#### Option 2 -- Use npm/pip to install the RFDK packages into your environment

The packages that are created by the `./pack.sh` script can be installed directly into an npm or Python environment.

```bash
# Installing into a local npm environment
npm install <RFDK directory>/dist/js/aws-rfdk@0.15.0.jsii.tgz

# Installing into a Python environment
pip install --force <RFDK directory>/dist/python/aws-rfdk-0.15.0.tar.gz
```

### Cleaning up stale build artifacts

If you are switching git branches and start to encounter unexpected build errors, then the
cause may be stale build artifacts from a previous build from another branch. 

We have scripts that attempt to identify stale build artifacts and clean them up. You might try
those.
```bash
# Ensure that git is tracking all of the active changes that you care about.
git add <files>

# Run the cleaning scripts
cd <this directory>
yarn clean
./clean.sh

# Rebuild
./build.sh
```

If that does not work, then you might try the following nuclear option. **WARNING** -- this will
delete all files in the workspace that are not actively tracked by git:

```bash
# Ensure that git is tracking all of the active changes that you care about.
git add <files>

# Use git clean to delete all files that are not tracked in git
git clean -fdx
```

### Pull Requests

#### Pull Request Checklist

- [ ] Testing
  - Unit test added (prefer not to modify an existing test, otherwise, it's probably a breaking change)
- [ ] Docs
  - __jsdocs__: All public APIs documented
  - __README__: README and/or documentation topic updated
- [ ] Title and Description
  - __Change type__: title prefixed with **fix**, **feat** and module name in parens, which will appear in changelog
  - __Title__: use lower-case and doesn't end with a period
  - __Breaking?__: last paragraph: "BREAKING CHANGE: <describe what changed + link for details>"
  - __Issues__: Indicate issues fixed via: "**Fixes #xxx**" or "**Closes #xxx**"

---

#### Step 1: Open Issue

If there isn't one already, open an issue describing what you intend to contribute. It's useful to communicate in
advance, because sometimes, someone is already working in this space, so maybe it's worth collaborating with them
instead of duplicating the efforts.

#### Step 2: Design (optional)

In some cases, it is useful to seek for feedback by iterating on a design document. This is useful
when you plan a big change or feature, or you want advice on what would be the best path forward.

Sometimes, the GitHub issue is sufficient for such discussions, and can be sufficient to get
clarity on what you plan to do. Sometimes, a design document would work better, so people can provide
iterative feedback.

In such cases, use the GitHub issue description to collect **requirements** and
**use cases** for your feature.

#### Step 3: Work your Magic

Work your magic. Here are some guidelines:

- Coding style (abbreviated):
  - In general, follow the style of the code around you
  - 2 space indentation
  - 120 characters wide
  - ATX style headings in markdown (e.g. `## H2 heading`)
- Every change requires a unit test
- If you change APIs, make sure to update the README file
- Try to maintain a single feature/bugfix per pull request. It's okay to introduce a little bit of housekeeping
   changes along the way, but try to avoid conflating multiple features. Eventually all these are going to go into a
   single commit, so you can use that to frame your scope.
- If your change introduces a new construct, then take a look at our existing constructs to get a feel for
  the common patterns that we use.

##### A Word about Tests

We have two styles of test in the RFDK.

1. Unit tests.
    - These are found in the `test/` directories within `packages/aws-rfdk`. They essentially act as regression detectors.
    - In the tests for constructs, we verify that they are generating the expected CloudFormation resources, with expected
    attributes. This allows us to detect a change in behavior when we make a change, and to identify changes in our
    upstream dependencies that materially alter our generated resources.
    - The tests for our AWS Lambda functions similarly act as proof that the function acts as expected, and are used
    to detect unintended side-effects of changes made to the code.
    - Generally, we aim for our tests to cover as close to 100% of code paths as possible, and to verify that all construct properties
    correctly materialize in the resulting CloudFormation template.
2. Functional/integration tests.
    - These are found in the `integ/` directory of the root of the repository.
    - These tests help us detect when changes to the RFDK, or to the software that we deploy, causes regressions in the
    functionality of the farm.
    - These tests are best-effort coverage. Minimally, we aim for them to cover the core use-cases and any regressions that
    have been found and fixed in the past -- to reduce the change of a re-regression.

#### Step 4: Commit

Create a commit with the proposed changes:

- Commit title and message (and PR title and description) must adhere to [conventionalcommits](https://www.conventionalcommits.org).
  - The title must begin with `feat(module): title`, `fix(module): title`, `refactor(module): title` or
    `chore(module): title`. Our module titles are:
    - `core` -- for code related to constructs under `packages/aws-rfdk/lib/core`.
    - `deadline` -- for code related to constructs under `packages/aws-rfdk/lib/deadline`.
    - `aws-rfdk` -- for code under `packages/aws-rfdk` that does not fall into one of the above categories.
    - `integ` -- for changes to the integration tests under `integ/`.
    - `examples` -- for changes to our example applications under `examples/`.
    - `tools` -- for changes to our tooling under `tools/`.
    - `lambda-layers` -- for changes to the lambda-layer code under `lambda-layers/`
    - `repo` -- for all other changes.
  - Title should be lowercase.
  - No period at the end of the title.

- Commit message should describe _motivation_. Think about your code reviewers and what information they need in
  order to understand what you did. If it's a big commit (hopefully not), try to provide some good entry points so
  it will be easier to follow.

- Commit message should indicate which issues are fixed: `fixes #<issue>` or `closes #<issue>`.

- Shout out to collaborators.

- If not obvious (i.e. from unit tests), describe how you verified that your change works.

- If this commit includes breaking changes, they must be listed at the end in the following format (notice how multiple breaking changes should be formatted):

```
BREAKING CHANGE: Description of what broke and how to achieve this behavior now
- **module-name:** Another breaking change
- **module-name:** Yet another breaking change
```

#### Step 5: Pull Request

- Push to a personal GitHub fork.
- Submit a Pull Request on GitHub. A reviewer will later be assigned by the maintainers.
- Please follow the PR checklist written above. We trust our contributors to self-check, and this helps that process!
- Discuss review comments and iterate until you get at least one “Approve”. When iterating, push new commits to the
  same branch. Usually all these are going to be squashed when you merge to master. The commit messages should be hints
  for you when you finalize your merge commit message.
- Make sure to update the PR title/description if things change. The PR title/description are going to be used as the
  commit title/message and will appear in the CHANGELOG, so maintain them all the way throughout the process.

#### Step 6: Merge

- Make sure your PR builds successfully (we have a github action set up to automatically build all PRs)
- Once approved and tested, a maintainer will squash-merge to master and will use your PR title/description as the
  commit message.

## Dependencies

### Package versioning

Current best practices is to always used a fixed version for dependencies — `"aws-rfdk": "1.0.0"`.

Unfortunately allowing any kind of nonfixed type) dependencies causes build
errors. CDK is using fixed dependencies for all their packages so we have no
reasonable way to allow nonfixed dependencies as well.

If you want to learn more about dependencies you can read the
[yarn docs](https://yarnpkg.com/lang/en/docs/dependency-types/).

### A package's `package.json`

You will need to put the package's dependencies in the `dependencies` and
`peerDependencies`. For example, if you wanted to use [aws-sqs](https://github.com/aws/aws-cdk/blob/v1.18.0/packages/%40aws-cdk/aws-sqs/package.json),
you would need to have this in the `package.json`
```json
# packages/aws-rfdk/package.json
"dependencies": {
  "@aws-cdk/aws-sqs": "1.18.0"
},
"peerDependencies": {
  "@aws-cdk/aws-sqs": "1.18.0"
},
```

### In the root `package.json`

For each dependency you specified, you will need to include its dependencies in
the root `package.json`. For example, if you wanted to use [aws-sqs](https://github.com/aws/aws-cdk/blob/v1.18.0/packages/%40aws-cdk/aws-sqs/package.json),
you would need to have this in your **root** `package.json`

```json
"devDependencies": {
    "@aws-cdk/aws-cloudwatch": "1.18.0",
    "@aws-cdk/aws-iam": "1.18.0",
    "@aws-cdk/aws-kms": "1.18.0",
    "@aws-cdk/core": "1.18.0"
}
```
