module.exports = {
  moduleFileExtensions: [
      "js",
  ],
  testMatch: [
      "**/?(*.)+(test).js",
  ],
  testEnvironment: "node",
  coverageThreshold: {
      global: {
          branches: 94,
          statements: 95,
      },
  },
  collectCoverage: true,
  coverageReporters: [
      "lcov",
      "html",
      "text-summary",
  ],
  coveragePathIgnorePatterns: [
      "<rootDir>/lib/.*\\.generated\\.[jt]s",
      "<rootDir>/test/.*\\.[jt]s",
  ],
  reporters: [
    "default",
      [ "jest-junit", { suiteName: "jest tests" } ]
  ]
};
