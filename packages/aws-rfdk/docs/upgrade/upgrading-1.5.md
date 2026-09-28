# Upgrading to RFDK v1.5.x or Newer

## Updating DocumentDB

Please backup your existing database before upgrading to RFDK 1.5.x.

In RFDK versions >= 1.5.x, we upgraded the default DocumentDB engine version to 5.0.0. Note that you may lose data and your deployment may fail if you have existing stacks with previous DocumentDB versions. You will need to manually upgrade your existing DocumentDB cluster by following the documentation: https://docs.aws.amazon.com/documentdb/latest/devguide/docdb-mvu.html

## Updating MongoDB

Please backup your existing database before upgrading to RFDK 1.5.x.

In RFDK versions >= 1.5.x, we have been upgraded the default MongoDB version to 8.0. Note that deployments with an existing MongoDB version lower than 8.0 will not automatically upgrade to the new version. See the following blog post for information on how to manually update your MongoDB database: https://awsthinkbox.zendesk.com/hc/en-us/articles/1500008016222-How-Do-I-Upgrade-MongoDB-to-version-4-2-from-3-2