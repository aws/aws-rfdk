# Upgrading to RFDK v0.38.x or Newer

Starting in RFDK v0.38.0, [Deadline Secrets Management](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html) will be enabled on the
`Repository` and `RenderQueue` constructs by default when using Deadline 10.1.18 and later. This can cause some issues with existing farm configurations because Deadline Secrets Management requires:

- The internal protocol on the Render Queue to be HTTPS
- The external protocol on the Render Queue to be HTTPS

Additionally, if you plan on upgrading to RFDK 0.38 or newer and Deadline 10.1.18 or newer, but do **not** want to enable Deadline Secrets Management, you may have to make changes to your RFDK application so that
RFDK does not automatically configure Deadline Secrets Management on your farm.

## Upgrading Farms and Enabling Deadline Secrets Management

---

_This section describes how to upgrade your RFDK farm while also enabling Deadline Secrets Management. If you would **not** like to enable Deadline Secrets Management, please skip to the
next section "Upgrading Farms Without Enabling Deadline Secrets Management"._

---

To determine whether your `RenderQueue` is using HTTPS for internal and external protocols, you need to check what values you have set
for the [`trafficEncryption`](https://docs.aws.amazon.com/rfdk/api/latest/docs/aws-rfdk.deadline.RenderQueue.html#trafficencryption) property.
Your `RenderQueue` is using HTTPS for internal and external protocols if one of the following is true:

1. You have not specified the `trafficEncryption` or the `trafficEncryption.externalTLS` property for the `RenderQueue`
2. You have specified the `trafficEncryption` property for the `RenderQueue` and the following are true:
    1. The `internalProtocol` is `ApplicationProtocol.HTTPS`
    2. One of the following is true for the `externalTLS` property:
        1. `enabled` is `true`
        2. There are values for both `acmCertificate` and `acmCertificateChain`
        3. There is a value for `rfdkCertificate`

If the above is true, all you need to do to enable Deadline Secrets Management is redeploy your RFDK application.

If your `RenderQueue` is not using HTTPS for its internal and/or external protocols as described above, you will need to satisfy the conditions above before deploying your farm so that
RFDK can successfully configure Deadline Secrets Management for you.

The below example code snippets demonstrate what each case above may look like:

<details><summary><b>Typescript</b> (click to expand)</summary>

```ts
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import { RenderQueue } from 'aws-rfdk/deadline';

new RenderQueue(this, 'RenderQueue', {
  // no "trafficEncryption" property, so TLS is enabled externally by default
  // ...
});

// OR

new RenderQueue(this, 'RenderQueue', {
  // ...
  trafficEncryption: {
    internalProtocol: ApplicationProtocol.HTTPS,
    // No "externalTLS" property, so TLS is enabled externally by default
  },
  // ...
});

// OR

new RenderQueue(this, 'RenderQueue', {
  // ...
  trafficEncryption: {
    internalProtocol: ApplicationProtocol.HTTPS,
    externalTLS: {
      enabled: true,
    },
  },
  // ...
});

// OR

const certificate = // ...your ACM certificate
const certificateChain = // ...your ACM certificate chain
new RenderQueue(this, 'RenderQueue', {
  // ...
  trafficEncryption: {
    internalProtocol: ApplicationProtocol.HTTPS,
    externalTLS: {
      acmCertificate: certificate,
      acmCertificateChain: certificateChain,
    },
  },
  // ...
});

// OR

const certificate = // ...your X509 RFDK certificate
new RenderQueue(this, 'RenderQueue', {
  // ...
  trafficEncryption: {
    internalProtocol: ApplicationProtocol.HTTPS,
    externalTLS: {
      rfdkCertificate: certificate,
    },
  },
  // ...
});
```

</details>

<details><summary><b>Python</b> (click to expand)</summary>

```python
from aws_cdk.aws_elasticloadbalancingv2 import ApplicationProtocol
from aws_rfdk.deadline import (
    RenderQueue,
    RenderQueueExternalTLSProps,
    RenderQueueTrafficEncryptionProps,
)

RenderQueue(self, 'RenderQueue',
  # no "traffic_encryption" property, so TLS is enabled externally by default
  # ...
)

# OR

RenderQueue(self, 'RenderQueue',
  # ...
  traffic_encryption=RenderQueueTrafficEncryptionProps(
    internal_protocol=ApplicationProtocol.HTTPS,
    # No "external_tls" property, so TLS is enabled externally by default
  ),
  # ...
)

# OR

RenderQueue(self, 'RenderQueue',
  # ...
  traffic_encryption=RenderQueueTrafficEncryptionProps(
    internal_protocol=ApplicationProtocol.HTTPS,
    external_tls=RenderQueueExternalTLSProps(
      enabled=True,
    ),
  ),
  # ...
)

# OR

certificate = # ...your ACM certificate
certificate_chain = # ...your ACM certificate chain
RenderQueue(self, 'RenderQueue',
  # ...
  traffic_encryption=RenderQueueTrafficEncryptionProps(
    internal_protocol=ApplicationProtocol.HTTPS,
    external_tls=RenderQueueExternalTLSProps(
      acmCertificate=certificate,
      acmCertificateChain=certificate_chain,
    ),
  ),
  # ...
)

# OR

certificate = # ...your X509 RFDK certificate
RenderQueue(self, 'RenderQueue',
  # ...
  traffic_encryption=RenderQueueTrafficEncryptionProps(
    internal_protocol=ApplicationProtocol.HTTPS,
    external_tls=RenderQueueExternalTLSProps(
      rfdk_certificate=certificate,
    ),
  ),
  # ...
)
```

</details>


## Upgrading Farms Without Enabling Deadline Secrets Management

We highly recommend enabling Deadline Secrets Management on your render farm for the additional layer of security. However, if you would still like to upgrade your farm without enabling
Deadline Secrets Management, you can do so by setting the `secretsManagementSettings` property of the `Repository` construct:

**Typescript:**
```ts
const repository = new Repository(this, 'Repository', {
  vpc,
  version,
  secretsManagementSettings: {
    enabled: false,
  },
});
```

**Python:**
```python
repository = Repository(self, 'Repository',
  vpc=vpc,
  version=version,
  secrets_management_settings=SecretsManagementProps(
    enabled=False,
  ),
)
```

With this set, neither the `Repository` or `RenderQueue` constructs will attempt to configure Deadline Secrets Management for you.
