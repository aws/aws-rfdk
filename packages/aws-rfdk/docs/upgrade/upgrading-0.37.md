# Upgrading to RFDK v0.37.x or Newer

Starting in RFDK v0.37.0, the default for TLS between the render queue and its clients, which is configured using the `RenderQueueExternalTLSProps` interface that the `RenderQueue` construct takes as a part of its constructor props, is now set to be enabled.

## Upgrading Farms Already Using TLS

If you are already setting fields on the `RenderQueueExternalTLSProps` for the Render Queue, no action is required. Redeploying your render farm after upgrading your version of RFDK should have no effect.

## Upgrading Farms Not Using TLS

To upgrade your farm if it does not currently configure TLS for connections to the Render Queue, there are two options:

1. [Migrating to TLS](#migrating-to-tls) (recommended)
1. [Preserving plain HTTP](#preserving-plain-http)

### Migrating to TLS

#### RenderQueue Changes

Versions of RFDK prior to 0.37.0 had internal TLS between the load balancer and its backing services on by default. This is configurable with the `internalProtocol` field on the `RenderQueueTrafficEncryptionProps` interface. This default was left as-is, so upgrading RFDK will have no effect on the protocol those backing services were already using and they will not need to be replaced. The TLS being enabled by default is between the listener on the load balancer and any Deadline clients that are connecting to it, which is configurable with the `externalProtocol` property on the `RenderQueueTrafficEncryptionProps` interface.

There will be a few new constructs deployed to your farm:
1. A `PrivateHostedZone` will be created if you do not supply your own. We set the default domain to `aws-rfdk.com`, which we have registered and suggest that you use if you do not have your own registered domain. [RFC 6762](https://datatracker.ietf.org/doc/html/rfc6762#appendix-G) recommends against using any unregistered top-level domains.
1. A self-signed X509 certificate will be generated using OpenSSL and that will then be used to sign a certificate that the Render Queue will use for TLS. Specifically, the certificate will be passed to the Application Listener for the Application Load Balancer that the Render Queue creates. Additional details about how RFDK uses TLS can the built-in certificate management can be found in the developer guide for [Encryption in transit](https://docs.aws.amazon.com/rfdk/latest/guide/security-encrypt-in-transit.html).

These new constructs will require the Render Queue load balancer's listener to need replacing, but the load balancer itself and the backing services it redirects traffic to will not need to be changed.

#### WorkerInstanceFleet and SpotEventPluginFleet Changes

Since the endpoint and port the listener on the load balancer uses will be changed, and the TLS will require any clients connecting to verify its certificate, any stacks that contain dependencies on the Render Queue will first need to be destroyed. If you are using a tiered architecture similar to what we recommend in our documentation, this would include any `WorkerInstanceFleet` constructs or `SpotEventPluginFleet` and `ConfigureSpotEventPlugin` constructs. If you are not using a tiered architecture, we still recommend destroying these constructs since we're changing the endpoint that they need to connect to, and that configuration of the endpoint happens in the initialization script for an instance.

To perform the removal of these constructs:
1. Suspend any jobs that are being run by workers that the constructs deployed.
2. If you are using the `ConfigureSpotEventPlugin` and `SpotEventPluginFleet` constructs, then any spot fleets launched by the Spot Event Plugin will need to be terminated, since their lifecycle is controlled by Deadline's Spot Event Plugin and not your RFDK app. Trying to destroy/remove the `SpotEventPluginFleet` construct will fail if these hosts are left running because the spot instances use the security group that the construct creates.
3. Next we have to destroy the constructs that are deploying workers, which could be done in a few ways:
    1. If you can destroy the Stack that contains these constructs without destroying the rest of your app, then destroy it using the command `cdk destroy "ComputeTier"` (or whatever name you gave your stack).
    2. If you cannot destroy a single stack or you are not using a tiered architecture, you can just comment out these constructs in your app, rebuild it, and then run `cdk deploy "*"` to perform the removal.
4. Now that we won't cause any dependency issues, we can upgrade the version of RFDK and then run the deployment. If worker constructs were commented out in the last step, they can be added back in here and redeployed during the upgrade.
5. Any jobs that were paused can be resumed after the deployment is complete. Any workers deployed with the `WorkerInstanceFleet` should be connecting through TLS now, and the Spot Event Plugin should be configured so that any new Spot instances it deploys will be properly configured as well.

### Preserving plain HTTP

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
