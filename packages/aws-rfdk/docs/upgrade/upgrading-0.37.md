# Upgrading to RFDK v0.37.x or Newer

Starting in RFDK v0.37.0, the default for TLS between the render queue and its clients, which is configured using the `RenderQueueExternalTLSProps` interface that the `RenderQueue` construct takes as a part of its constructor props, is now set to be enabled.

## Upgrading Farms Already Using TLS

If you are already setting fields on the `RenderQueueExternalTLSProps` for the Render Queue, no action is required. Redeploying your render farm after upgrading your version of RFDK should have no effect.

## Upgrading Farms Not Using TLS

### RenderQueue Changes

Versions of RFDK prior to 0.37.0 had internal TLS between the load balancer and its backing services on by default. This is configurable with the `internalProtocol` field on the `RenderQueueTrafficEncryptionProps` interface. This default was left as-is, so upgrading RFDK will have no effect on the protocol those backing services were already using and they will not need to be replaced. The TLS being enabled by default is between the listener on the load balancer and any Deadline clients that are connecting to it, which is configurable with the `externalProtocol` property on the `RenderQueueTrafficEncryptionProps` interface.

There will be a few new constructs deployed to your farm:
1. A `PrivateHostedZone` will be created if you do not supply your own. We set the default domain to `aws-rfdk.com`, which we have registered and suggest that you use if you do not have your own registered domain. [RFC 6762](https://datatracker.ietf.org/doc/html/rfc6762#appendix-G) recommends against using any unregistered top-level domains.
1. A self-signed X509 certificate will be generated using OpenSSL and that will then be used to sign a certificate that the Render Queue will use for TLS. Specifically, the certificate will be passed to the Application Listener for the Application Load Balancer that the Render Queue creates. Additional details about how RFDK uses TLS can the built-in certificate management can be found in the developer guide for [Encryption in transit](https://docs.aws.amazon.com/rfdk/latest/guide/security-encrypt-in-transit.html).

These new constructs will require the Render Queue load balancer's listener to need replacing, but the load balancer itself and the backing services it redirects traffic to will not need to be changed.

### WorkerInstanceFleet Changes

Since the endpoint and port the listener on the load balancer uses will be changed, and the TLS will require any clients connecting to verify its certificate, any stacks that contain dependencies on the Render Queue will first need to be destroyed. If you are using a tiered architecture similar to what we recommend in our documentation, this would include any `WorkerInstanceFleet` constructs that are in a separate stack from the `RenderQueue`. The `WorkerInstanceFleet` constructs configure their connection to the Render Queue during their start-up. Running `cdk destroy "ComputeTier"` (or whatever name you gave your stack containing the workers) to destroy any worker fleets before running `cdk deploy "*"` to redeploy the entire farm should

The script used to initialize any workers deployed by the farm will also be updated to change the endpoint and port that they use to connect to the Render Queue, and the workers will also need the certificate chain to verify the load balancer (in the default case the cerificate chain only includes the self-signed certificate).

## Disabling External TLS

While we strongly suggest farms be upgraded to use TLS, it is possible to override the new default and keep a farm using HTTP instead. To do this, there is an `enabled` field on the `RenderQueueExternalTLSProps` that can be set to false. This will prevent the farm from automatically upgrading the protocol until you decide you're ready. Here's an example of creating a Render Queue with TLS disabled:

```ts
new RenderQueue(this, 'RenderQueue', {
  vpc,
  images,
  repository,
  version,
  trafficEncryption: {
    externalTLS: { enabled: false },
  },
});
```
