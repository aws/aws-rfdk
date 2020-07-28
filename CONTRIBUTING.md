# Adding packages to the project

We have a template package located in the folder [pkg-template/](pkg-template/).

1.  Copy the template package from the root to the desired location in the
    packages directory.
    -  Construct packages should be put inside the `packages/@aws-rfdk` directory.
    -  Dev/build tool packages belong in `tools/`
1.  Follow the directions from the copied [pkg-template/README.md](pkg-template/README.md)
1.  Run `yarn install` from the root directory to update `yarn.lock`
    - if you get similar warnings as below, please go to the 
    [Dependencies](#Dependencies) section
    ```
    warning " > (yourPackage)" has unmet peer dependency "(somePackage)"
    ```

1.  The new package directory and the updated `yarn.lock` should be added in the
    same commit

# Build the packages

The [`buildspec.yaml`](buildspec.yaml) is used by CodePipeline to build the
packages. To build the packages locally, simply run the same commands listed in
`buildspec.yaml`.

It’s recommended you build the packages within a docker container. You can use the 
[jsii/superchain docker container](https://hub.docker.com/r/jsii/superchain).
The `-v` flag below is to bind mount a volume

```
docker pull jsii/superchain
docker run -d -it -v <local/path/to/mount/folder>:</docker/path/to/mount> <docker name>
docker exec -it <container name> /bin/bash
>>> bash-4.2#
cd /docker/path/to/mount
```
Now that you're in the docker container, you can run the build commands.

# Dependencies

## Package versioning

Current best practices is to always used a fixed version for dependencies — `"@aws-rfdk/core": "1.0.0"`.

Unfortunately allowing any kind of nonfixed type) dependencies causes build
errors. CDK is using fixed dependencies for all their packages so we have no
reasonable way to allow nonfixed dependencies as well.

If you want to learn more about dependencies you can read the
[yarn docs](https://yarnpkg.com/lang/en/docs/dependency-types/).

## A package's `package.json`

You will need to put the package's dependencies in the `dependencies` and
`peerDependencies`. For example, if you wanted to use [aws-sqs](https://github.com/aws/aws-cdk/blob/v1.18.0/packages/%40aws-cdk/aws-sqs/package.json),
you would need to have this in **your package's** `package.json`
```
# packages/@aws-rfdk/<your package>/package.json
"dependencies": {
  "@aws-cdk/aws-sqs": "1.18.0"
},
"peerDependencies": {
  "@aws-cdk/aws-sqs": "1.18.0"
},
```

## In the root `package.json`

For each dependency you specified, you will need to include its dependencies in
the root `package.json`. For example, if you wanted to use [aws-sqs](https://github.com/aws/aws-cdk/blob/v1.18.0/packages/%40aws-cdk/aws-sqs/package.json),
you would need to have this in your **root** `package.json`

```
"devDependencies": {
    "@aws-cdk/aws-cloudwatch": "1.18.0",
    "@aws-cdk/aws-iam": "1.18.0",
    "@aws-cdk/aws-kms": "1.18.0",
    "@aws-cdk/core": "1.18.0"
}
```

### Linking against this repository

The script `./link-all.sh` can be used to generate symlinks to all modules in this repository under some `node_module`
directory. This can be used to develop against this repo as a local dependency.

One can use the `postinstall` script to symlink this repo:

```json
{
  "scripts": {
    "postinstall": "../AWS-RFDK/link-all.sh"
  }
}
```

This assumes this repo is a sibling of the target repo and will install the CDK as a linked dependency during
__yarn install__.

# Bumping the RFDK Version Number

Bumping the version of RFDK is done by creating a bump commit. This process has been scripted. To bump the version,
check out the commit that will become the parent of the bump commit. The working directory must be clean with no
uncommitted or staged changes. Run the following command from the root of the repository:

```bash
./bump.sh
```

By default, this will bump the minor version of RFDK. You can bump the following other components of the version number:

*   `major`
*   `minor`
*   `patch`
*   `premajor`
*   `preminor`
*   `prepatch`
*   `prerelease`

To do this, run:

```bash
./bump.sh <COMPONENT>
```

For example:

```bash
./bump.sh major
```