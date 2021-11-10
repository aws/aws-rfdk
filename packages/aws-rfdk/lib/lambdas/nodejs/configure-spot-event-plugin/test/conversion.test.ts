/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  convertSpotEventPluginSettings,
  convertToBoolean,
  convertToInt,
  isValidTagSpecification,
  validateArray,
  validateLaunchTemplateConfigs,
  validateLaunchTemplateOverrides,
  validateLaunchTemplateSpecification,
  validateProperty,
  validateString,
  validateStringOptional,
} from '../conversion';
import {
  LaunchTemplateConfig,
  LaunchTemplateOverrides,
  LaunchTemplateSpecification,
  PluginSettings,
} from '../types';

const propertyName = 'propertyName';

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
    function callingConvertToInt() {
      convertToInt(input, propertyName);
    }

    // THEN
    expect(callingConvertToInt).toThrowError(`The value of ${propertyName} should be an integer. Received: ${input}`);
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
    function callingConvertToBoolean() {
      convertToBoolean(input, propertyName);
    }

    // THEN
    expect(callingConvertToBoolean).toThrowError(`The value of ${propertyName} should be a boolean. Received: ${input}`);
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
  const tagElementValueNotString = {
    ResourceType: 'type',
    Tags: [{
      Key: 'key',
      Value: 10,
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
    tagElementValueNotString,
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

describe('validateProperty', () => {
  test('throws with invalid input', () => {
    // WHEN
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

describe('validateLaunchTemplateSpecification', () => {
  test('accepts launch template specification with id', () => {
    // GIVEN
    const spec: LaunchTemplateSpecification = {
      Version: '1',
      LaunchTemplateId: 'id',
    };

    // WHEN
    expect(() => validateLaunchTemplateSpecification(spec, propertyName))

      // THEN
      .not.toThrow();
  });

  test('accepts launch template specification with name', () => {
    // GIVEN
    const spec: LaunchTemplateSpecification = {
      Version: '1',
      LaunchTemplateName: 'name',
    };

    // WHEN
    expect(() => validateLaunchTemplateSpecification(spec, propertyName))

      // THEN
      .not.toThrow();
  });

  test('throws if both id and name are specified', () => {
    // GIVEN
    const id = 'id';
    const name = 'name';
    const spec: LaunchTemplateSpecification = {
      Version: '1',
      LaunchTemplateId: id,
      LaunchTemplateName: name,
    };

    // WHEN
    expect(() => validateLaunchTemplateSpecification(spec, propertyName))

      // THEN
      .toThrowError(`Exactly one of ${propertyName}.LaunchTemplateId or ${propertyName}.LaunchTemplateName must be specified, but got: ${id} and ${name} respectively`);
  });

  test('throws if neither id or name are specified', () => {
    // GIVEN
    const spec: LaunchTemplateSpecification = {
      Version: '1',
    };

    // WHEN
    expect(() => validateLaunchTemplateSpecification(spec, propertyName))

      // THEN
      .toThrowError(`Exactly one of ${propertyName}.LaunchTemplateId or ${propertyName}.LaunchTemplateName must be specified, but got: ${undefined} and ${undefined} respectively`);
  });

  test('throws if id is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const spec: LaunchTemplateSpecification = {
      Version: '1',
      // @ts-ignore
      LaunchTemplateId: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateSpecification(spec, propertyName))

      // THEN
      .toThrowError(new RegExp(`The value of ${propertyName}.LaunchTemplateId should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`));
  });

  test('throws if name is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const spec: LaunchTemplateSpecification = {
      Version: '1',
      // @ts-ignore
      LaunchTemplateName: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateSpecification(spec, propertyName))

      // THEN
      .toThrowError(new RegExp(`The value of ${propertyName}.LaunchTemplateName should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`));
  });

  test('throws if version is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const spec: LaunchTemplateSpecification = {
      LaunchTemplateId: '',
      // @ts-ignore
      Version: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateSpecification(spec, propertyName))

      // THEN
      .toThrowError(`The value of ${propertyName}.Version should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`);
  });
});

describe('validateLaunchTemplateOverrides', () => {
  test('accepts valid overrides', () => {
    // GIVEN
    const overrides: LaunchTemplateOverrides = {
      AvailabilityZone: 'AvailabilityZone',
      InstanceType: 'InstanceType',
      SpotPrice: 'SpotPrice',
      SubnetId: 'SubnetId',
      WeightedCapacity: 123,
    };

    // WHEN
    expect(() => validateLaunchTemplateOverrides(overrides, propertyName))

      // THEN
      .not.toThrow();
  });

  test('throws if AvailabilityZone is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const overrides: LaunchTemplateOverrides = {
      // @ts-ignore
      AvailabilityZone: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateOverrides(overrides, propertyName))

      // THEN
      .toThrowError(new RegExp(`The value of ${propertyName}.AvailabilityZone should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`));
  });

  test('throws if InstanceType is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const overrides: LaunchTemplateOverrides = {
      // @ts-ignore
      InstanceType: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateOverrides(overrides, propertyName))

      // THEN
      .toThrowError(new RegExp(`The value of ${propertyName}.InstanceType should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`));
  });

  test('throws if SpotPrice is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const overrides: LaunchTemplateOverrides = {
      // @ts-ignore
      SpotPrice: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateOverrides(overrides, propertyName))

      // THEN
      .toThrowError(new RegExp(`The value of ${propertyName}.SpotPrice should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`));
  });

  test('throws if SubnetId is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const overrides: LaunchTemplateOverrides = {
      // @ts-ignore
      SubnetId: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateOverrides(overrides, propertyName))

      // THEN
      .toThrowError(new RegExp(`The value of ${propertyName}.SubnetId should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`));
  });

  test('throws if WeightedCapacity is invalid', () => {
    // GIVEN
    const invalidValue = 'WeightedCapacity';
    const overrides: LaunchTemplateOverrides = {
      // @ts-ignore
      WeightedCapacity: invalidValue,
    };

    // WHEN
    expect(() => validateLaunchTemplateOverrides(overrides, propertyName))

      // THEN
      .toThrowError(`${propertyName}.WeightedCapacity type is not valid.`);
  });
});

