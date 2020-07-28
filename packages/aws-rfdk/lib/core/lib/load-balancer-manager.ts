/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {IVpc} from '@aws-cdk/aws-ec2';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  Protocol,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {Construct} from '@aws-cdk/core';
import {
  HealthCheckConfig,
  HealthMonitor,
  IMonitorableFleet,
  Limit,
} from './health-monitor';

/**
 * This class is responsible for managing the statistics for all the
 * load balancers created in this construct. It is also responsible to search
 * for the finding the first Load balancer/Listener which can accomodate the
 * worker-fleet based on its size.
 *
 * A typical load balancer hierarchy looks like following:
 *  |__ Load Balancer 1
 *  |         |____________Listener 1
 *  |         |                 |_______Target Group 1 ------- Target/Fleet
 *  |         |                 |_______Target Group 2 ------- Target/Fleet
 *  |         |
 *  |         |____________Listener 2
 *  |                           |_______Target Group 1 ------- Target/Fleet
 *  |                           |_______Target Group 2 ------- Target/Fleet
 *  |
 *  |__ Load Balancer 2
 *            |____________Listener 1
 *            |                 |_______Target Group 1 ------- Target/Fleet
 *            |                 |_______Target Group 2 ------- Target/Fleet
 *            |
 *            |____________Listener 2
 *                              |_______Target Group 1 ------- Target/Fleet
 *                              |_______Target Group 2 ------- Target/Fleet
 *
 *  Components:
 *  1. LoadBalancerFactory: This is the root node of the tree. It contains the
 *     map of load balancer to its managers. It is responsible for creating a
 *     new load balancer if required. It delegates the registerFleet calls to
 *     downstream and returns parent load balancer, listener and target group
 *     of the registered fleet if the registration was successful
 *
 *  2. LoadBalancerManager: This class manages a single load balancer. It
 *     contains a map of all the listeners->manager. It also contains the component
 *     counts like listener, target group and target count. It delegates the
 *     registration call to downstream listeners and updates the stats when
 *     the registration is successful. It returns the parent listener and
 *     target group on successful registration.
 *
 *  3. ListenerManager: This class managers a single Listener. It contains a map
 *     of all of its target groups to its associated fleet. It also contains the
 *     component counts. It returns the target group on registration.
 */
export class LoadBalancerFactory {
  public static readonly DEFAULT_LISTENERS_PER_APPLICATION_LOAD_BALANCER = 50;
  public static readonly DEFAULT_TARGETS_PER_APPLICATION_LOAD_BALANCER = 1000;
  public static readonly DEFAULT_TARGET_GROUPS_PER_ACTION_ON_APPLICATION_LOAD_BALANCER = 5;
  public static readonly DEFAULT_TARGET_GROUPS_PER_APPLICATION_LOAD_BALANCER = 100;

  public static getAccountLimit(
    limitName: string,
    defaultValue: number,
    elbAccountLimits?: Limit[]): number {
    if (!elbAccountLimits) {
      return defaultValue;
    }
    const foundLimit = elbAccountLimits.find(limit => limit.name === limitName);
    if (!foundLimit) {
      return defaultValue;
    }
    return foundLimit.max;
  }

  private readonly vpc: IVpc;
  private readonly healthMonitorScope: Construct;

  private loadBalancerMap = new Map<ApplicationLoadBalancer, LoadBalancerManager>();

  constructor(
    healthMonitorScope: Construct,
    vpc: IVpc) {
    this.healthMonitorScope = healthMonitorScope;
    this.vpc = vpc;
  }

