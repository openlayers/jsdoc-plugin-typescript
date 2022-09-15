const spawn = require('node:child_process').spawn;
const path = require('node:path');
const fse = require('fs-extra');
const diff = require('deep-diff-pizza');

async function main() {
  await jsdoc();
  const expected = await fse.readJSON(getPath('dest/expected.json'));
  const actual = await fse.readJSON(getPath('dest/actual.json'));
  return diff(expected, actual).filter((d) => d.operation !== 'UNCHANGED');
}

function getPath(rel) {
  return path.join(__dirname, rel);
}

function jsdoc() {
  return new Promise((resolve, reject) => {
    let errors = '';

    const child = spawn(
      'npx',
      ['jsdoc', '--configure', 'test/template/config.json'],
      {cwd: getPath('..')}
    );

    child.stderr.on('data', (data) => {
      errors += String(data);
    });

    child.on('exit', (code) => {
      if (code) {
        reject(new Error(errors || 'JSDoc failed with no output'));
        return;
      }

      resolve();
    });
  });
}

if (require.main === module) {
  main()
    .then((diffs) => {
      if (diffs.length === 0) {
        process.exit(0);
      }

      const message = JSON.stringify(diffs, null, 2);
      process.stderr.write(
        `actual.json does not match expected.json: \n${message}\n`,
        () => process.exit(1)
      );
    })
    .catch((err) => process.stderr.write(err.message, () => process.exit(1)));
}
