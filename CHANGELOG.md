# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