  /**
   * This method scans all the load balancers and its listeners and registers the fleet
   * to the load balancer and/or listener which can accommodate it.
   * This method also updates the statistics for the given fleet size.
   * If the registration is successful, it then returns the load balancer, listener
   * and target group to which the fleet was registered.
   *
   * @param fleet
   * @param healthCheckConfig
   * @param elbAccountLimits
   */
  public registerWorkerFleet(
    fleet: IMonitorableFleet,
    healthCheckConfig: HealthCheckConfig,
    elbAccountLimits?: Limit[]): {
      loadBalancer: ApplicationLoadBalancer,
      listener: ApplicationListener,
      targetGroup: ApplicationTargetGroup
    } {

    let loadBalancerParent = null;
    let listenerParent = null;
    let targetGroupParent = null;

    // iterate through each load balancer and try registering to each one.
    for (const [loadBalancer, loadBalancerMeta] of this.loadBalancerMap.entries()) {

      try {
        const {listener, targetGroup} = loadBalancerMeta.registerWorkerFleet(
          loadBalancer,
          fleet,
          healthCheckConfig,
          elbAccountLimits);

        loadBalancerParent = loadBalancer;
        listenerParent = listener;
        targetGroupParent = targetGroup;
        break;
      } catch (e) {
        // suppress all AWSLimitExhaustedError, we will scale in case of this error
        /* istanbul ignore next */
        if (!(e instanceof AWSLimitExhaustedError)) {
          /* istanbul ignore next */
          throw e;
        }
      }
    }

    // Check if fleet was not registered.
    if (!loadBalancerParent) {

      // If this section is reached, no load balancer was found which could
      // accommodate fleet, create a new one and register
      loadBalancerParent = this.createLoadBalancer(
        this.healthMonitorScope,
        this.loadBalancerMap.size);
      const loadBalancerManager = new LoadBalancerManager();

      // Add it to the map
      this.loadBalancerMap.set(loadBalancerParent, loadBalancerManager);

      // try registering the fleet to the new load balancer
      try {
        const {listener, targetGroup} = loadBalancerManager.registerWorkerFleet(
          loadBalancerParent,
          fleet,
          healthCheckConfig,
          elbAccountLimits);

        listenerParent = listener;
        targetGroupParent = targetGroup;
      } catch (e) {
        throw e;
      }
    }

    /* istanbul ignore next */
    if (!loadBalancerParent || !listenerParent || !targetGroupParent) {
      /* istanbul ignore next */
      throw new Error('Fleet registered successfully but a parent was found null');
    }

    return {
      loadBalancer: loadBalancerParent,
      listener: listenerParent,
      targetGroup: targetGroupParent,
    };
  }

  /**
   * Following method creates a new load balancer within the given scope.
   *
   * @param scope
   * @param loadBalancerindex
   */
  private createLoadBalancer(scope: Construct, loadBalancerindex: number): ApplicationLoadBalancer {
    return new ApplicationLoadBalancer(scope, `ALB_${loadBalancerindex}`, {
      vpc: this.vpc,
      internetFacing: false,
    });
  }
}

/**
 * This class manages the properties of a single load balancer and its statistics.
 * It is also responsible to scan through all the listeners registered under it
 * and register the given fleet.
 */
class LoadBalancerManager {
  private listenerMap: Map<ApplicationListener, ListenerManager> = new Map();
  private loadBalancerComponentCount = new LoadBalancerComponentStats();

