/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// configureRespositoryDirectConnect.sh
export const CONFIG_REPO_DIRECT_CONNECT_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'c4ee7f2045a95cb6858f1fdf35253ca27103511dffd97ac97dfe2a8aae85d7fc',
};

// configureWorker.sh
export const CONFIG_WORKER_ASSET_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '1cfdffe73bb016717ba1f43d64fe528af27b3784f524a97bb36533a6e6d057ff',
};

// configureWorker.ps1
export const CONFIG_WORKER_ASSET_WINDOWS = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'a10d67420c8758e35d8dae5fa406c7acb92b1bd40924167d5564aa0037b4a980',
};

// configureWorkerHealthCheck.sh
export const CONFIG_WORKER_HEALTHCHECK_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '3e16ffda458a50d2a032ef783202a85bf4677f19b92a38d3605d6cd750879f75',
};

// configureWorkerHealthCheck.ps1
export const CONFIG_WORKER_HEALTHCHECK_WINDOWS = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '8b91f35e39a1b222c8ef7ab0e30da88713339023ac547dc7894f5ea60833df97',
};


export const CONFIG_WORKER_PORT_ASSET_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'a10d67420c8758e35d8dae5fa406c7acb92b1bd40924167d5564aa0037b4a980',
};

export const CONFIG_WORKER_PORT_ASSET_WINDOWS = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '3227efc256da3ae31791b7c80e1532cac975116846f179f118a20843e0c2ee80',
};

// getSecretToFile.sh
export const GET_SECRET_TO_FILE_SCRIPT_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: '2245b375c979246094a6a47007b55e51f117e987be5de9791c0799cddc3f1c2e',
};

// installDeadlineRepository.sh
export const INSTALL_REPOSITORY_ASSET_LINUX = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
};

// installRepostitoryDirectConnection
export const REPO_DC_ASSET = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
};

export const RQ_CONNECTION_ASSET = {
  Bucket: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
  Key: 'b61797635329f0b0ec0b710b31d49f0e41c1936849266d8a9aed82e1616c9077',
};
