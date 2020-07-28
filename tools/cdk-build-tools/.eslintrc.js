const baseConfig = require('./config/eslintrc');
baseConfig.parserOptions.project = __dirname + '/tsconfig.json';
baseConfig.rules["license-header/header"][0] = 'off';
module.exports = baseConfig;