# Upgrading to RFDK v0.40.x or Newer

Starting in RFDK v0.40.0, the `SpotEventPluginFleet` construct now creates an [EC2 Launch Template](https://docs.aws.amazon.com/autoscaling/ec2/userguide/LaunchTemplates.html)
instead of using Launch Specifications. This change will reconfigure the Spot Event Plugin settings in Deadline to use a new Spot Fleet Request configuration. If you have active
Spot Fleet Requests created by the Spot Event Plugin, upgrading to RFDK v0.40.x and redeploying your render farm will orphan those Spot Fleet Requests. Therefore, we highly
recommend following these instructions to upgrade to RFDK v0.40.x:

1. Disable the Spot Event Plugin in Deadline. Refer to the [Spot Event Plugin "State" option in Deadline](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot-configuration-options.html)
for more information.
2. Cancel any Spot Fleet Requests created by the Spot Event Plugin, which you can do by following these [instructions](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/work-with-spot-fleets.html#cancel-spot-fleet).
3. Upgrade to RFDK v0.40.x and redeploy your render farm.
4. Once the deployment is complete, re-enable the Spot Event Plugin in Deadline. Refer to the [Spot Event Plugin "State" option in Deadline](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot-configuration-options.html)
for more information.
