import openlayers from 'eslint-config-openlayers';

/**
 * @type {Array<import("eslint").Linter.Config>}
 */
export default [
  ...openlayers,
  {
    rules: {
      'jsdoc/reject-function-type': 'off'
    }
  }
];
