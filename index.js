require('string.prototype.matchall').shim();
const path = require('path');
const fs = require('fs');
const env = require('jsdoc/env'); // eslint-disable-line import/no-unresolved
const addInherited = require('jsdoc/augment').addInherited; // eslint-disable-line import/no-unresolved

const config = env.conf.typescript;
if (!config) {
  throw new Error(
    'Configuration "typescript" for jsdoc-plugin-typescript missing.',
  );
}
if (!('moduleRoot' in config)) {
  throw new Error(
    'Configuration "typescript.moduleRoot" for jsdoc-plugin-typescript missing.',
  );
}
const moduleRoot = config.moduleRoot;
const moduleRootAbsolute = path.join(process.cwd(), moduleRoot);
if (!fs.existsSync(moduleRootAbsolute)) {
  throw new Error(
    'Directory "' +
      moduleRootAbsolute +
      '" does not exist. Check the "typescript.moduleRoot" config option for jsdoc-plugin-typescript',
  );
}

const importRegEx =
  /import\(["']([^"']*)["']\)(?:\.([^ \.\|\}><,\)=#\n]*))?([ \.\|\}><,\)=#\n])/g;
const typedefRegEx = /@typedef \{[^\}]*\} (\S+)/g;
const noClassdescRegEx = /@(typedef|module|type)/;
const extensionReplaceRegEx = /\.m?js$/;
const slashRegEx = /\\/g;

const moduleInfos = {};
const fileNodes = {};

function getExtension(absolutePath) {
  return extensionReplaceRegEx.test(absolutePath)
    ? extensionReplaceRegEx.exec(absolutePath)[0]
    : '.js';
}

function getModuleInfo(moduleId, extension, parser) {
  if (!moduleInfos[moduleId]) {
    if (!fileNodes[moduleId]) {
      const absolutePath = path.join(
        process.cwd(),
        moduleRoot,
        moduleId + extension,
      );
      if (!fs.existsSync(absolutePath)) {
        return null;
      }
      const file = fs.readFileSync(absolutePath, 'UTF-8');
      fileNodes[moduleId] = parser.astBuilder.build(file, absolutePath);
    }
    moduleInfos[moduleId] = {namedExports: {}};
    const moduleInfo = moduleInfos[moduleId];
    const node = fileNodes[moduleId];
    if (node.program && node.program.body) {
      const classDeclarations = {};
      const nodes = node.program.body;
      for (let i = 0, ii = nodes.length; i < ii; ++i) {
        const node = nodes[i];
        if (node.type === 'ClassDeclaration') {
          classDeclarations[node.id.name] = node;
        } else if (node.type === 'ExportDefaultDeclaration') {
          const classDeclaration = classDeclarations[node.declaration.name];
          if (classDeclaration) {
            moduleInfo.defaultExport = classDeclaration.id.name;
          }
        } else if (
          node.type === 'ExportNamedDeclaration' &&
          node.declaration &&
          node.declaration.type === 'ClassDeclaration'
        ) {
          moduleInfo.namedExports[node.declaration.id.name] = true;
        }
      }
    }
  }
  return moduleInfos[moduleId];
}

function getDefaultExportName(moduleId, parser) {
  return getModuleInfo(moduleId, parser).defaultExport;
}

function getDelimiter(moduleId, symbol, parser) {
  return getModuleInfo(moduleId, parser).namedExports[symbol] ? '.' : '~';
}

/**
 * Replaces text by indices where each element of `replacements` is `[startIndex, endIndex, replacement]`.
 *
 * Note: This function does not handle nested replacements.
 *
 * @param {string} text The text to replace
 * @param {Array<[number, number, string]>} replacements The replacements to apply
 * @return {string} The text with replacements applied
 */
function replaceByIndices(text, replacements) {
  let offset = 0;
  let replacedText = text;

  replacements.forEach(([startIndex, endIndex, replacement], i) => {
    const head = replacedText.slice(0, startIndex + offset);
    const tail = replacedText.slice(endIndex + offset);

    replacedText = head + replacement + tail;

    offset += replacement.length - (endIndex - startIndex);
  });

  return replacedText;
}