  /**
   * This method scans all the listeners of this load balancer and registers the fleet
   * to one which can accomodate it.
   * This method also updates the statistics for the given fleet size.
   * If the registration is successful, it then returns the listener
   * and target group to which the fleet was registered.
   *
   * @param loadBalancer
   * @param fleet
   * @param healthCheckConfig
   * @param elbAccountLimits
   */
  public registerWorkerFleet(
    loadBalancer: ApplicationLoadBalancer,
    fleet: IMonitorableFleet,
    healthCheckConfig: HealthCheckConfig,
    elbAccountLimits?: Limit[]) {

    // this initializes with 0 and keeps the track of all components
    // newly added down the hierarchy.
    const statsDelta = new LoadBalancerComponentStats();

    // Do all the load balancer level service limit checks first

    // check for target limit in load balancer
    const targetPerLoadBalancerLimit = LoadBalancerFactory.getAccountLimit('targets-per-application-load-balancer',
      LoadBalancerFactory.DEFAULT_TARGETS_PER_APPLICATION_LOAD_BALANCER,
      elbAccountLimits);
    if ((this.loadBalancerComponentCount.targetCount + fleet.targetCapacity) > targetPerLoadBalancerLimit) {
      throw new AWSLimitExhaustedError('AWS service limit "targets-per-application-load-balancer" reached. Limit: ' +
        targetPerLoadBalancerLimit);
    }

    // check for target group limit in load balancer
    const targetGroupsPerLoadBalancerLimit = LoadBalancerFactory.getAccountLimit('target-groups-per-application-load-balancer',
      LoadBalancerFactory.DEFAULT_TARGET_GROUPS_PER_APPLICATION_LOAD_BALANCER,
      elbAccountLimits);
    if ((this.loadBalancerComponentCount.targetGroupCount + 1) > targetGroupsPerLoadBalancerLimit) {
      throw new AWSLimitExhaustedError('AWS service limit "target-groups-per-application-load-balancer" reached. Limit: ' +
        targetGroupsPerLoadBalancerLimit);
    }

    let listenerParent = null;
    let targetGroupParent = null;

    // try registering to each listener.
    for (const [listener, listenerMeta] of this.listenerMap.entries()) {

      try {
        const {componentsAdded, targetGroup} = listenerMeta.registerWorkerFleet(
          loadBalancer,
          listener,
          fleet,
          healthCheckConfig,
          elbAccountLimits);

        statsDelta.add(componentsAdded);
        listenerParent = listener;
        targetGroupParent = targetGroup;
        break;
      } catch (e) {
        // suppress all AWSLimitExhaustedError, we will scale in case of this error
        /* istanbul ignore next */
        if (!(e instanceof AWSLimitExhaustedError)) {
          /* istanbul ignore next */
          throw e;
        }
      }
    }

    /* istanbul ignore next */
    if (!listenerParent) {
      // If this section is reached, no listener was found which could accommodate fleet
      // create new listener and register

      const listenersPerLoadBalancerLimit = LoadBalancerFactory.getAccountLimit('listeners-per-application-load-balancer',
        LoadBalancerFactory.DEFAULT_LISTENERS_PER_APPLICATION_LOAD_BALANCER,
        elbAccountLimits);
      if ((this.loadBalancerComponentCount.listenerCount + 1) > listenersPerLoadBalancerLimit) {
        throw new AWSLimitExhaustedError('AWS service limit "listeners-per-application-load-balancer" reached. Limit: ' +
          listenersPerLoadBalancerLimit);
      }

      listenerParent = this.createListener(fleet.targetScope, loadBalancer);
      const listenerManager = new ListenerManager();

      this.listenerMap.set(listenerParent, listenerManager);
      statsDelta.add(new LoadBalancerComponentStats(1, 0, 0));

      try {
        const {componentsAdded, targetGroup} = listenerManager.registerWorkerFleet(
          loadBalancer,
          listenerParent,
          fleet,
          healthCheckConfig,
          elbAccountLimits);

        targetGroupParent = targetGroup;
        statsDelta.add(componentsAdded);
      } catch (e) {
        throw e;
      }
    }

    // update the current load balancer's stats
    this.loadBalancerComponentCount.add(statsDelta);

    return {
      componentsAdded: statsDelta,
      listener: listenerParent,
      targetGroup: targetGroupParent,
    };
  }

  /**
   * Following method creates a new listener in the fleet's scope and
   * registers it to the given load balancer.
   *
   * @param scope
   * @param loadBalancer
   */
  private createListener(scope: Construct, loadBalancer: ApplicationLoadBalancer): ApplicationListener {
    return new ApplicationListener(scope, 'Listener', {
      port: HealthMonitor.LOAD_BALANCER_LISTENING_PORT + this.listenerMap.size, // dummy port for load balancing
      protocol: ApplicationProtocol.HTTP,
      loadBalancer,
    });
  }
}

/**
 * This class manages the properties of a single listener and all the components
 * under its hierarchy.
 * It is also responsible to create a new target group and register the given fleet.
 */
class ListenerManager {
  private targetMap: Map<ApplicationTargetGroup, IMonitorableFleet> = new Map();
  private listenerComponentCount = new LoadBalancerComponentStats();

