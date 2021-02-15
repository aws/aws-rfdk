/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  convertSpotEventPluginSettings,
  convertToBoolean,
  convertToBooleanOptional,
  convertToInt,
  convertToIntOptional,
  isValidDeviceMapping,
  isValidInstanceProfile,
  isValidSecurityGroup,
  isValidTagSpecification,
  validateArray,
  validateProperty,
  validateString,
  validateStringOptional,
} from '../conversion';
import {
  PluginSettings,
  SpotFleetSecurityGroupId,
  BlockDeviceMappingProperty,
  SpotFleetInstanceProfile,
} from '../types';

describe('convertSpotEventPluginSettings()', () => {
  test('does not convert properties with correct types', () => {
    // GIVEN
    const defaultPluginConfig = {
      AWSInstanceStatus: 'Disabled',
      DeleteInterruptedSlaves: false,
      DeleteTerminatedSlaves: false,
      IdleShutdown: 10,
      Logging: 'Standard',
      PreJobTaskMode: 'Conservative',
      Region: 'eu-west-1',
      ResourceTracker: true,
      StaggerInstances: 50,
      State: 'Disabled',
      StrictHardCap: false,
    };

    const defaultConvertedPluginConfig = {
      AWSInstanceStatus: 'Disabled',
      DeleteInterruptedSlaves: false,
      DeleteTerminatedSlaves: false,
      IdleShutdown: 10,
      Logging: 'Standard',
      PreJobTaskMode: 'Conservative',
      Region: 'eu-west-1',
      ResourceTracker: true,
      StaggerInstances: 50,
      State: 'Disabled',
      StrictHardCap: false,
    };

    // WHEN
    const returnValue = convertSpotEventPluginSettings(defaultPluginConfig);

    // THEN
    expect(returnValue).toEqual(defaultConvertedPluginConfig);
  });

  test('converts properties of type string', () => {
    // GIVEN
    const defaultPluginConfig = {
      AWSInstanceStatus: 'Disabled',
      DeleteInterruptedSlaves: 'false',
      DeleteTerminatedSlaves: 'false',
      IdleShutdown: '10',
      Logging: 'Standard',
      PreJobTaskMode: 'Conservative',
      Region: 'eu-west-1',
      ResourceTracker: 'true',
      StaggerInstances: '50',
      State: 'Disabled',
      StrictHardCap: 'false',
    };

    const defaultConvertedPluginConfig = {
      AWSInstanceStatus: 'Disabled',
      DeleteInterruptedSlaves: false,
      DeleteTerminatedSlaves: false,
      IdleShutdown: 10,
      Logging: 'Standard',
      PreJobTaskMode: 'Conservative',
      Region: 'eu-west-1',
      ResourceTracker: true,
      StaggerInstances: 50,
      State: 'Disabled',
      StrictHardCap: false,
    };

    // WHEN
    // Need this trick so TS allows to pass config with string properties.
    const config = (defaultPluginConfig as unknown) as PluginSettings;
    const returnValue = convertSpotEventPluginSettings(config);

    // THEN
    expect(returnValue).toEqual(defaultConvertedPluginConfig);
  });
});

describe('convertToInt()', () => {
  test.each<[any, number]>([
    ['10', 10],
    [10, 10],
  ])('correctly converts %p to %p', (input: any, expected: number) => {
    // WHEN
    const returnValue = convertToInt(input, 'propertyName');

    // THEN
    expect(returnValue).toBe(expected);
  });

  test.each([
    10.6,
    [],
    {},
    'string',
    undefined,
  ])('throws an error with %p', input => {
    // WHEN
    const propertyName = 'propertyName';
    function callingConvertToInt() {
      convertToInt(input, propertyName);
    }

    // THEN
    expect(callingConvertToInt).toThrowError(`The value of ${propertyName} should be an integer. Received: ${input}`);
  });
});

describe('convertToIntOptional()', () => {
  test.each<[any, number | undefined]>([
    ['10', 10],
    [10, 10],
    [undefined, undefined],
  ])('correctly converts %p to %p', (input: any, expected: number | undefined) => {
    // WHEN
    const returnValue = convertToIntOptional(input, 'propertyName');

    // THEN
    expect(returnValue).toBe(expected);
  });

  test.each([
    10.6,
    [],
    {},
    'string',
  ])('throws an error with %p', input => {
    // WHEN
    const propertyName = 'propertyName';
    function callingConvertToIntOptional() {
      convertToIntOptional(input, propertyName);
    }

    // THEN
    expect(callingConvertToIntOptional).toThrowError(`The value of ${propertyName} should be an integer. Received: ${input}`);
  });
});

