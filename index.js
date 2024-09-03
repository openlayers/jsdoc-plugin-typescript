require('string.prototype.matchall').shim();
const path = require('path');
const fs = require('fs');
const env = require('jsdoc/env'); // eslint-disable-line import/no-unresolved
const addInherited = require('jsdoc/augment').addInherited; // eslint-disable-line import/no-unresolved

const config = env.conf;
const moduleRoot = config.typescript ? config.typescript.moduleRoot : undefined;
const moduleRootAbsolute = moduleRoot
  ? path.join(process.cwd(), moduleRoot)
  : undefined;

if (moduleRootAbsolute && !fs.existsSync(moduleRootAbsolute)) {
  throw new Error(
    'Directory "' +
      moduleRootAbsolute +
      '" does not exist. Check the "typescript.moduleRoot" config option for jsdoc-plugin-typescript'
  );
}

const importRegEx =
  /import\(["']([^"']*)["']\)(?:\.([^ \.\|\}><,\)=#\n]*))?([ \.\|\}><,\)=#\n])/g;
const typedefRegEx = /@typedef \{[^\}]*\} (\S+)/g;
const noClassdescRegEx = /@(typedef|module|type)/;
const extensionReplaceRegEx = /\.m?js$/;
const extensionEnsureRegEx = /(\.js)?$/;
const slashRegEx = /\\/g;
const leadingPathSegmentRegEx = /^(.?.[/\\])+/;

const moduleInfos = {};
const fileNodes = {};

// Without explicit module ids, JSDoc will use the nearest shared parent directory
/** @type {string} */
let implicitModuleRoot;

/**
 * Without explicit module ids, JSDoc will use the nearest shared parent directory.
 * @return {string} The implicit root path with which to resolve all module ids against.
 */
function getImplicitModuleRoot() {
  if (implicitModuleRoot) {
    return implicitModuleRoot;
  }

  if (!env.sourceFiles || env.sourceFiles.length === 0) {
    return process.cwd();
  }

  // Find the nearest shared parent directory
  implicitModuleRoot = path.dirname(env.sourceFiles[0]);

  env.sourceFiles.slice(1).forEach((filePath) => {
    if (filePath.startsWith(implicitModuleRoot)) {
      return;
    }

    const currParts = filePath.split(path.sep);
    const nearestParts = implicitModuleRoot.split(path.sep);

    for (let i = 0; i < currParts.length; ++i) {
      if (currParts[i] !== nearestParts[i]) {
        implicitModuleRoot = currParts.slice(0, i).join(path.sep);

        return;
      }
    }
  });

  return implicitModuleRoot;
}

function getModuleId(modulePath) {
  // Use moduleRoot if set
  if (moduleRootAbsolute) {
    return path
      .relative(moduleRootAbsolute, modulePath)
      .replace(extensionReplaceRegEx, '')
      .replace(leadingPathSegmentRegEx, '');
  }

  // Search for explicit module id
  if (fileNodes[modulePath]) {
    for (const comment of fileNodes[modulePath].comments) {
      if (!/@module(?=\s)/.test(comment.value)) {
        continue;
      }

      const explicitModuleId = comment.value
        .split(/@module(?=\s)/)[1]
        .split(/\n+\s*\*\s*@\w+/)[0] // Split before the next tag
        .replace(/\n+\s*\*|\{[^\}]*\}/g, '') // Remove new lines with asterisks, and type annotations
        .trim();

      if (explicitModuleId) {
        return explicitModuleId;
      }
    }
  }

  return path
    .relative(getImplicitModuleRoot(), modulePath)
    .replace(extensionReplaceRegEx, '');
}