describe('validateLaunchTemplateConfigs', () => {
  const LaunchTemplateSpec: LaunchTemplateSpecification = {
    Version: '1',
    LaunchTemplateId: 'id',
  };
  const Overrides: LaunchTemplateOverrides[] = [];

  test('accepts valid LaunchTemplateConfig', () => {
    // GIVEN
    const config: LaunchTemplateConfig = {
      LaunchTemplateSpecification: LaunchTemplateSpec,
      Overrides,
    };

    // WHEN
    expect(() => validateLaunchTemplateConfigs([config], propertyName))

      // THEN
      .not.toThrow();
  });

  test('throws when not given an array of LaunchTemplateConfigs', () => {
    // WHEN
    expect(() => {
      // @ts-ignore
      validateLaunchTemplateConfigs({}, propertyName);
    })

      // THEN
      .toThrowError(`${propertyName} should be an array with at least one element.`);
  });

  test('throws when LaunchTemplateSpecification is the wrong type', () => {
    // GIVEN
    const invalidValue = 123;
    const config: LaunchTemplateConfig = {
      // @ts-ignore
      LaunchTemplateSpecification: invalidValue,
      Overrides,
    };

    // WHEN
    expect(() => validateLaunchTemplateConfigs([config], propertyName))

      // THEN
      .toThrowError(`${propertyName}[0].LaunchTemplateSpecification type is not valid.`);
  });

  test('throws when Version is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const config: LaunchTemplateConfig = {
      LaunchTemplateSpecification: {
        LaunchTemplateId: '',
        // @ts-ignore
        Version: invalidValue,
      },
      Overrides,
    };

    // WHEN
    expect(() => validateLaunchTemplateConfigs([config], propertyName))

      // THEN
      .toThrowError(`The value of ${propertyName}[0].LaunchTemplateSpecification.Version should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`);
  });

  test('throws when Overrides is not an array', () => {
    // GIVEN
    const config: LaunchTemplateConfig = {
      LaunchTemplateSpecification: LaunchTemplateSpec,
      // @ts-ignore
      Overrides: 123,
    };

    // WHEN
    expect(() => validateLaunchTemplateConfigs([config], propertyName))

      // THEN
      .toThrowError(`${propertyName}[0].Overrides type is not valid.`);
  });

  test('throws when a LaunchTemplateOverride is invalid', () => {
    // GIVEN
    const invalidValue = 123;
    const config: LaunchTemplateConfig = {
      LaunchTemplateSpecification: LaunchTemplateSpec,
      Overrides: [{
        // @ts-ignore
        AvailabilityZone: invalidValue,
      }],
    };

    // WHEN
    expect(() => validateLaunchTemplateConfigs([config], propertyName))

      // THEN
      .toThrowError(`The value of ${propertyName}[0].Overrides[0].AvailabilityZone should be a string. Received: ${invalidValue} of type ${typeof(invalidValue)}`);
  });
});