describe('convertToBoolean()', () => {
  test.each<[any, boolean]>([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
  ])('correctly converts %p to %p', (input: any, expected: boolean) => {
    // WHEN
    const returnValue = convertToBoolean(input, 'property');

    // THEN
    expect(returnValue).toBe(expected);
  });

  test.each([
    10.6,
    [],
    {},
    'string',
    undefined,
  ])('throws an error with %p', input => {
    // WHEN
    const propertyName = 'propertyName';
    function callingConvertToBoolean() {
      convertToBoolean(input, propertyName);
    }

    // THEN
    expect(callingConvertToBoolean).toThrowError(`The value of ${propertyName} should be a boolean. Received: ${input}`);
  });
});

describe('convertToBooleanOptional()', () => {
  test.each<[any, boolean | undefined]>([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [undefined, undefined],
  ])('correctly converts %p to %p', (input: any, expected: boolean | undefined) => {
    // WHEN
    const returnValue = convertToBooleanOptional(input, 'property');

    // THEN
    expect(returnValue).toBe(expected);
  });

  test.each([
    10.6,
    [],
    {},
    'string',
  ])('throws an error with %p', input => {
    // WHEN
    const propertyName = 'propertyName';
    function callingConvertToBooleanOptional() {
      convertToBooleanOptional(input, propertyName);
    }

    // THEN
    expect(callingConvertToBooleanOptional).toThrowError(`The value of ${propertyName} should be a boolean. Received: ${input}`);
  });
});

describe('validateString()', () => {
  test.each<[any, string]>([
    ['string', 'string'],
    ['10', '10'],
    ['true', 'true'],
  ])('correctly converts %p to %p', (input: any, expected: string) => {
    // WHEN
    const returnValue = validateString(input, 'propertyName');

    // THEN
    expect(returnValue).toBe(expected);
  });

  test.each([
    10,
    [],
    {},
    undefined,
  ])('throws an error with %p', input => {
    // WHEN
    const propertyName = 'propertyName';
    function callingValidateString() {
      validateString(input, propertyName);
    }

    // THEN
    expect(callingValidateString).toThrowError(`The value of ${propertyName} should be a string. Received: ${input} of type ${typeof(input)}`);
  });
});

describe('validateStringOptional()', () => {
  test.each<[any, string | undefined]>([
    ['string', 'string'],
    ['10', '10'],
    ['true', 'true'],
    [undefined, undefined],
  ])('correctly converts %p to %p', (input: any, expected: string | undefined) => {
    // WHEN
    const returnValue = validateStringOptional(input, 'propertyName');

    // THEN
    expect(returnValue).toBe(expected);
  });

  test.each([
    10,
    [],
    {},
  ])('throws an error with %p', input => {
    // WHEN
    const propertyName = 'propertyName';
    function callingValidateStringOptional() {
      validateStringOptional(input, propertyName);
    }

    // THEN
    expect(callingValidateStringOptional).toThrowError(`The value of ${propertyName} should be a string. Received: ${input} of type ${typeof(input)}`);
  });
});

describe('validateArray', () => {
  test.each([
    undefined,
    {},
    [],
  ])('throws with invalid input %p', (invalidInput: any) => {
    // WHEN
    const propertyName = 'propertyName';
    function callingValidateArray() {
      validateArray(invalidInput, propertyName);
    }

    // THEN
    expect(callingValidateArray).toThrowError(`${propertyName} should be an array with at least one element.`);
  });

  test('passes with not empty array', () => {
    // GIVEN
    const nonEmptyArray = ['value'];

    // WHEN
    function callingValidateArray() {
      validateArray(nonEmptyArray, 'propertyName');
    }

    // THEN
    expect(callingValidateArray).not.toThrowError();
  });
});

