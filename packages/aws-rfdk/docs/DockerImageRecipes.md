# Docker Image Recipes

RFDK uses Docker image recipes to build and deploy Docker images to machines. These recipes typically live in a _stage directory_.

## Stage Directory Convention

A stage directory must contain a `Dockerfile` and a manifest file at the root of the directory. It can also have a directory for each Docker image recipe that contains contextual information for that recipe.

**Dockerfile** - The Dockerfile that Docker uses to assemble container images from Docker recipes.

**Manifest File** - This file contains meta-data about each recipe and is used by RFDK to build up the corresponding [DockerImageAsset](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecr-assets.DockerImageAsset.html) objects. In addition to the recipe meta-data, it also includes other useful information, such as the schema version. For more information, see [Manifest File Schema](#manifest-file-schema).

## Docker Image Recipe Composition

A Docker image recipe is composed of the following:

**Recipe**
- Dockerfile
- An entry in the manifest file containing:
    - Title of the image
    - (Optional) Description of the image
    - (Optional) Docker build arguments
    - (Optional) Docker target/stage

**Context directory**
- Deadline Client installer
- Configuration scripts

The **recipe** contains instructions that use the items in the **context directory** to create a Docker image.

When using a recipe, RFDK runs the Dockerfile with the build arguments for that recipe from the manifest file. The Dockerfile will then use the configuration scripts and Deadline Client installer to build the Docker image that will be deployed.

The Dockerfile can either be:
- A Dockerfile that supports [multi-stage builds](https://docs.docker.com/develop/develop-images/multistage-build/), containing branches for each recipe
- A common Dockerfile that is used by all recipes

## Manifest File Schema

The manifest file in a stage directory contains information about each Docker image recipe in the `recipes` field. The `buildArgs` field of a recipe specifies the arguments passed into the Dockerfile that will dictate what the Dockerfile does.

### Version 1

This schema version takes on the following form:

```json
{
    "schema": 1,
    "recipes": {
        "<recipe-name>": {
            "title": "<recipe-title>",
            "description": "<recipe-description>",
            "target": "<recipe-target>",
            "buildArgs": {
              "<arg-1>": "<value-1>",
              ...
            }
        },
        ...
    }
}
```
