# Kitchen Sink Example App

This is an example CDK application that uses RFDK constructs to set up a Render
Farm (and the kitchen sink). The idiom "kitchen sink" refers to something that
contains all conceivable things. This example contains the majority of the
constructs that RFDK provides to demonstrate how they can be used.

## Setup

To build the app, update the configuration file(`config/AppConfig.json`) and then
run the following from the `examples/kitchen-sink` directory:

    yarn run build+test

Next, you will need to configure which AWS account and region that the app will
deploy to. The kitchen sink app does not hard-code the account and credentials
into the code (as recommended by [CDK's environment documentation][cdk envs]
for production apps). Instead, it assumes these are passed in by `cdk` via the
`CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` environment variables.

[cdk envs]: https://docs.aws.amazon.com/cdk/latest/guide/environments.html

If you want to modify this for a production environment, it is advised to embed
the account ID and region within the code using the `env` key in the stack's
constructor properties argument.

### Staging Deadline

Certain Deadline RFDK constructs, such as the `RenderQueue` and the
`UsageBasedLicensing` constructs, require a Deadline installer and Docker image recipes
to be staged into a local directory on the deployment machine.

RFDK includes a `stage-deadline` command that can be used to automate this. The
kitchen sink includes a light wrapper that manages this. To use it, run the
following command from the kitchen sink directory:

```bash
yarn run stage
```

This script uses the AWS CLI to obtain Deadline installers and Docker image
recipes. The [CLI will need to be configured][aws_cli_config] to authenticate
to AWS. You can:

1.  Configure a [named profile][aws_cli_named_profile] and set the `AWS_PROFILE`
    environment variable to the name of the profile.
1.  Use [environment variables][aws_cli_env_vars]

[aws_cli_config]: https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html
[aws_cli_named_profile]: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html
[aws_cli_env_vars]: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html

## Deployment

To deploy the kitchen sink app, you will need to configure CDK to authenticate
to AWS.

### Provisioning an IAM User

You will need to create an IAM user that can be used for deploying the Kitchen
Sink CDK app. The user will need to be configured with the appropriate access.

**TODO:** Review best-practices and establish a procedure for creating for an
IAM user that can be used for deploying CDK applications.

### Using an AWS Named Profile

To set the environment variables for running the app as-is, you can [configure a
named profile][aws_cli_named_profile]. This is done by embedding an AWS access
key ID, AWS secret access key, and region in the `~/.aws/config` (Linux or Mac)
or `%USERPROFILE%\.config` (Windows) files.

The following is an example config file:

```ini
[profile cdk_deploy]
aws_access_key_id=AKIAIOSFODNN7EXAMPLE
aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
region=us-west-2
```

To deploy with the profile, you can set the `AWS_PROFILE` environment variable.

On Windows:

```bat
set AWS_PROFILE=cdk_deploy
npx cdk deploy InfrastructureStack
```

On Linux/Mac:

```bash
export AWS_PROFILE=cdk_deploy
npx cdk deploy InfrastructureStack
```

Alternatively, you can pass the profile as a command-line argument to CDK:

    npx cdk deploy --profile cdk_deploy InfrastructureStack

### Specifying Access Keys in Environment Variables

Alternatively,
[credentials can be specified using environment variables][aws_cli_env_vars]:

*   `AWS_ACCESS_KEY_ID` – Specifies your access key.
*   `AWS_SECRET_ACCESS_KEY` – Specifies your secret access key.
*   `AWS_DEFAULT_REGION` – Specifies your default Region.

To set environment variables on Linux/Mac:

```bash
export AWS_DEFAULT_REGION=us-west-2
```

To set environment variables on Windows:

```bat
set AWS_DEFAULT_REGION=us-west-2
```

To deploy with the environment variables set, run the command:

    npx cdk deploy InfrastructureStack

