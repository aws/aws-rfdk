/**
 * Returns the current repo version.
 * 
 * Usage:
 * 
 *    const version = require('./get-version');
 * 
 * Or from the command line:
 * 
 *    node -p "require('./get-version')""
 * 
 */

module.exports = require(`../package.json`).version;