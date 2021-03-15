# Upgrading to RFDK v0.27.x or Newer

The Deadline container images used for server components (`RenderQueue` and `UsageBasedLicensing` constructs) have
changed and as a result, [EFS access points][efs_access_points] must now be used to properly mount Deadline's Repository
file-system. To upgrade without disruption, you must make changes to your CDK application and/or deployed EFS
file-system.

The upgrade process differs based on your usage pattern of the `Repository` RFDK construct. These usage patterns are
documented in the following sections. Once you've identified which pattern applies to your CDK applicaiton, review the
steps and plan your upgrade as documented.

Scenarios:

1.  [Deadline Repository with Implicit EFS File-System](#Deadline-Repository-with-Implicit-EFS-File-System)

    **TypeScript:**
    ```ts
    new Repository(scope, 'Repository', {
        // ...
        // no "fileSystem" property
        // ...
    })
    ```

    **Python:**
    ```py
    Repository(scope, 'Repository',
        # ...
        # no "file_system" property
        # ...
    )
    ```

2.  [Deadline Repository with Provided EFS File-System](#Deadline-Repository-with-Provided-EFS-File-System)

    **TypeScript:**
    ```ts
    new Repository(scope, 'Repository', {
        // ...
        fileSystem: myFileSystem
        // ...
    });
    ```

    **Python:**
    ```py
    Repository(scope, 'Repository',
        # ...
        file_system=my_file_system,
        # ...
    )
    ```

## Deadline Repository with Implicit EFS File-System

If your app creates a `Repository` instance without a supplied file-system, then the `Repository` construct creates an
EFS file-system for the Deadline Repository files.

In RFDK 0.27.x, the `Repository` construct's behavior has changed in this scenario. It now creates and uses an EFS
Access Point. Both the `Repository` and the `RenderQueue` mount the EFS using this new access point. Each EFS access
point corresponds to a POSIX UID/GID combination. All file operations performed via a mount of the access point assume
those UID/GIDs. For the above CDK code snippets, when no file-system is supplied to the `Repository` construct, it now
creates an Access Point with:

*   **UID**: `0`
*   **GID**: `0`

In effect, this gives the `Repository` and `RenderQueue` unrestricted access to the EFS file-system. This usage pattern
is intended to abstract and encapsulate the file-system.

**If you intend to share an EFS file-system with other parts of your infrastructure beyond the `Repository` and
`RenderQueue` constructs**, you should instead create an EFS `FileSystem` construct in your CDK app and supply it to the
`Repository` construct with a secured EFS Access Point. For examples of this, have a look at the newly updated example
code for [TypeScript][access_point_ex_ts] and [Python][access_point_ex_py].

**If you only require the file-system to be accessed by the `Repository` and `RenderQueue`**, then no further action is
required and you can safely upgrade RFDK and deploy without disruption.

## Deadline Repository with Provided EFS File-System

In this scenario, your app creates a `Repository` instance with an explicitly specified file-system. Here are the steps
to upgrade from pre-0.27.x to 0.27.x and higher:

### Before Upgrading RFDK

1.  Decide UID and GID values that you want to to be used by the `Repository` and `RenderQueue` constructs when
    accessing EFS file-system for the Deadline Repository.
    
    If you do not have any requirement to share the EFS file-system with other agents in your infrastructure, these can
    both be set to `0`. Note, that this grants the `Repository` and `RenderQueue` unrestricted access to the EFS
    file-system.
    
    If you intend to have the EFS file-system used elsewhere, you must decide on these values based on how you'd like
    to configure POSIX file ownership and permissions.
1.  If you've chosen non-zero values, you must perform a manual step to [change ownership of the Deadline Repository
    files on EFS](#Changing-Ownership-of-Deadline-Repository-Files-on-EFS) to  have these values.

At this point you can upgrade your RFDK package to 0.27.x.

### After Upgrading RFDK

The Deadline containers used by the `RenderQueue` now require an EFS Access Point be used. The `MountableEfs` class in
RFDK now accepts an optional `accessPoint` (TypeScript) / `access_point` (Python) property. You must
add an Access Point and specify it when creating the `MountableEfs` that you supply to the `Repository` construct.

This is required for the `Repository` and `RenderQueue` to function properly. Have a look at the newly updated example
code for [TypeScript][access_point_ex_ts] and [Python][access_point_ex_py]. Use UID and GID values chosen in the
previous section when specifying the `posixUser` (TypeScript) / `posix_user` (Python) property of the `AccessPoint`.

When upgrading a CDK application that uses RFDK and has been previously deployed, the file-system will contain the
Deadline Repository files. To simplify the changes to your code, your Access Point can keep its `path` argument set to
the root of the EFS file-system. Sample code:

**TypeScript:**

```ts
import { AccessPoint, FileSystem } from '@aws-cdk/aws-efs';

const fileSystem = new FileSystem(scope, 'FileSystem', {
    // ...
});

// This access point demonstrates the least-effort migration. It grants the
// Repository and RenderQueue with root access to the entire EFS file-system.
// If you intend to use the EFS file-system elsewhere, you should consider
// restricting this access further.
new AccessPoint(scope, 'AccessPoint', {
    fileSystem,
    path: '/',
    posixUser: {
        uid: '0',
        gid: '0',
    },
});
```

**Python:**

```py
from aws_cdk.aws_efs import (AccessPoint, FileSystem, PosixUser)

file_system = FileSystem(scope, 'FileSystem',
    # ...
)

# This access point demonstrates the least-effort migration. It grants the
# Repository and RenderQueue with root access to the entire EFS file-system.
# If you intend to use the EFS file-system elsewhere, you should consider
# restricting this access further.
AccessPoint(scope, 'AccessPoint',
    file_system=file_system,
    path='/',
    posix_user=PosixUser(
        uid='0',
        gid='0',
    ),
)
```

Alternatively, you can specify the absolute path of the Deadline Repository files (relative to the root of the EFS
file-system) to restrict the access of the `RenderQueue` and `Repository` to the Deadline Repository directory. This may
be useful if you intend to share the EFS file-system with other parts of your infrastructure (e.g. render assets, home
directories, etc...).

To make this work properly, you must also adjust the `repoInstallationPath` of you `Repository` construct. Assuming your
existing RFDK app had a `Repository` that installs to `/DeadlineRepository` (the RFDK default if not specified) on the
EFS file-system, you could do the following:

**TypeScript:**

```ts
import { AccessPoint, FileSystem } from '@aws-cdk/aws-efs';
import { MountableEfs } from 'aws-rfdk';
import { Repository } from 'aws-rfdk/deadline';

const fileSystem = new FileSystem(scope, 'FileSystem', {
    // ...
});

const accessPoint = new AccessPoint(scope, 'AccessPoint', {
    fileSystem,
    // Set this to your existing Deadline Repository path relative to the root of the the EFS file-system
    path: '/DeadlineRepository',
    posixUser: {
        uid: '10000',
        gid: '10000',
    },
});

const mountableFs = new MountableEfs(scope, {
    fileSystem,
    accessPoint,
});

new Repository(scope, 'Repository', {
    // ...
    fileSystem: mountableFs,
    // This path is relative to the EFS Access Point path
    repositoryInstallationPrefix: "/",
    // ...
});
```

**Python:**

```py
from aws_cdk.aws_efs import (AccessPoint, FileSystem, PosixUser)
from aws_rfdk import MountableEfs
from aws_rfdk.deadline import Repository

file_system = FileSystem(scope, 'FileSystem',
    # ...
)

access_point = AccessPoint(scope, 'AccessPoint',
    file_system=file_system,
    # Set this to your existing Deadline Repository path relative to the root of the the EFS file-system
    path='/DeadlineRepository',
    posix_user=PosixUser(
        uid='10000',
        gid='10000',
    ),
)

mountable_fs = MountableEfs(scope,
    file_system=file_system,
    access_point=access_point,
)

new Repository(scope, 'Repository',
    # ...
    file_system=mountable_fs,
    # This path is relative to the EFS Access Point path
    repository_installation_prefix='/',
    # ...
)
```

## Changing Ownership of Deadline Repository Files on EFS

In order to migrate to RFDK 0.27.x and newer, you will first need take a manual step to modify the ownership of the
files in the Deadline Repository file-system. To do this, you can deploy a bastion that has the EFS file-system mounted
(see our example [TypeScript][attach_bastion_ts]/[Python][attach_bastion_py] code).

Once you've deployed the bastion, you can use [SSM Session Manager][session_manager] to start a terminal session on the
bastion. Assuming you've mounted the EFS file-system to `/mnt/efs` (as done in the examples linked above), you must then
modify the file permissions with:

```sh
# TODO: replace these values with your EFS mount path and desired UID/GID
EFS_MOUNT_PATH=/mnt/efs
TARGET_UID=10000
TARGET_GID=10000

sudo chown -R "${TARGET_UID}:${TARGET_GID}" "${EFS_MOUNT_PATH}"
```

---

**NOTE:** This operation will change ownership of files, but a running render farm may create additional files that need
to be modified as well. It is advised to first deploy a change to destroy/disable any Deadline Workers and services
(`RenderQueue` or `UsageBasedLicensing` constructs).

---


[efs_access_points]: https://docs.aws.amazon.com/efs/latest/ug/efs-access-points.html
[attach_bastion_ts]: https://github.com/aws/aws-rfdk/blob/f96be912c443cbfd1b38a2aed57436c33f033c7c/examples/deadline/All-In-AWS-Infrastructure-Basic/ts/lib/service-tier.ts#L125-L145
[attach_bastion_py]: https://github.com/aws/aws-rfdk/blob/release/examples/deadline/All-In-AWS-Infrastructure-Basic/python/package/lib/service_tier.py#L93-L117
[session_manager]: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
[access_point_ex_ts]: https://github.com/aws/aws-rfdk/blob/v0.27.0/examples/deadline/All-In-AWS-Infrastructure-Basic/ts/lib/storage-tier.ts#L77-L107
[access_point_ex_py]: https://github.com/aws/aws-rfdk/blob/v0.27.0/examples/deadline/All-In-AWS-Infrastructure-Basic/python/package/lib/storage_tier.py#L93-L126
