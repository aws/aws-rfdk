const baseConfig = require('./config/eslintrc');
baseConfig.parserOptions.project = __dirname + '/tsconfig.json';
baseConfig.rules["license-header/header"][0] = 'off';
// Disable linting of white-space between the TyepScript type annotation syntax on this package to help merge
// upstream code.
baseConfig.rules["@typescript-eslint/type-annotation-spacing"][0] = 'off';
module.exports = baseConfig;