function getModuleInfo(modulePath, parser) {
  if (!moduleInfos[modulePath]) {
    if (!fileNodes[modulePath]) {
      if (!fs.existsSync(modulePath)) {
        return null;
      }

      const file = fs.readFileSync(modulePath, 'UTF-8');

      fileNodes[modulePath] = parser.astBuilder.build(file, modulePath);
    }

    moduleInfos[modulePath] = {
      id: getModuleId(modulePath),
      namedExports: {},
    };

    const moduleInfo = moduleInfos[modulePath];
    const node = fileNodes[modulePath];

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

  return moduleInfos[modulePath];
}

function getDefaultExportName(modulePath) {
  return getModuleInfo(modulePath).defaultExport;
}

function getDelimiter(modulePath, symbol) {
  return getModuleInfo(modulePath).namedExports[symbol] ? '.' : '~';
}

function withJsExt(filePath) {
  return filePath.replace(extensionEnsureRegEx, '.js');
}

exports.defineTags = function (dictionary) {
  ['type', 'typedef', 'property', 'return', 'param', 'template'].forEach(
    function (tagName) {
      const tag = dictionary.lookUp(tagName);
      const oldOnTagText = tag.onTagText;
      tag.onTagText = function (tagText) {
        if (oldOnTagText) {
          tagText = oldOnTagText.apply(this, arguments);
        }
        // Replace `templateliteral` with 'templateliteral'
        const startIndex = tagText.search('{');
        if (startIndex === -1) {
          return tagText;
        }
        const len = tagText.length;
        let open = 0;
        let i = startIndex;
        while (i < len) {
          switch (tagText[i]) {
            case '\\':
              // Skip escaped character
              ++i;
              break;
            case '{':
              ++open;
              break;
            case '}':
              if (!--open) {
                return (
                  tagText.slice(0, startIndex) +
                  tagText
                    .slice(startIndex, i + 1)
                    .replace(/`([^`]*)`/g, "'$1'") +
                  tagText.slice(i + 1)
                );
              }
              break;
            default:
              break;
          }
          ++i;
        }
        throw new Error("Missing closing '}'");
      };
    }
  );
};

exports.astNodeVisitor = {
  visitNode: function (node, e, parser, currentSourceName) {
    if (node.type === 'File') {
      fileNodes[currentSourceName] = node;
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
                '@classdesc'
              ) === -1 &&
                noClassdescRegEx.test(
                  leadingComments[leadingComments.length - 1].value
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
                line.includes('@extends')
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
                  withJsExt(identifier.value)
                );

                if (getModuleInfo(absolutePath, parser)) {
                  const moduleId = moduleInfos[absolutePath].id;

                  const exportName = identifier.defaultImport
                    ? getDefaultExportName(absolutePath)
                    : node.superClass.name;
                  const delimiter = identifier.defaultImport
                    ? '~'
                    : getDelimiter(absolutePath, exportName);
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
            'Class<$1>$2'
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
                    `Invalid docstring ${comment.value} in ${currentSourceName}.`
                  );
                }
              } else {
                replaceAttempt = 0;
              }
              lastImportPath = importExpression;
              const rel = path.resolve(
                path.dirname(currentSourceName),
                withJsExt(importSource)
              );

              if (getModuleInfo(rel, parser)) {
                const moduleId = moduleInfos[rel].id;

                const name =
                  exportName === 'default'
                    ? getDefaultExportName(rel)
                    : exportName;
                const delimiter =
                  exportName === 'default' ? '~' : getDelimiter(rel, name);
                replacement = `module:${moduleId.replace(slashRegEx, '/')}${
                  name ? delimiter + name : ''
                }`;
              }
            }
            if (replacement) {
              comment.value = comment.value.replace(
                importExpression,
                replacement + remainder
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
              'g'
            );
            replace(eventRegex);

            const typeRegex = new RegExp(
              `@(.*[{<|,(!?:]\\s*)${key}([^A-Za-z].*?\}|\})`,
              'g'
            );
            replace(typeRegex);

            function replace(regex) {
              if (regex.test(comment.value)) {
                const identifier = identifiers[key];
                const absolutePath = path.resolve(
                  path.dirname(currentSourceName),
                  withJsExt(identifier.value)
                );

                if (getModuleInfo(absolutePath, parser)) {
                  const moduleId = moduleInfos[absolutePath].id;

                  const exportName = identifier.defaultImport
                    ? getDefaultExportName(absolutePath)
                    : key;
                  const delimiter = identifier.defaultImport
                    ? '~'
                    : getDelimiter(absolutePath, exportName);
                  const replacement = `module:${moduleId.replace(
                    slashRegEx,
                    '/'
                  )}${exportName ? delimiter + exportName : ''}`;
                  comment.value = comment.value.replace(
                    regex,
                    '@$1' + replacement + '$2'
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
