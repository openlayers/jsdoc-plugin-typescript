const fse = require('fs-extra');

const propsToRemove = {
  id: true,
  path: true,
};

function sanitizeObject(obj) {
  for (const key in obj) {
    if (propsToRemove[key] || key.startsWith('_')) {
      delete obj[key];
      continue;
    }

    const value = obj[key];
    if (typeof value === 'object') {
      sanitizeObject(value);
      continue;
    }
  }
}

/**
 * Publish hook for the JSDoc template.  Writes to JSON stdout.
 * @param {Function} data The root of the Salty DB containing doclet records.
 * @param {Object} opts Options.
 * @return {Promise} A promise that resolves when writing is complete.
 */
exports.publish = function (data, opts) {
  const docs = data(function () {
    return this.kind !== 'package';
  }).get();

  const sanitized = docs.map((doclet) => {
    const obj = JSON.parse(JSON.stringify(doclet));
    sanitizeObject(obj);
    return obj;
  });

  const output = JSON.stringify(sanitized, null, 2);
  return fse.outputFile(opts.destination, output);
};