  /**
   * This method scans all the listeners of this load balancer and registers the fleet
   * to one which can accommodate it.
   * This method also updates the statistics for the given fleet size.
   * If the registration is successful, it then returns the target group
   * to which the fleet was registered.
   *
   * @param loadBalancer
   * @param listener
   * @param fleet
   * @param healthCheckConfig
   * @param elbAccountLimits
   */
  public registerWorkerFleet(
    loadBalancer: ApplicationLoadBalancer,
    listener: ApplicationListener,
    fleet: IMonitorableFleet,
    healthCheckConfig: HealthCheckConfig,
    elbAccountLimits?: Limit[]) {

    const componentsAdded = new LoadBalancerComponentStats();

    // Do all listener level service limit checks

    // check for target limit in listener
    const targetGroupPerLoadBalancerLimit = LoadBalancerFactory.getAccountLimit('target-groups-per-action-on-application-load-balancer',
      LoadBalancerFactory.DEFAULT_TARGET_GROUPS_PER_ACTION_ON_APPLICATION_LOAD_BALANCER,
      elbAccountLimits);
    if ((this.listenerComponentCount.targetGroupCount + 1) > targetGroupPerLoadBalancerLimit) {
      throw new AWSLimitExhaustedError('AWS service limit "target-groups-per-action-on-application-load-balancer" reached. Limit: ' +
        targetGroupPerLoadBalancerLimit);
    }

    // latest version of CDK does not support 'forwardConfig' in listener rule yet. This means
    // we cannot add multiple target groups to a single listener. Adding this check till this
    // feature is supported.
    if (this.listenerComponentCount.targetGroupCount > 0) {
      throw new AWSLimitExhaustedError('Unable to add more than 1 Target Group to Listener.');
    }

    // Create a new target group
    const targetGroup = this.createTargetGroup(
      fleet.targetScope,
      loadBalancer,
      listener,
      fleet,
      healthCheckConfig);
    this.targetMap.set(targetGroup, fleet);

    // update the listener stats
    componentsAdded.targetGroupCount++;
    componentsAdded.targetCount += fleet.targetCapacity;

    // update the current listener's stats
    this.listenerComponentCount.add(componentsAdded);

    return {
      componentsAdded,
      targetGroup,
    };
  }

  /**
   * Following method creates a new new target group in the fleet's scope and
   * registers it to the given listener.
   *
   * @param scope
   * @param loadBalancer
   * @param listener
   * @param monitorableFleet
   * @param healthCheckConfig
   */
  private createTargetGroup(
    scope: Construct,
    loadBalancer: ApplicationLoadBalancer,
    listener: ApplicationListener,
    monitorableFleet: IMonitorableFleet,
    healthCheckConfig: HealthCheckConfig): ApplicationTargetGroup {

    const targetGroup = new ApplicationTargetGroup(scope, 'TargetGroup', {
      port: HealthMonitor.LOAD_BALANCER_LISTENING_PORT, // dummy port for load balancing
      protocol: ApplicationProtocol.HTTP,
      targets: [monitorableFleet.targetToMonitor],
      healthCheck: {
        port: healthCheckConfig.port ? healthCheckConfig.port.toString() : HealthMonitor.LOAD_BALANCER_LISTENING_PORT.toString(),
        interval: healthCheckConfig.interval || HealthMonitor.DEFAULT_HEALTH_CHECK_INTERVAL,
        healthyThresholdCount: healthCheckConfig.instanceHealthyThresholdCount || HealthMonitor.DEFAULT_HEALTHY_HOST_THRESHOLD,
        unhealthyThresholdCount: healthCheckConfig.instanceUnhealthyThresholdCount || HealthMonitor.DEFAULT_UNHEALTHY_HOST_THRESHOLD,
        protocol: Protocol.HTTP,
      },
      vpc: loadBalancer.vpc,
    });

    listener.addTargetGroups('TargetGroup', {
      targetGroups: [targetGroup],
    });

    return targetGroup;
  }
}

/**
 * This class contains the statistics of all the nested load balancer
 * components like listener count, target group count and target count.
 * This statistics object will be associated with each load balancer
 * and listener for tracking the count of components.
 */
class LoadBalancerComponentStats {
  public listenerCount: number;
  public targetGroupCount: number;
  public targetCount: number;

  constructor(
    listenerCount: number = 0,
    targetGroupCount: number = 0,
    targetCount: number = 0) {
    this.listenerCount = listenerCount;
    this.targetGroupCount = targetGroupCount;
    this.targetCount = targetCount;
  }

  public add(operand: LoadBalancerComponentStats) {
    this.listenerCount += operand.listenerCount;
    this.targetGroupCount += operand.targetGroupCount;
    this.targetCount += operand.targetCount;
  }
}

export class AWSLimitExhaustedError extends Error {
  constructor(message: string) {
    super(message);
  }
}