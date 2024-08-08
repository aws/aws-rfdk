module.exports = {
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testTimeout: 300000,
  setupFilesAfterEnv: [
    "<rootDir>/components/deadline/common/jest-matchers.js"
  ]
};
