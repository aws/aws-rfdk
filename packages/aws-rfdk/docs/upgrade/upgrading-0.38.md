# Upgrading to RFDK v0.38.x or Newer

Starting in RFDK v0.38.0, [Deadline Secrets Management](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html) will be enabled on the
`Repository` and `RenderQueue` constructs by default when using Deadline 10.1.19 and later. This can cause some issues with existing farm configurations because Deadline Secrets Management requires:

- The internal protocol on the Render Queue to be HTTPS ("internal" refers to traffic between the Deadline Remote Connection Server and the Render Queue's load balancer)
- The external protocol on the Render Queue to be HTTPS ("external" refers to traffic between the Render Queue's load balancer and clients)

Additionally, if you plan on upgrading to RFDK 0.38 or newer and Deadline 10.1.19 or newer, but do **not** want to enable Deadline Secrets Management, you may have to make changes to your RFDK application so that
RFDK does not automatically configure Deadline Secrets Management on your farm.

## Upgrading RFDK and Enabling Deadline Secrets Management

---

_This section describes how to upgrade your RFDK farm while also enabling Deadline Secrets Management. If you would **not** like to enable Deadline Secrets Management, please skip to the
next section "Upgrading RFDK Without Enabling Deadline Secrets Management"._

---

The first step to making sure you are ready to enable Deadline Secrets Management is to make sure you have HTTPS enabled on the `RenderQueue` for both the internal and external protocols.
If you are upgrading from a version prior to 0.37, you should refer to the [v0.37 upgrade documentation](./upgrading-0.37.md) for details about how the `RenderQueue` will default to using HTTPS.

Your `RenderQueue` will use HTTPS for both internal and external protocols for RFDK 0.38.0 if **EITHER** of the following are true:

1. You **HAVE NOT** specified the `trafficEncryption` (TypeScript) / `traffic_encryption` (Python) property
1. You **HAVE** specified the `trafficEncryption` (TypeScript) / `traffic_encryption` (Python) property **AND BOTH of the following are true**:
    1. **EITHER** of the following are true:
        1. You **HAVE NOT** specified the `trafficEncryption.internalProtocol` (TypeScript) / `traffic_encryption.internal_protocol` (Python)
        1. You **HAVE** specified the `trafficEncryption.internalProtocol` (TypeScript) / `traffic_encryption.internal_protocol` (Python) and it is set to `ApplicationProtocol.HTTPS`
    1. **EITHER** of the following are true:
        1. You **HAVE NOT** specified the `trafficEncryption.externalTLS` (TypeScript) / `traffic_encryption.external_tls` (Python)
        1. You **HAVE NOT** specified `trafficEncryption.externalTLS.enabled` (TypeScript) / `traffic_encryption.external_tls.enabled` (Python)
        1. You **HAVE** specified `trafficEncryption.externalTLS.enabled` (TypeScript) / `traffic_encryption.external_tls.enabled` (Python) and it is set to `true` (TypeScript) / `True` (Python)

The below example code snippets demonstrate what each case above may look like:

<details><summary><b>Typescript</b> (click to expand)</summary>

```ts
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import { RenderQueue } from 'aws-rfdk/deadline';

new RenderQueue(this, 'RenderQueue', {
  // no "trafficEncryption" property, so TLS is enabled both internally and externally by default
  // ...
});

// OR

new RenderQueue(this, 'RenderQueue', {
  // ...
  trafficEncryption: {
    // No "internalProtocol" property, so TLS is enabled internally by default
    // No "externalTLS" property, so TLS is enabled externally by default
  },
  // ...
});

// OR

new RenderQueue(this, 'RenderQueue', {
  // ...
  trafficEncryption: {
    // No "internalProtocol" property, so TLS is enabled internally by default
    externalTLS: {
      // No "enabled" property, so external TLS will be enabled by default
    },
  },
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
  # no "trafficEncryption" property, so TLS is enabled both internally and externally by default
  # ...
)

# OR

RenderQueue(self, 'RenderQueue',
  # ...
  traffic_encryption=RenderQueueTrafficEncryptionProps(
    # No "internal_protocol" property, so TLS is enabled internally by default
    # No "external_tls" property, so TLS is enabled externally by default
  ),
  # ...
)

# OR

RenderQueue(self, 'RenderQueue',
  # ...
  traffic_encryption=RenderQueueTrafficEncryptionProps(
    # No "internal_protocol" property, so TLS is enabled internally by default
    external_tls=RenderQueueExternalTLSProps(
      # No "enabled" property, so external TLS will be enabled by default
    ),
  ),
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

If you have determined that your `RenderQueue` will use HTTPS for both internal and external protocols in RFDK 0.38.0, then all you need to do to enable Deadline Secrets Management is to upgrade
your RFDK application to use RFDK `0.38.x` and Deadline `10.1.19.x` or higher and re-deploy.


## Upgrading RFDK Without Enabling Deadline Secrets Management

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
