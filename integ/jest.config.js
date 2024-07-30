module.exports = {
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testTimeout: 180000,
  setupFilesAfterEnv: [
    "<rootDir>/components/deadline/common/jest-matchers.js"
  ]
};