exports.defineTags = function (dictionary) {
  const tags = [
    'type',
    'typedef',
    'property',
    'return',
    'param',
    'template',
    'default',
    'member',
  ];

  tags.forEach(function (tagName) {
    const tag = dictionary.lookUp(tagName);
    const oldOnTagText = tag.onTagText;

    /**
     * @param {string} tagText The tag text
     * @return {string} The modified tag text
     */
    tag.onTagText = function (tagText) {
      if (oldOnTagText) {
        tagText = oldOnTagText.apply(this, arguments);
      }

      const startIndex = tagText.search('{');
      if (startIndex === -1) {
        return tagText;
      }

      const len = tagText.length;

      /** @type {Array<[number, number, string]>} */
      let replacements = [];
      let openCurly = 0;
      let openRound = 0;
      let isWithinString = false;
      let quoteChar = '';
      let i = startIndex;
      let functionStartIndex;

      while (i < len) {
        switch (tagText[i]) {
          case '\\':
            // Skip escaped character
            ++i;
            break;
          case '"':
          case "'":
            if (isWithinString && quoteChar === tagText[i]) {
              isWithinString = false;
              quoteChar = '';
            } else if (!isWithinString) {
              isWithinString = true;
              quoteChar = tagText[i];
            }

            break;
          case ';':
            // Replace interface-style semi-colon separators with commas
            if (!isWithinString && openCurly > 1) {
              const isTrailingSemiColon = /^\s*}/.test(tagText.slice(i + 1));

              replacements.push([i, i + 1, isTrailingSemiColon ? '' : ',']);
            }

            break;
          case '(':
            if (openRound === 0) {
              functionStartIndex = i;
            }

            ++openRound;

            break;
          case ')':
            if (!--openRound) {
              // If round brackets form a function
              const returnMatch = tagText.slice(i + 1).match(/^\s*(:|=>)/);

              // Replace TS inline function syntax with JSDoc
              if (returnMatch) {
                const functionEndIndex = i + returnMatch[0].length + 1;
                const hasFunctionKeyword = /\bfunction\s*$/.test(
                  tagText.slice(0, functionStartIndex),
                );

                // Filter out any replacements that are within the function
                replacements = replacements.filter(([startIndex]) => {
                  return startIndex < functionStartIndex || startIndex > i;
                });

                replacements.push([
                  functionStartIndex,
                  functionEndIndex,
                  hasFunctionKeyword ? '():' : 'function():',
                ]);
              }

              functionStartIndex = null;
            }

            break;
          case '{':
            ++openCurly;
            break;
          case '}':
            if (!--openCurly) {
              const head = tagText.slice(0, startIndex);
              const tail = tagText.slice(i + 1);

              const replaced = replaceByIndices(
                tagText.slice(startIndex, i + 1),
                replacements,
              )
                // Replace `templateliteral` with 'templateliteral'
                .replace(/`([^`]*)`/g, "'$1'")
                // Bracket notation to dot notation
                .replace(
                  /(\w+|>|\)|\])\[(?:'([^']+)'|"([^"]+)")\]/g,
                  '$1.$2$3',
                );

              return head + replaced + tail;
            }

            break;
          default:
            break;
        }
        ++i;
      }
      throw new Error("Missing closing '}'");
    };
  });
};

exports.astNodeVisitor = {
  visitNode: function (node, e, parser, currentSourceName) {
    if (node.type === 'File') {
      const modulePath = path
        .relative(path.join(process.cwd(), moduleRoot), currentSourceName)
        .replace(extensionReplaceRegEx, '');
      fileNodes[modulePath] = node;
      const identifiers = {};
      if (node.program && node.program.body) {
        const nodes = node.program.body;
        for (let i = 0, ii = nodes.length; i < ii; ++i) {
          let node = nodes[i];
          let leadingComments = node.leadingComments;
          if (node.type === 'ExportNamedDeclaration' && node.declaration) {
            node = node.declaration;
            if (node.leadingComments) {
              leadingComments = node.leadingComments;
            }
          }
          if (node.type === 'ImportDeclaration') {
            node.specifiers.forEach((specifier) => {
              let defaultImport = false;
              switch (specifier.type) {
                case 'ImportDefaultSpecifier':
                  defaultImport = true;
                // fallthrough
                case 'ImportSpecifier':
                  identifiers[specifier.local.name] = {
                    defaultImport,
                    value: node.source.value,
                  };
                  break;
                default:
              }
            });
          } else if (node.type === 'VariableDeclaration') {
            for (const declaration of node.declarations) {
              let declarationComments = leadingComments;
              if (declaration.leadingComments) {
                declarationComments = declaration.leadingComments;
              }
              if (declarationComments && declarationComments.length > 0) {
                const comment =
                  declarationComments[declarationComments.length - 1].value;
                if (/@enum/.test(comment)) {
                  identifiers[declaration.id.name] = {
                    value: path.basename(currentSourceName),
                  };
                }
              }
            }
          } else if (node.type === 'ClassDeclaration') {
            if (node.id && node.id.name) {
              identifiers[node.id.name] = {
                value: path.basename(currentSourceName),
              };
            }

            if (!node.leadingComments) {
              node.leadingComments = [];
              // Restructure named exports of classes so only the class, but not
              // the export are documented
              if (
                node.parent &&
                node.parent.type === 'ExportNamedDeclaration' &&
                node.parent.leadingComments
              ) {
                for (
                  let i = node.parent.leadingComments.length - 1;
                  i >= 0;
                  --i
                ) {
                  const comment = node.parent.leadingComments[i];
                  if (
                    comment.value.indexOf('@classdesc') !== -1 ||
                    !noClassdescRegEx.test(comment.value)
                  ) {
                    node.leadingComments.push(comment);
                    node.parent.leadingComments.splice(i, 1);
                    const ignore =
                      parser.astBuilder.build('/** @ignore */').comments[0];
                    node.parent.leadingComments.push(ignore);
                  }
                }
              }
            }
            const leadingComments = node.leadingComments;
            if (
              leadingComments.length === 0 ||
              (leadingComments[leadingComments.length - 1].value.indexOf(
                '@classdesc',
              ) === -1 &&
                noClassdescRegEx.test(
                  leadingComments[leadingComments.length - 1].value,
                ))
            ) {
              // Create a suitable comment node if we don't have one on the class yet
              const comment = parser.astBuilder.build('/**\n */', 'helper')
                .comments[0];
              node.leadingComments.push(comment);
            }
            const leadingComment =
              leadingComments[node.leadingComments.length - 1];
            const lines = leadingComment.value.split(/\r?\n/);
            // Add @classdesc to make JSDoc show the class description
            if (leadingComment.value.indexOf('@classdesc') === -1) {
              lines[0] += ' @classdesc';
            }
            if (node.superClass) {
              // Remove the `@extends` tag because JSDoc does not does not handle generic type. (`@extends {Base<Type>}`)
              const extendsIndex = lines.findIndex((line) =>
                line.includes('@extends'),
              );
              if (extendsIndex !== -1) {
                lines.splice(extendsIndex, 1);
              }
              // Add class inheritance information because JSDoc does not honor
              // the ES6 class's `extends` keyword
              lines.push(lines[lines.length - 1]);
              const identifier = identifiers[node.superClass.name];
              if (identifier) {
                const absolutePath = path.resolve(
                  path.dirname(currentSourceName),
                  identifier.value,
                );
                // default to js extension since .js extention is assumed implicitly
                const extension = getExtension(absolutePath);
                const moduleId = path
                  .relative(path.join(process.cwd(), moduleRoot), absolutePath)
                  .replace(extensionReplaceRegEx, '');
                if (getModuleInfo(moduleId, extension, parser)) {
                  const exportName = identifier.defaultImport
                    ? getDefaultExportName(moduleId, parser)
                    : node.superClass.name;
                  const delimiter = identifier.defaultImport
                    ? '~'
                    : getDelimiter(moduleId, exportName, parser);
                  lines[lines.length - 2] =
                    ' * @extends ' +
                    `module:${moduleId.replace(slashRegEx, '/')}${
                      exportName ? delimiter + exportName : ''
                    }`;
                }
              } else {
                lines[lines.length - 2] = ' * @extends ' + node.superClass.name;
              }
              leadingComment.value = lines.join('\n');
            }
          }
        }
      }
      if (node.comments) {
        node.comments.forEach((comment) => {
          // Replace typeof Foo with Class<Foo>
          comment.value = comment.value.replace(
            /typeof ([^,\|\}\>]*)([,\|\}\>])/g,
            'Class<$1>$2',
          );

          // Remove `@override` annotations to avoid JSDoc breaking the inheritance chain
          comment.value = comment.value.replace(' @override', ' ');

          // Convert `import("path/to/module").export` to
          // `module:path/to/module~Name`
          let importMatch, lastImportPath, replaceAttempt;
          while ((importMatch = importRegEx.exec(comment.value))) {
            importRegEx.lastIndex = 0;
            const importExpression = importMatch[0];
            const importSource = importMatch[1];
            const exportName = importMatch[2] || 'default';
            const remainder = importMatch[3];

            let replacement;
            if (importSource.charAt(0) !== '.') {
              // simplified replacement for external packages
              replacement = `module:${importSource}${
                exportName === 'default' ? '' : '~' + exportName
              }`;
            } else {
              if (importExpression === lastImportPath) {
                ++replaceAttempt;
                if (replaceAttempt > 100) {
                  // infinite loop protection
                  throw new Error(
                    `Invalid docstring ${comment.value} in ${currentSourceName}.`,
                  );
                }
              } else {
                replaceAttempt = 0;
              }
              lastImportPath = importExpression;
              const rel = path.resolve(
                path.dirname(currentSourceName),
                importSource,
              );
              // default to js extension since .js extention is assumed implicitly
              const extension = getExtension(rel);
              const moduleId = path
                .relative(path.join(process.cwd(), moduleRoot), rel)
                .replace(extensionReplaceRegEx, '');
              if (getModuleInfo(moduleId, extension, parser)) {
                const name =
                  exportName === 'default'
                    ? getDefaultExportName(moduleId, parser)
                    : exportName;
                const delimiter =
                  exportName === 'default'
                    ? '~'
                    : getDelimiter(moduleId, name, parser);
                replacement = `module:${moduleId.replace(slashRegEx, '/')}${
                  name ? delimiter + name : ''
                }`;
              }
            }
            if (replacement) {
              comment.value = comment.value.replace(
                importExpression,
                replacement + remainder,
              );
            }
          }

          // Treat `@typedef`s like named exports
          const typedefMatches = comment.value
            .replace(/\s*\*\s*/g, ' ')
            .matchAll(typedefRegEx);
          for (const match of typedefMatches) {
            identifiers[match[1]] = {
              value: path.basename(currentSourceName),
            };
          }
        });

        node.comments.forEach((comment) => {
          // Replace local types with the full `module:` path
          Object.keys(identifiers).forEach((key) => {
            const eventRegex = new RegExp(
              `@(event |fires )${key}([^A-Za-z])`,
              'g',
            );
            replace(eventRegex);

            const typeRegex = new RegExp(
              `@(.*[{<|,(!?:]\\s*)${key}([^A-Za-z].*?\}|\})`,
              'g',
            );
            replace(typeRegex);

            function replace(regex) {
              if (regex.test(comment.value)) {
                const identifier = identifiers[key];
                const absolutePath = path.resolve(
                  path.dirname(currentSourceName),
                  identifier.value,
                );
                // default to js extension since .js extention is assumed implicitly
                const extension = getExtension(absolutePath);
                const moduleId = path
                  .relative(path.join(process.cwd(), moduleRoot), absolutePath)
                  .replace(extensionReplaceRegEx, '');
                if (getModuleInfo(moduleId, extension, parser)) {
                  const exportName = identifier.defaultImport
                    ? getDefaultExportName(moduleId, parser)
                    : key;
                  const delimiter = identifier.defaultImport
                    ? '~'
                    : getDelimiter(moduleId, exportName, parser);
                  const replacement = `module:${moduleId.replace(
                    slashRegEx,
                    '/',
                  )}${exportName ? delimiter + exportName : ''}`;
                  comment.value = comment.value.replace(
                    regex,
                    '@$1' + replacement + '$2',
                  );
                }
              }
            }
          });
        });
      }
    }
  },
};

exports.handlers = {
  parseComplete: function (e) {
    // Build inheritance chain after adding @extends annotations
    addInherited(e.doclets, e.doclets.index);
  },
};
