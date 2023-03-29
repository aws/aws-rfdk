# Upgrading to RFDK v0.40.x or Newer

## SpotEventPluginFleet

Starting in RFDK v0.40.0, the `SpotEventPluginFleet` construct now creates an [EC2 Launch Template](https://docs.aws.amazon.com/autoscaling/ec2/userguide/LaunchTemplates.html)
instead of using Launch Specifications. This change will reconfigure the Spot Event Plugin settings in Deadline to use a new Spot Fleet Request configuration. If you have active
Spot Fleet Requests created by the Spot Event Plugin, upgrading to RFDK v0.40.x and redeploying your render farm will orphan those Spot Fleet Requests. Therefore, we highly
recommend following these instructions to upgrade to RFDK v0.40.x:

1. Disable the Spot Event Plugin in Deadline. Refer to the [Spot Event Plugin "State" option in Deadline](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/event-spot-configuration-options.html)
for more information.
2. Cancel any Spot Fleet Requests created by the Spot Event Plugin, which you can do by following these [instructions](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/work-with-spot-fleets.html#cancel-spot-fleet).
3. Upgrade to RFDK v0.40.x and redeploy your render farm.
4. Once the deployment is complete, re-enable the Spot Event Plugin in Deadline. Refer to the [Spot Event Plugin "State" option in Deadline](https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/event-spot-configuration-options.html)
for more information.

## Replacing IResource with IConstruct

The `HealthMonitor` and `WorkerInstanceFleet` constructs are now implementing the `IConstruct` interface rather than the `IResource` interface. The effect of this is a that the `stack` and `env` properties are now no longer available as properties on the constructs. The `stack` is still accessible by using the CDK's `Stack.of()` method, and the `env` is then a property on that.

The following is an example of how to access the `stack` and `env` off a WorkerInstanceFleet:

<details><summary><b>Typescript</b> (click to expand)</summary>

```ts
const workerFleet = new WorkerInstanceFleet(this, 'WorkerFleet', {
  // ...
});
const workerStack = Stack.of(workerFleet);
const env: ResourceEnvironment = {
  account: workerStack.account,
  region: workerStack.region,
};
```

</details>

<details><summary><b>Python</b> (click to expand)</summary>

```python
worker_fleet = WorkerInstanceFleet(self, 'WorkerFleet', {
    // ...
})
worker_stack = Stack.of(worker_fleet)
env = ResourceEnvironment(
    account=worker_stack.account,
    region=worker_stack.region,
)

```

</details>