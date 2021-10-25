module.exports = {
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testTimeout: 60000,
  setupFilesAfterEnv: [
    "<rootDir>/components/deadline/common/jest-matchers.js"
  ]
};