describe('isValidSecurityGroup', () => {
  // Valid security groups
  const validSecurityGroup: SpotFleetSecurityGroupId = {
    GroupId: 'groupId',
  };

  // Invalid security groups
  const groupIdNotString = {
    GroupId: 10,
  };
  const noGroupId = {
  };

  test.each([
    undefined,
    [],
    '',
    groupIdNotString,
    noGroupId,
  ])('returns false with invalid input %p', (invalidInput: any) => {
    // WHEN
    const result = isValidSecurityGroup(invalidInput);

    // THEN
    expect(result).toBeFalsy();
  });

  test('returns true with a valid input', () => {
    // WHEN
    const result = isValidSecurityGroup(validSecurityGroup);

    // THEN
    expect(result).toBeTruthy();
  });
});

describe('isValidTagSpecification', () => {
  // Valid tag specifications
  const validTagSpecification = {
    ResourceType: 'type',
    Tags: [{
      Key: 'key',
      Value: 'value',
    }],
  };

  // Invalid tag specifications
  const noResourceType = {
  };
  const resourceTypeNotSting = {
    ResourceType: 10,
  };
  const noTags = {
    ResourceType: 'type',
  };
  const tagsNotArray = {
    ResourceType: 'type',
    Tags: '',
  };
  const tagElementUndefined = {
    ResourceType: 'type',
    Tags: [undefined],
  };
  const tagElementWrongType = {
    ResourceType: 'type',
    Tags: [''],
  };
  const tagElementNoKey = {
    ResourceType: 'type',
    Tags: [{
    }],
  };
  const tagElementKeyNotString = {
    ResourceType: 'type',
    Tags: [{
      Key: 10,
    }],
  };
  const tagElementNoValue = {
    ResourceType: 'type',
    Tags: [{
      Key: 'key',
    }],
  };

  test.each([
    undefined,
    [],
    '',
    noResourceType,
    resourceTypeNotSting,
    noTags,
    tagsNotArray,
    tagElementUndefined,
    tagElementWrongType,
    tagElementNoKey,
    tagElementKeyNotString,
    tagElementNoValue,
  ])('returns false with invalid input %p', (invalidInput: any) => {
    // WHEN
    const result = isValidTagSpecification(invalidInput);

    // THEN
    expect(result).toBeFalsy();
  });

  test('returns true with a valid input', () => {
    // WHEN
    const result = isValidTagSpecification(validTagSpecification);

    // THEN
    expect(result).toBeTruthy();
  });
});

describe('isValidDeviceMapping', () => {
  test.each([
    undefined,
    [],
    '',
  ])('returns false with invalid input %p', (invalidInput: any) => {
    // WHEN
    const result = isValidDeviceMapping(invalidInput);

    // THEN
    expect(result).toBeFalsy();
  });

  test('returns true with a valid input', () => {
    // GIVEN
    const anyObject = {} as unknown;

    // WHEN
    const result = isValidDeviceMapping(anyObject as BlockDeviceMappingProperty);

    // THEN
    expect(result).toBeTruthy();
  });
});

describe('isValidInstanceProfile', () => {
  // Valid instance profiles
  const validInstanceProfile: SpotFleetInstanceProfile = {
    Arn: 'arn',
  };

  // Invalid instance profiles
  const noArn = {
  };
  const arnNotString = {
    Arn: 10,
  };

  test.each([
    undefined,
    [],
    '',
    noArn,
    arnNotString,
  ])('returns false with invalid input %p', (invalidInput: any) => {
    // WHEN
    const result = isValidInstanceProfile(invalidInput);

    // THEN
    expect(result).toBeFalsy();
  });

  test('returns true with a valid input', () => {
    // WHEN
    const result = isValidInstanceProfile(validInstanceProfile);

    // THEN
    expect(result).toBeTruthy();
  });
});

describe('validateProperty', () => {
  test('throws with invalid input', () => {
    // WHEN
    const propertyName = 'propertyName';
    function returnFalse(_input: any) {
      return false;
    }
    function callingValidateProperty() {
      validateProperty(returnFalse, 'anyValue', propertyName);
    }

    // THEN
    expect(callingValidateProperty).toThrowError(`${propertyName} type is not valid.`);
  });

  test('passes with a valid input', () => {
    // WHEN
    function returnTrue(_input: any) {
      return true;
    }
    function callingValidateProperty() {
      validateProperty(returnTrue, 'anyValue', 'propertyName');
    }

    // THEN
    expect(callingValidateProperty).not.toThrowError();
  });
});