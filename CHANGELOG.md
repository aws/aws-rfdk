# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.38.0](https://github.com/aws/aws-rfdk/compare/v0.37.0...v0.38.0) (2021-10-25)


### Supported CDK Version

* [1.129.0](https://github.com/aws/aws-cdk/releases/tag/v1.129.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.19.4](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### ⚠ BREAKING CHANGES

RFDK will configure Deadline Secrets Management automatically when using Deadline 10.1.19.x or higher. If your CDK app uses the `Repository` construct with an un-pinned [`VersionQuery`](https://docs.aws.amazon.com/rfdk/api/latest/docs/aws-rfdk.deadline.VersionQuery.html), then upgrading RFDK set up Deadline Secrets Management. Using Deadline Secrets Management is strongly encouraged for securing Deadline render farms, however it can potentially impact your workflows within Deadline. Please review the [Deadline Secrets Management documentation](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html) to learn about the feature.

See the [RFDK 0.38.x upgrade documentation](https://github.com/aws/aws-rfdk/blob/v0.38.0/packages/aws-rfdk/docs/upgrade/upgrading-0.38.md)
for more details and guidance on how to upgrade.

### Features

* **deadline:** add Deadline Secrets Management integration in the Render Queue ([#528](https://github.com/aws/aws-rfdk/issues/528)) ([48baa18](https://github.com/aws/aws-rfdk/commit/48baa185b274030cab29a235469536585822313f))
* **deadline:** add Secret Management support for Repository ([#514](https://github.com/aws/aws-rfdk/issues/514)) ([8c7dda6](https://github.com/aws/aws-rfdk/commit/8c7dda6deaa826e2efec379c9bf67b30fce02a89))
* **deadline:** configure identity registration settings for deadline clients ([#576](https://github.com/aws/aws-rfdk/issues/576)) ([b9082b2](https://github.com/aws/aws-rfdk/commit/b9082b2014d3817c9eb9b3ecba1d2aaa54382074))
* **deadline:** validate minimum Deadline version for secrets management ([#573](https://github.com/aws/aws-rfdk/issues/573)) ([6d5950e](https://github.com/aws/aws-rfdk/commit/6d5950e892d2a83ab11db247d33f8a5de22d360c))
* **examples:** add deadline secrets management options to basic example app ([#562](https://github.com/aws/aws-rfdk/issues/562)) ([bd31a8d](https://github.com/aws/aws-rfdk/commit/bd31a8d6b748d6a4e242a0528addd42a71d2d55f))
* **examples:** use dedicated subnets in All-In-AWS-Infrastructure-Basic example ([#598](https://github.com/aws/aws-rfdk/issues/598)) ([7aaec14](https://github.com/aws/aws-rfdk/commit/7aaec14db8fe8a9055d3672493d314b3d4127d09))


### Bug Fixes

* **deadline:** allow traffic from RenderQueue to UsageBasedLicensing ([#617](https://github.com/aws/aws-rfdk/issues/617)) ([dfbf88f](https://github.com/aws/aws-rfdk/commit/dfbf88f6478c30e0dec2d0939473f02268f669d9))
* **deadline:** fix issue in client TLS configuration for Deadline 10.1.18 ([#543](https://github.com/aws/aws-rfdk/issues/543)) ([05b14f9](https://github.com/aws/aws-rfdk/commit/05b14f9ed5810d876c3a3df0293cb81531e833f5))
* **deadline:** reinstall repository even if version is not changed ([821bab2](https://github.com/aws/aws-rfdk/commit/821bab291da27b226f74d4a9c5a01f1189cfb5e4))


## [0.37.0](https://github.com/aws/aws-rfdk/compare/v0.36.0...v0.37.0) (2021-08-05)


### Supported CDK Version

* [1.116.0](https://github.com/aws/aws-cdk/releases/tag/v1.116.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.17.4](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### ⚠ BREAKING CHANGES

* **deadline:** MountableEfs will not work with the Repository construct when
created with an imported EFS Access Point
* **deadline:** Farms currently not configured to use external TLS on
the Render Queue will be modified to have it enabled and using the
default certificate and hosted zone. To keep external TLS disabled, the
`enabled` flag on the `RenderQueueExternalTLSProps` can be set to false;
however, we strongly encourage you to enable TLS. See the [RFDK 0.37.x upgrade documentation](https://github.com/aws/aws-rfdk/blob/v0.37.0/packages/aws-rfdk/docs/upgrade/upgrading-0.37.md)
for more details and guidance on how to upgrade.

### Features

* **core:** add FSx for Lustre integration ([#461](https://github.com/aws/aws-rfdk/issues/461)) ([bf5bbb9](https://github.com/aws/aws-rfdk/commit/bf5bbb99d195c5aebd4ba1a4ce2c42bc1436f905))
* **deadline:** use TLS between RenderQueue and clients by default ([#491](https://github.com/aws/aws-rfdk/issues/491)) ([1e3eb63](https://github.com/aws/aws-rfdk/commit/1e3eb63212575a8bd581af7f1832df1b95ab75e0)), closes [#490](https://github.com/aws/aws-rfdk/issues/490)


### Documentation

* add construct architecture diagrams ([#508](https://github.com/aws/aws-rfdk/pull/508)) ([b83c0e0](https://github.com/aws/aws-rfdk/commit/b83c0e0823ef94e9df44112e194bc1bb2bf9e25a))

## [0.36.0](https://github.com/aws/aws-rfdk/compare/v0.35.0...v0.36.0) (2021-07-09)

---

**NOTICE:**  This release drops support for NodeJS 10.x and expands support to include NodeJS 16.x ([#459](https://github.com/aws/aws-rfdk/issues/459)) ([5226b9a](https://github.com/aws/aws-rfdk/commit/5226b9ac9d8303c0ae2a7fe33d0cb985aa227758))

---

### Supported CDK Version

* [1.111.0](https://github.com/aws/aws-cdk/releases/tag/v1.111.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.17.4](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **deadline:** create Deadline Groups and Pools on deploy for ConfigureSpotEventPlugin ([#470](https://github.com/aws/aws-rfdk/issues/470)) ([b35ed6d](https://github.com/aws/aws-rfdk/commit/b35ed6d48ca2b1d01152ddc435532a1bb6d70cdb))
* **examples:** local zones examples ([#314](https://github.com/aws/aws-rfdk/issues/314)) ([1fe72a0](https://github.com/aws/aws-rfdk/commit/1fe72a045569aa688d0d28bbda6fbf67af003e5e))


### Bug Fixes

* **core:** Convert group names in SpotEventPluginFleet to lowercase ([#465](https://github.com/aws/aws-rfdk/issues/465)) ([11e30f6](https://github.com/aws/aws-rfdk/commit/11e30f6125b06826e1465a21d7562baa980a00dc))

## [0.35.0](https://github.com/aws/aws-rfdk/compare/v0.34.0...v0.35.0) (2021-06-18)


### Supported CDK Version

* [1.108.1](https://github.com/aws/aws-cdk/releases/tag/v1.108.1)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.16.8](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Bug Fixes

* **core:** increase lambda timeout for X509Certificate* constructs ([#476](https://github.com/aws/aws-rfdk/issues/476)) ([7b33b21](https://github.com/aws/aws-rfdk/commit/7b33b21b4ec92ddf3429ed777d9aea42a09fd79b))
* **core:** increase timeout for AcmCertificateImporter ([#464](https://github.com/aws/aws-rfdk/issues/464)) ([18a8098](https://github.com/aws/aws-rfdk/commit/18a8098944f3599446c0f319eaf46b383724cfc3))

## [0.34.0](https://github.com/aws/aws-rfdk/compare/v0.33.0...v0.34.0) (2021-06-16)


### Supported CDK Version

* [1.108.1](https://github.com/aws/aws-cdk/releases/tag/v1.108.1)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.16.8](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **deadline:** add ability to horizontally scale the RenderQueue ([#301](https://github.com/aws/aws-rfdk/issues/301)) ([8a55f32](https://github.com/aws/aws-rfdk/commit/8a55f32124e2cfbadb33437d2d0494580a9eebac))

## [0.33.0](https://github.com/aws/aws-rfdk/compare/v0.32.0...v0.33.0) (2021-06-01)


### Supported CDK Version

* [1.106.1](https://github.com/aws/aws-cdk/releases/tag/v1.106.1)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.15.2](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Bug Fixes

* **core:** improve security of mongodb setup script ([#445](https://github.com/aws/aws-rfdk/issues/445)) ([9148f25](https://github.com/aws/aws-rfdk/commit/9148f25c9864b6f09d53065b4ff4be74299f40f1))
* **deadline:** allow zero-sized WorkerInstanceFleet ([#451](https://github.com/aws/aws-rfdk/issues/451)) ([0cc6723](https://github.com/aws/aws-rfdk/commit/0cc67238645e24805590412776d262c8e6b9ec49))
* **deadline:** use IMDSv2 endpoint in Repository scripting ([#436](https://github.com/aws/aws-rfdk/issues/436)) ([e7eddea](https://github.com/aws/aws-rfdk/commit/e7eddea0c37b143b2eed7db7ed62a42960cac95e))

## [0.32.0](https://github.com/aws/aws-rfdk/compare/v0.31.0...v0.32.0) (2021-05-17)


### Supported CDK Version

* [1.104.0](https://github.com/aws/aws-cdk/releases/tag/v1.104.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.15.2](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)

## [0.31.0](https://github.com/aws/aws-rfdk/compare/v0.30.0...v0.31.0) (2021-05-11)


### Supported CDK Version

* [1.102.0](https://github.com/aws/aws-cdk/releases/tag/v1.102.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.15.2](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Bug Fixes

* **core:** added securty group property to HealthMonitor ([#408](https://github.com/aws/aws-rfdk/issues/408)) ([c2ed9e7](https://github.com/aws/aws-rfdk/commit/c2ed9e71e1bf60b01cee4621ac088d7cc08a7bbe))

## [0.30.0](https://github.com/aws/aws-rfdk/compare/v0.29.0...v0.30.0) (2021-04-21)


### Supported CDK Version

* [1.99.0](https://github.com/aws/aws-cdk/releases/tag/v1.99.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.14.5](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **core:** add ability to resolve mount targets using EFS API ([#392](https://github.com/aws/aws-rfdk/issues/392)) ([726fa84](https://github.com/aws/aws-rfdk/commit/726fa848b6362b226e78aff9eec2c2544bc2aa74))
* **deadline:** add ability to import repository settings ([#395](https://github.com/aws/aws-rfdk/issues/395)) ([c55c078](https://github.com/aws/aws-rfdk/commit/c55c078f02b4b43c115abc09b77b8cd469ac9ccd))
* **deadline:** add security group property to ubl ([#396](https://github.com/aws/aws-rfdk/issues/396)) ([cf44a13](https://github.com/aws/aws-rfdk/commit/cf44a1364e8c732700b4d24e322b34a3c6444b7c))

## [0.29.0](https://github.com/aws/aws-rfdk/compare/v0.28.0...v0.29.0) (2021-04-06)


### Supported CDK Version

* [1.96.0](https://github.com/aws/aws-cdk/releases/tag/v1.96.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.14.5](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### ⚠ BREAKING CHANGES

* **deps:** CDK v1.96.0 modifies the API for DocumentDB DatabaseCluster. See
our examples for an illustration of the code update required.
* **core:** Stacks set up like our examples will see an error regarding being unable to
 delete an export in use when deploying a stack update. To bypass, use the `-e` option of `cdk deploy`
 to deploy each stack downstream of the Mountable's stack before updating the Mountable's stack. E.g:

      cdk deploy -e ComputeTier
      cdk deploy -e ServiceTier
      cdk deploy -e StorageTier

### Features

* **core:** add PadEfsStorage construct ([#365](https://github.com/aws/aws-rfdk/issues/365)) ([c6334b6](https://github.com/aws/aws-rfdk/commit/c6334b6659f6892a1ba8e08f63db7334fcd6d690))
* **deadline:** add option to the RenderQueue to use cachefilesd ([#367](https://github.com/aws/aws-rfdk/issues/367)) ([901b749](https://github.com/aws/aws-rfdk/commit/901b749b11a8de51797fc822c35447591f4bbe44))
* **examples:** Demonstrate how to send an email alarm when EFS burst credits below a threshold ([#373](https://github.com/aws/aws-rfdk/issues/373)) ([cc5d372](https://github.com/aws/aws-rfdk/commit/cc5d372026a5b6c72d6285867af762e6200b5431))


### Bug Fixes

* **core:** Move mountable's asset to scope of target ([#369](https://github.com/aws/aws-rfdk/issues/369)) ([cb16918](https://github.com/aws/aws-rfdk/commit/cb16918dafd0d3caf93fed2a01b791e9281b602d))
* **deadline:** Relax UsageBasedLicensing.grantPortAccess() to IConnectable ([#352](https://github.com/aws/aws-rfdk/issues/352)) ([9f05768](https://github.com/aws/aws-rfdk/commit/9f0576856f949090658c7a14e79e02f081516b80))
* **integ:** capture exit codes of parallel tests ([#371](https://github.com/aws/aws-rfdk/issues/371)) ([276f76f](https://github.com/aws/aws-rfdk/commit/276f76f3fc1b9422a052642a1e11b1afe400af91))

## [0.28.0](https://github.com/aws/aws-rfdk/compare/v0.27.0...v0.28.0) (2021-03-25)


### Supported CDK Version

* [1.94.1](https://github.com/aws/aws-cdk/releases/tag/v1.94.1)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.14.5](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **examples:** added ec2 image builder example ([#292](https://github.com/aws/aws-rfdk/issues/292)) ([2375439](https://github.com/aws/aws-rfdk/commit/2375439abb39a29ec4ab40a27dadb18b44fcfc28))


### Bug Fixes

* **deadline:** Windows Workers fail to deploy waiting for Deadline launcher service to restart ([#354](https://github.com/aws/aws-rfdk/issues/354)) ([a508ebb](https://github.com/aws/aws-rfdk/commit/a508ebb7828feb68599cd9d04c10cbe42decb64b)), closes [#353](https://github.com/aws/aws-rfdk/issues/353) [#312](https://github.com/aws/aws-rfdk/issues/312)

## [0.27.0](https://github.com/aws/aws-rfdk/compare/v0.26.0...v0.27.0) (2021-03-12)


### Supported CDK Version

* [1.91.0](https://github.com/aws/aws-cdk/releases/tag/v1.91.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.14.4](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Security Notice

RFDK version 0.27.x and later include security enhancements.  We recommend you upgrade RFDK and Deadline to further restrict the permissions required for RFDK & Deadline to function. Please upgrade the version of RFDK used in your CDK application to 0.27.x, and configure your application to deploy Deadline 10.1.14.x or later to resolve the issue.

If you have an existing deployment that was built with RFDK versions 0.26.x or earlier, you will need to upgrade to RFDK 0.27.x and Deadline 10.1.14.x or later before June 10, 2021 @ 1:00PM PST/ 3:00PM CST/ 4:00PM EST. Failure to upgrade by the above date may result in disruptions to your render farm. If you have any questions, please contact AWS Thinkbox Customer Support at https://support.thinkboxsoftware.com/.

### ⚠ BREAKING CHANGES

- If your application provides an EFS file-system to a Repository construct, it must now also pass an
  [EFS Access Point](https://docs.aws.amazon.com/efs/latest/ug/efs-access-points.html). See the [RFDK 0.27.x upgrade documentation](https://github.com/aws/aws-rfdk/blob/v0.27.0/packages/aws-rfdk/docs/upgrade/upgrading-0.27.md)
  for details.

### Features

* **core:** make cloudwatch agent install optional ([#338](https://github.com/aws/aws-rfdk/issues/338)) ([ac052ea](https://github.com/aws/aws-rfdk/commit/ac052ea67ab90e8c6ac18af71a950b20c68a24f1))
* **core:** add ability to use EFS access points ([#339](https://github.com/aws/aws-rfdk/issues/339)) ([544496c](https://github.com/aws/aws-rfdk/commit/544496cb67b3880fc187716a33ebeca595c108d7))
* **deadline:** add ability to use EFS access points ([#339](https://github.com/aws/aws-rfdk/issues/339)) ([544496c](https://github.com/aws/aws-rfdk/commit/544496cb67b3880fc187716a33ebeca595c108d7))


## [0.26.0](https://github.com/aws/aws-rfdk/compare/v0.25.0...v0.26.0) (2021-03-01)


### Supported CDK Version

* [1.91.0](https://github.com/aws/aws-cdk/releases/tag/v1.91.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.13.2](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **core:** add vpcSubnets prop to HealthMonitor ([#310](https://github.com/aws/aws-rfdk/issues/310)) ([12b6d89](https://github.com/aws/aws-rfdk/commit/12b6d89503fafdb645c5721d3b07d301fcd72521)), closes [#305](https://github.com/aws/aws-rfdk/issues/305)
* **deadline:** add ConfigureSpotEventPlugin and SpotEventPluginFleet constructs ([#279](https://github.com/aws/aws-rfdk/issues/279)) ([b418e8a](https://github.com/aws/aws-rfdk/commit/b418e8a6857b7ee46a2fd984acb3f642231b6273))
* **deadline:** add security group configuration for Repository and RenderQueue ([#319](https://github.com/aws/aws-rfdk/issues/319)) ([b7a43d6](https://github.com/aws/aws-rfdk/commit/b7a43d679be00ff4fc228ae0ee5bc3c6685a6025))


### Bug Fixes

* **deadline:** VersionQuery cross-stack issue ([#306](https://github.com/aws/aws-rfdk/issues/306)) ([e6bb60d](https://github.com/aws/aws-rfdk/commit/e6bb60dc5cb186dca16b70daf4990e845b2825e1))
* **examples:** Fix errors in MongoDB Python example ([#322](https://github.com/aws/aws-rfdk/issues/322)) ([e1bfc79](https://github.com/aws/aws-rfdk/commit/e1bfc79b11c685d140057b7f58adcf49bfad23ab))
* **integ:** Ignore unbound RUN_TESTS_IN_PARALLEL variable ([#326](https://github.com/aws/aws-rfdk/issues/326)) ([76edf55](https://github.com/aws/aws-rfdk/commit/76edf559be8c4873403fe0938319f11612bb078a))

## [0.25.0](https://github.com/aws/aws-rfdk/compare/v0.24.0...v0.25.0) (2021-01-28)


### Supported CDK Version

* [1.86.0](https://github.com/aws/aws-cdk/releases/tag/v1.86.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.13.1](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **deadline:** add ThinkboxDockerImages construct ([#278](https://github.com/aws/aws-rfdk/issues/278)) ([9ea3bb4](https://github.com/aws/aws-rfdk/commit/9ea3bb47c97de4332edc1ce368dfbabff98be1a1))

## [0.24.0](https://github.com/aws/aws-rfdk/compare/v0.23.0...v0.24.0) (2021-01-26)


### Supported CDK Version

* [1.86.0](https://github.com/aws/aws-cdk/releases/tag/v1.86.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.12.1](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Bug Fixes

* **core:** windows cloudwatch agent install script ([#296](https://github.com/aws/aws-rfdk/issues/296)) ([478afce](https://github.com/aws/aws-rfdk/commit/478afce43c2a8460cc19f478c54d84b2691b6ebd)), closes [#295](https://github.com/aws/aws-rfdk/issues/295)

## [0.23.0](https://github.com/aws/aws-rfdk/compare/v0.22.0...v0.23.0) (2021-01-08)


### Supported CDK Version

* [1.83.0](https://github.com/aws/aws-cdk/releases/tag/v1.83.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.12.1](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **core:** Addition of SessionManagerHelper ([#266](https://github.com/aws/aws-rfdk/issues/266)) ([08bd333](https://github.com/aws/aws-rfdk/commit/08bd333d65ac8821812fdd15520f8b3ff6a0c6dc)), closes [#265](https://github.com/aws/aws-rfdk/issues/265)
* **deadline:** allow providing subnets for RenderQueue's ALB ([#264](https://github.com/aws/aws-rfdk/issues/264)) ([53088fb](https://github.com/aws/aws-rfdk/commit/53088fb788851cb8132dacfea77562951f1d89ca))

## [0.22.0](https://github.com/aws/aws-rfdk/compare/v0.21.0...v0.22.0) (2020-12-16)


### Supported CDK Version

* [1.78.0](https://github.com/aws/aws-cdk/releases/tag/v1.78.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.12.1](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **deadline:** configure worker listener port ([#257](https://github.com/aws/aws-rfdk/issues/257)) ([6e518d4](https://github.com/aws/aws-rfdk/commit/6e518d4c9e85f53edfba4a9f8f97d7712d882fe1)), closes [#190](https://github.com/aws/aws-rfdk/issues/190)


### Bug Fixes

* **deadline:** Improve error message when querying non-existant Deadline version ([#262](https://github.com/aws/aws-rfdk/issues/262)) ([cabdb58](https://github.com/aws/aws-rfdk/commit/cabdb58efbaa152de94d83702d357da951c98204))

## [0.21.0](https://github.com/aws/aws-rfdk/compare/v0.20.0...v0.21.0) (2020-11-27)


### Supported CDK Version

* [1.75.0](https://github.com/aws/aws-cdk/releases/tag/v1.75.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.11.5](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **core:** Add configurable expiry to X.509 certificates ([#242](https://github.com/aws/aws-rfdk/issues/242)) ([ae7c153](https://github.com/aws/aws-rfdk/commit/ae7c1536c009909fe72e45385e56271d3b1cab0e))
* **deadline:** add custom user data commands to Worker instance startup ([#239](https://github.com/aws/aws-rfdk/issues/239)) ([bdef391](https://github.com/aws/aws-rfdk/commit/bdef391df283864bbb0d05dea1e094785c333b33))
* **examples:**  Added examples for Spot Event Plugin Deployment ([#180](https://github.com/aws/aws-rfdk/issues/180)) ([49e22bf](https://github.com/aws/aws-rfdk/commit/49e22bff5e89164e3f1daeeb24088e5112c7f8d8))
* **integ:** use configurable version of Deadline for integration tests ([#160](https://github.com/aws/aws-rfdk/issues/160)) ([263021c](https://github.com/aws/aws-rfdk/commit/263021c1116ed81e091a7e9363122ace14e81e84))


### Bug Fixes

* **deadline:** bad file path for Repository when using VersionQuery ([#252](https://github.com/aws/aws-rfdk/issues/252)) ([84a20de](https://github.com/aws/aws-rfdk/commit/84a20de3f3e9fc49017626f2233929cf03d2e277))
* **deadline:** Fix cyclic stack dependency when using UBL ([#246](https://github.com/aws/aws-rfdk/issues/246)) ([12f7db2](https://github.com/aws/aws-rfdk/commit/12f7db23cf18e71fb0fa4c7657fbe9f5455ac4f4))
* **deadline:** lock down DocDC engine to version 3.6.0 ([#230](https://github.com/aws/aws-rfdk/issues/230)) ([2f46944](https://github.com/aws/aws-rfdk/commit/2f46944ff35123a828be30a7bdf9e7e0ca944b14))
* **deadline:** Launcher restarts Workers reliably. RFDK assumed Workers connected to the Deadline Render Queue when configuring them ([#248](https://github.com/aws/aws-rfdk/issues/248)) ([dfdbda5](https://github.com/aws/aws-rfdk/commit/dfdbda518c43b981eb3835b23592896817b984cb))

## [0.20.0](https://github.com/aws/aws-rfdk/compare/v0.19.0...v0.20.0) (2020-11-10)


### Supported CDK Version

* [1.72.0](https://github.com/aws/aws-cdk/releases/tag/v1.72.0)


### Officially Supported Deadline Versions

* [10.1.9.2 to 10.1.11.5](https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/release-notes.html)


### Features

* **deadline:** add WorkerInstanceConfiguration construct ([#209](https://github.com/aws/aws-rfdk/issues/209)) ([bbb82b0](https://github.com/aws/aws-rfdk/commit/bbb82b0d1c68477d82e72420dc4fff7e0dd2f17b))
* **deadline:** versionquery construct ([#175](https://github.com/aws/aws-rfdk/issues/175)) ([78dcd86](https://github.com/aws/aws-rfdk/commit/78dcd860e6743094e123c12d8e7313e4d19af5a0)), closes [#176](https://github.com/aws/aws-rfdk/issues/176)

## [0.19.0](https://github.com/aws/aws-rfdk/compare/v0.18.1...v0.19.0) (2020-10-28)


### Supported CDK Version

* [1.70.0](https://github.com/aws/aws-cdk/releases/tag/v1.70.0)

### Bug Fixes

* **deadline:** Incorrect Usage Based Licensing ports for Katana and Maxwell. ([e648711](https://github.com/aws/aws-rfdk/commit/e6487119444ccfef6fef26f17e47260522fbc292))

### [0.18.1](https://github.com/aws/aws-rfdk/compare/v0.18.0...v0.18.1) (2020-10-16)


### Bug Fixes

* **deadline:** remove requirement of aws-sdk in stage-deadline ([3b66c1b](https://github.com/aws/aws-rfdk/commit/3b66c1bd10ff604fdb8523d71097b674b6795520))
* **deadline:** use HTTPS to download index ([c626ba9](https://github.com/aws/aws-rfdk/commit/c626ba945005c841d5f46a45c917e040248b8e93))

## [0.18.0](https://github.com/aws/aws-rfdk/compare/v0.17.0...v0.18.0) (2020-10-13)


### Features

* **bin:** Add simpler way to invoke stage-deadline ([#90](https://github.com/aws/aws-rfdk/issues/90)) ([cb68992](https://github.com/aws/aws-rfdk/commit/cb68992de1c72f7997de6ff81f1b0c09e88dacaf))
* **deadline:** add ability to add spot event plugin managed policies to RenderQueue ([#141](https://github.com/aws/aws-rfdk/issues/141)) ([b2cf9e0](https://github.com/aws/aws-rfdk/commit/b2cf9e0cd8264b106e8f705f379181beb6916653))
* **integ:** add ability to use hook function before each component test  ([#155](https://github.com/aws/aws-rfdk/issues/155)) ([792586e](https://github.com/aws/aws-rfdk/commit/792586eeb5befedbe810ca6a91867ed006c029f0))
* Update stage-deadline script with new version index  ([#139](https://github.com/aws/aws-rfdk/issues/139)) ([9cbf99f](https://github.com/aws/aws-rfdk/commit/9cbf99f1a1f2effbfe85ab0ecbdcaecd418056db))


### Bug Fixes

* allowing empty log group prefixes ([#87](https://github.com/aws/aws-rfdk/issues/87)) ([e53571c](https://github.com/aws/aws-rfdk/commit/e53571c7d249f8efb81517af7031f264d0baf1d2))
* **core:** Remove encryption on lifecycle SNS Topic ([#163](https://github.com/aws/aws-rfdk/issues/163)) ([5b663ca](https://github.com/aws/aws-rfdk/commit/5b663ca17713bdaf3f27aa568a6c4242ef2ceb61)), closes [#162](https://github.com/aws/aws-rfdk/issues/162)
* **deadline:** adding deadline version check for workers ([#100](https://github.com/aws/aws-rfdk/issues/100)) ([291f903](https://github.com/aws/aws-rfdk/commit/291f9033389157b745a0a812b4cb5584ea5fe05c))
* **deadline:** adding version check for staging deadline ([#109](https://github.com/aws/aws-rfdk/issues/109)) ([75d0f9f](https://github.com/aws/aws-rfdk/commit/75d0f9fedce52de9dcfe73482965de923fa8941d))
* **deadline:** Disable client SSL config for HTTP Render Queue ([#167](https://github.com/aws/aws-rfdk/issues/167)) ([fe347fa](https://github.com/aws/aws-rfdk/commit/fe347fa135d1b5008adb7990b93600f6638afc83)), closes [#165](https://github.com/aws/aws-rfdk/issues/165)
* **examples:** bump cdk core module version ([#122](https://github.com/aws/aws-rfdk/issues/122)) ([20db251](https://github.com/aws/aws-rfdk/commit/20db251d6b8fc53f8560637818e53e47ae106b49))
* **examples:** Fix instructions and formatting in example app README ([#111](https://github.com/aws/aws-rfdk/issues/111)) ([f050f41](https://github.com/aws/aws-rfdk/commit/f050f41500b8d005d246c37e225895f0489debda)), closes [#105](https://github.com/aws/aws-rfdk/issues/105)
* **examples:** Minor fixes to Python example app REAME ([84b5ffa](https://github.com/aws/aws-rfdk/commit/84b5ffac9e282510c71f8e0348d24a573b2b337a))
* **integ:** fix when PRE_COMPONENT_HOOK is undefined ([#166](https://github.com/aws/aws-rfdk/issues/166)) ([b4bfd4e](https://github.com/aws/aws-rfdk/commit/b4bfd4ec475c3e94002ac961c3b2ce6c8abd65ee)), closes [#164](https://github.com/aws/aws-rfdk/issues/164)

## [0.17.0]() (Link not implemented) (2020-08-26)


### Features

* tag resources with RFDK meta-data ([#74]() (Link not implemented)) ([6b2ce6d]() (full hash: 6b2ce6d26f5a54c8d4a6454ee20f1592f71b45a3))


### Bug Fixes

* **core:** ACM Import remove race condition ([#77]() (Link not implemented)) ([ac6b419]() (full hash: ac6b4193f1f016747f6daf9345c0746ce5a4301c))
* **core:** I-named interfaces could not be created in Python ([#73]() (Link not implemented)) ([4a9a145]() (full hash: 4a9a14535340483d12077f60de04efa5eed99720))
* **core:** Verify ec2 instance identity doc before using meta-data service ([#69]() (Link not implemented)) ([789207c]() (full hash: 789207c75e02a1ff841332f558817c92eb4cb613))
* **deadline:** Make Repository installer honor subnet selection ([#65]() (Link not implemented)) ([d8b9ed6]() (full hash: d8b9ed635ce682194e8e24521abd94a0c2f5e4b2))
* **deadline:** WorkerFleet should not create a securitygroups when given one ([#78]() (Link not implemented)) ([c07f9bd]() (full hash: c07f9bdd5f05e50b55cc06463b665fb4161bc729))

## [0.16.0]() (Link not implemented) (2020-08-13)


### ⚠ BREAKING CHANGES

* **deadline:** construct IDs renamed in UsageBasedLicensing.
- Previously deployed resources will be terminated when updating
- Default log stream prefix changed from 'docker' to 'LicenseForwarder'
- Memory properties are no longer specified when constructing
  UsageBasedLicensing instances
* **deadline:** databaseRemovalPolicy property of Repository has been renamed to removalPolicy.database
* **deadline:** This renames the UBLLicensing, and related, constructs
to UsageBasedLicensing.
* **deadline:** Deadline WorkerFleet has been renamed to WorkerInstanceFleet

### Features

* **deadline:** add dependencies when connecting to renderqueue ([#10]() (Link not implemented)) ([43a211b]() (full hash: 43a211b0679639575b06e31d3d871616a8672014))
* **deadline:** Enable audit logging for DocDB ([#37]() (Link not implemented)) ([00367f2]() (full hash: 00367f26299c8bba3b532ca2fba8d594fa0e72ec))
* **deadline:** RenderQueue support ELB access logs ([#42]() (Link not implemented)) ([9bdb8ff]() (full hash: 9bdb8ffa994df9ac584110b5da6001765e6c65b8))


### Bug Fixes

* **core:** enhance security of mongodbinstance setup scripts ([#33]() (Link not implemented)) ([d2b9875]() (full hash: d2b98758a7f4a3c91ad85ccf3133480d7941208e))
* adding deletion protection for load balancer ([#39]() (Link not implemented)) ([cda4954]() (full hash: cda49542e143717ab96d5f52516d3c1f33c9f451))
* **core:** Fix mounting filesystems if fstab does not end in newline ([#58]() (Link not implemented)) ([c361044]() (full hash: c3610441ebc8d8a0d314afecf9ec0d5f8e3b137d))
* **core:** fixes leaking private key password to logs in mongo setup ([#28]() (Link not implemented)) ([efd1602]() (full hash: efd1602213e3c58fdbeddde676bb2eda15cba8e7))
* **core:** fixing security group for health monitor ([#30]() (Link not implemented)) ([2a23ae7]() (full hash: 2a23ae78b6fb2c29a3ac39d7e918d44c805825d6))
* **deadline:** add retention policy for created efs ([#11]() (Link not implemented)) ([715be7c]() (full hash: 715be7c6d8455632a09faa8242815bcfa662cc3a))
* **deadline:** Close RenderQueue to ingress traffic by default ([#51]() (Link not implemented)) ([f1e7c4b]() (full hash: f1e7c4be3a9f6ffccaf15751976cf5948276a00d))
* **deadline:** fix UsageBasedLicensing stack updates ([#26]() (Link not implemented)) ([84e09fb]() (full hash: 84e09fbd050031c22047e5ecf12f3b4ded5f1544))
* **deadline:** rename ubllicensing construct ([#9]() (Link not implemented)) ([baeb3d4]() (full hash: baeb3d408c0040a2d7295066671b6a15cdaa904a))
* **deadline:** rename WorkerFleet to WorkerInstanceFleet ([#12]() (Link not implemented)) ([84cce6a]() (full hash: 84cce6ade13d2094601d695f033404f0bd074014))
* **deadline:** Support multiple Block Devices ([#41]() (Link not implemented)) ([a669aba]() (full hash: a669aba2eb6feec5b5f71b10a768339fe0d8e074))
* Set load balancers to drop invalid http headers ([#54]() (Link not implemented)) ([4c56fb7]() (full hash: 4c56fb702e1325fad046bd788c27dc781b62b6fb))
* **deadline:** Update Repository Installation script and Worker Configuration ([#52]() (Link not implemented)) ([3068b48]() (full hash: 3068b48f5a8d13c0cf7778ed473da109f14174b2))
* **integ:** update existing repository tests to use docker recipes ([#18]() (Link not implemented)) ([b65edd6]() (full hash: b65edd62804c20cdda58b780af481fb35ec8286b))


* **deadline:** clean up UsageBasedLicensing construct and tests ([#20]() (Link not implemented)) ([a5596d2]() (full hash: a5596d23a50554b3fa85d83e45b26904d7bec301))

## [0.15.0]() (Link not implemented) (2020-07-24)


### ⚠ BREAKING CHANGES

* **deadline:** * **deadline:** removing optional property 'certificateAsset'
* **deadline:** making the property 'certificateSecret' as required.

### Features

* **core:** Adds construct for a MongoDb instance ([05556b1]() (full hash: 05556b15a2ea843059362cfb5fc129321f0b533e))
* **deadline:** Added ability for RQ to configure client connections ([5093614]() (full hash: 5093614da84947374b13e5a1f00cc642e0464ce0))


### Bug Fixes

* **core:** encrypting sns topic for static-ip-server ([a79b8f6]() (full hash: a79b8f690ce27ddf145c365d26685991ce77e981))
* **deadline:** removing s3 option for ubl certs ([55176fc]() (full hash: 55176fccf4d217f3001e8706f33e3a6d9551473e))

## [0.14.0]() (Link not implemented) (2020-07-22)


### ⚠ BREAKING CHANGES

* **deadline:** The Version construct has been renamed to VersionQuery
- It's API has changed and CDK apps using it will need to be refactored
* **deadline:** The API for the `RenderQueue` has changed and applications will need a
significant refactor to make use of the new version

### Features

* **core:** ACM Certificate Importer ([0feeb95]() (full hash: 0feeb95cd2a627ba2774624437a83afe4657e9f8))
* **core:** Adds MountableBlockVolume construct ([fac44dd]() (full hash: fac44dddb50d8541b1560890fe1b4331640e232b))
* **deadline:** add HTTPS for internal RenderQueue traffic ([7a94c53]() (full hash: 7a94c532c48690f757ca72a5b2eb482ab34130b1))
* **deadline:** add schema validation to Stage ([4404363]() (full hash: 4404363d7f5aedd6737af5a3d5da561715b335f0))
* **deadline:** add ThinkboxDockerRecipes construct ([28e99cf]() (full hash: 28e99cfbcd89fe6a713b4f9a6bdea4734458f4f4))
* **deadline:** add TLS support to RenderQueue ([1c80e7a]() (full hash: 1c80e7a64903e180185528d1fb9d7838e32ccf4e))
* **deadline:** improve version api ([f32ec09]() (full hash: f32ec09998d463d856bec923b865ca697f6d8f32))
* **deadline:** switch RenderQueue to use ECS ([0d39b48]() (full hash: 0d39b48b1e85e6fa25731c4539247045b853cad4))


### Bug Fixes

* **deadline:** make Deadline installer executable when staging ([27087eb]() (full hash: 27087ebc3ad18d6e003d9663c1ba32fc2d36656a))
* **deadline:** scale RCS ECS service with ASG ([0ebff8e]() (full hash: 0ebff8e38884fd85f1296cdff22130e18fcd9c3c))
* **integ:** add preflight tests, improve scripting for deployment/teardown, update repository steps to run concurrently ([8798c00]() (full hash: 8798c00f0d98c38320cf69eb3d0ae7259f9d9f2f))
* **integ:** use more resilient command-line argument formatting ([daf50ed]() (full hash: daf50ed041ade3faee9d6ecd71f2f3587fd2b41f))

## [0.13.0]() (Link not implemented) (2020-07-14)


### ⚠ BREAKING CHANGES

* This changes how the package is consumed. Previously,
customer had to import 2 different packages, namely, `@aws-rfdk/core`
& `@aws-rfdk/deadline`. Now only one package should be imported:
`aws-rfdk`.`deadline` remains a module inside this package.
* **core**: Removed EC2-Fleet construct.
**core**: Removed EFS construct.
**deadline**: Fundamental changes to Version class.

### Features

* Tidy foundational Repository dependencies ([ce75fb3]() (full hash: ce75fb30fbdf13f7abc91fed2a6b3a8966f40cae))
* **core:** Adds the StaticPrivateIpServer construct ([068a3fd]() (full hash: 068a3fde361326f7e67d799d5d183c85378b43ce))
* **core:** X.509 Certificate Custom Resource ([b183ef1]() (full hash: b183ef1a2677b05e20038b441b056b0ccde77706))


### Bug Fixes

* **core:** Fixed X.509 Cert Generation ([be770d1]() (full hash: be770d1f8e0a185a7ca49c0947a996f6afc81e39))
* **deadline:** exposing spot price property for worker-fleet ([65694df]() (full hash: 65694df67ae96ed0bf0ed5d52bbed9c8daad5ed6))


* changing to single package repository ([361fdac]() (full hash: 361fdac5122466435d8d9390275ee7610a4ebfce))

## [0.12.0]() (Link not implemented) (2020-07-06)


### ⚠ BREAKING CHANGES

* **deadline:** * **deadline:** replaced the `Repository` construct property
'deadlineRepositoryInstallerPath: string' to 'version: IVersion'. The
construct now takes IVersion as input instead of the deadline
repository installer path.
* **deadline:** removed input property `securityGroup` & `role`

### Features

* Lambda Layer Build and Publish Framework ([da0a9f4]() (full hash: da0a9f4049290e3c6365bd3670fb9af9a642ab5e))
* **core:** Common Library for Lambdas ([7ef8755]() (full hash: 7ef875557a3e9ebe3c7dd1c1f3c938bbcd0e3d58))
* **deadline:** adding script for downloading docker recipe ([0fddfe7]() (full hash: 0fddfe74c8cc4622a4c90464b86cbf07347733f1))


### Bug Fixes

* **core:** adding encryption to health monitor sns topic ([4e7bedf]() (full hash: 4e7bedf877b279cedf701e89b2959e88afae973d))
* Add License Headers ([1c50586]() (full hash: 1c50586e090d1b5f8a99758bd259b5dc002f8550))
* **deadline:** Adds missing license header to stage-deadline.ts ([3d43135]() (full hash: 3d431357826c8fc34fb7946e9a64eabfa8de2c15))
* **deadline:** make repository installer construct-id static ([89fc58b]() (full hash: 89fc58b141a3f13bdb24b78e083e20e942c8a83f))
* **test:** Adds missing tsconfig.json file and cleans up .gitignore. ([76d9a3a]() (full hash: 76d9a3ad2763f26b19be4f2d6505a97c314d7ec3))

## [0.11.0]() (Link not implemented) (2020-06-17)


### ⚠ BREAKING CHANGES

* **deadline:** * Renamed classes, methods, and files in the @aws-rfdk/deadline package that contained the name 'Deadline' to no longer have them. Updated usages of the affected code accordingly.

### Features

* **core:** ExportingLogGroup and LogGroupFactory ([ba9a45a]() (full hash: ba9a45a89410635c94e715569d8a9a33ad3725e3))
* **deadline:** adding health monitoring for worker-fleet ([41f9072]() (full hash: 41f9072d3afea7472b33893dd17b96e9f921387a))
* **deadline:** implementing license forwarder construct ([eeac592]() (full hash: eeac5929a51c7aca601da705b636656998da761b))
* **deadline:** version construct for deadline installers ([ed07b1e]() (full hash: ed07b1e26fd97d1a8ed8245f669d8f69ffe561d7))


### Bug Fixes

* **kitchen-sink:** Removed LogGroup Bucket Name ([79b1a0f]() (full hash: 79b1a0f1a13a70f68a5017d6aa50327b85ec3f56))


* **deadline:** Removed the term 'Deadline' from code in the deadline package ([ded6d65]() (full hash: ded6d65a2e17b8b08a4ec70c9143804073477cd6))

## [0.10.0]() (Link not implemented) (2020-06-11)


### Features

* **deadline:** adding health monitoring for worker-fleet ([41f9072]() (full hash: 41f9072d3afea7472b33893dd17b96e9f921387a))

## [0.9.0]() (Link not implemented) (2020-06-05)


### Features

* **core:** ExportingLogGroup and LogGroupFactory ([def85cf]() (full hash: def85cf06f6195a415b58d09f18a42cc53503012))
* **deadline:** version construct for deadline installers ([ed07b1e]() (full hash: ed07b1e26fd97d1a8ed8245f669d8f69ffe561d7))

## 0.8.0 (2020-05-22)

* CDK and tooling upgrades

## 0.7.0 (2020-05-12)


### ⚠ BREAKING CHANGES

* **deadline:** * **deadline:** renamed worker fleet from `DeadlineWorkerFleet` to
`WorkerFleet`. Removed the property `targetCapacitySpecification` for
this construct.

### Features

* **deadline:** implementing worker-fleet with ASG ([5d6cb05]() (full hash: 5d6cb05ae442da3016f187a07bdac25b82c8a559))


## 0.6.0 (2020-05-04)

* CDK and tooling upgrades

## 0.5.0 (2020-04-24)


### Features

* **deadline:** Add Deadline Render Queue and RCS fleet L3 constructs ([9dc2616]() (full hash: 9dc26169c32b5e3a9c1101f25a379ac904be3ca8))
* **deadline:** adding deadline worker config capability to fleet ([be28e78]() (full hash: be28e7854ac7122f42ac0f726a77e98cf3d5d49b))


### Bug Fixes

* **deadline:** fixing multiple bugs in repository ([0d57bf1]() (full hash: 0d57bf13ff04c269ecacd49e03a0ecd16da8e2b2))
* **deadline:** Repository Installer - Database Arguments ([364be69]() (full hash: 364be693118b9a059496bdca2b60d887cd4b5092))
* **deadline:** using renderqueue endpoints in worker-fleet ([8b1d990]() (full hash: 8b1d990fbfbc8e82aa9b35cbff54c1393ed9fe1d))

## 0.4.0 (2020-04-02)

### Features

* **deadline:** Add Deadline Render Queue and RCS fleet L3 constructs ([e61ad51]() (full hash: e61ad5120e00238c4bb50909c743571878412747))

### Bug Fixes


## 0.3.0 (2020-03-18)


### Features

* **core:** Import Existing FS into EFS Construct ([bbdb4cb]() (full hash: bbdb4cb9060c303c10d67582ccb763ac81b4b6fd))
* **deadline:** adding deadline worker config capability to fleet ([9216f57]() (full hash: 9216f5795a609d90b47fc21aa4a1d2aac17f9b0b))
* **deadline:** adding deadline worker-fleet construct ([d5b5edb]() (full hash: d5b5edb5b9bf97158c51f55ab483ff51f2256598))
* **deadline:** already installed repository validation ([3b9435e]() (full hash: 3b9435e98bf1b746489bff9788c4268d9f4ac9a3))

### Bug Fixes

* **deadline:** fixing deadline respository ([48ddd56]() (full hash: 48ddd5604eb429f9e1e88d04761efec3c55af691))

## 0.2.0 (2020-02-24)


### Features

* Add Basic CodeBuild Setup ([d9915d6]() (full hash: d9915d6bf39c8d1484568a1dee7590a1a184b794))
* Create kitchen sink example app ([4252081]() (full hash: 4252081e135e43438bcde48e9d53d90e9dde2f71))
* Created Integration Test Framework and Test ([c478cfe]() (full hash: c478cfe912902101ca909db632737ee0d8b7062e))
* **core:** Create DocDB L2 construct ([06ac1f1]() (full hash: 06ac1f106b167222b2d7c1ac068b462dec4da484))
* **core:** Create VpcStack ([b1d0814]() (full hash: b1d08145faa585b47442f3ccdb25a9799d282b55))
* **core:** Implementing the L2 Construct for EFS ([7b376ae]() (full hash: 7b376ae4b43c90232ddb94643b5eb1940b2a79b1))
* **core:** Import Existing FS into EFS Construct ([bbdb4cb]() (full hash: bbdb4cb9060c303c10d67582ccb763ac81b4b6fd))
* **deadline:** creates deadline repository construct ([0dc36d5]() (full hash: 0dc36d5811e8f798337202d5a043ed4c6bec6102))


### Bug Fixes

* **example:** adding the dummy repository installer file ([1d7f0f8]() (full hash: 1d7f0f8eb7005a5ad1501870f0fd32aa9b41979f))
