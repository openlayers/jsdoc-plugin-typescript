const path = require('path');
const fs = require('fs');
const env = require('jsdoc/env');
const addInherited = require('jsdoc/augment').addInherited;
const peg = require("pegjs");

const config = env.conf.typescript;
if (!config) {
  throw new Error('Configuration "typescript" for jsdoc-plugin-typescript missing.');
}
if (!'moduleRoot' in config) {
  throw new Error('Configuration "typescript.moduleRoot" for jsdoc-plugin-typescript missing.');
}
const moduleRoot = config.moduleRoot;
const moduleRootAbsolute = path.join(process.cwd(), moduleRoot);
if (!fs.existsSync(moduleRootAbsolute)) {
  throw new Error('Directory "' + moduleRootAbsolute + '" does not exist. Check the "typescript.moduleRoot" config option for jsdoc-plugin-typescript');
}

const importRegEx = /import\(["']([^"']*)["']\)\.([^ \.\|\}><,\)=#\n]*)([ \.\|\}><,\)=#\n])/g;
const typedefRegEx = /@typedef \{[^\}]*\} (\S+)/g;
const noClassdescRegEx = /@(typedef|module|type)/;
const slashRegEx = /\\/g;

const moduleInfos = {};
const fileNodes = {};
let differences = 0;

const pegRules = fs.readFileSync(path.join(__dirname, "./type_rewrite_peg_rules.txt"), 'utf8')
  + '\n\n' + generateBuiltinTypeRules();

function makeRule(name, rules) {
  return name + '\n  = ' + rules.sort().reverse().join('\n  / ') + '\n';
}

function generateBuiltinTypeRules() {
  const types = [];
  function readFile(name) {
    const path = require.resolve(name, { paths: [__dirname, moduleRootAbsolute]});
    const content = fs.readFileSync(path, 'utf8');
    const typeMatches = content.matchAll(/^(interface|type)\s*(\w*)/gm);
    for (const match of typeMatches) {
      types.push(`"${match[2]}"`);
    }
  }
  readFile('typescript/lib/lib.dom.d.ts');
  readFile('typescript/lib/lib.es5.d.ts');
  readFile('typescript/lib/lib.webworker.d.ts');
  return `BuiltinType\n  = w:Word & { return [${types.sort().join(',')}].includes(flatten(w)) }`
}

function buildTypeRewriteRules(identifiers, parser, currentSourceName) {
  const rules = [];
  for (const key of Object.keys(identifiers)) {
    const identifier = identifiers[key];
    const absolutePath = path.resolve(path.dirname(currentSourceName), identifier.value);
    const moduleId = path.relative(path.join(process.cwd(), moduleRoot), absolutePath).replace(/\.js$/, '');
    if (getModuleInfo(moduleId, parser)) {
      const exportName = identifier.defaultImport ? getDefaultExportName(moduleId, parser) : key;
      const delimiter = identifier.defaultImport ? '~' : getDelimiter(moduleId, exportName, parser);
      const replacement = `module:${moduleId.replace(slashRegEx, '/')}${exportName ? delimiter + exportName : ''}`;
      rules.push(`"${key}" & NoChar { return "${replacement}" }`);
    } else {
      rules.push(`"${key}" & NoChar`);
    }
  }
  return pegRules + '\n\n' + makeRule('RewriteType', rules);
}

function getModuleInfo(moduleId, parser) {
  if (!moduleInfos[moduleId]) {
    if (!fileNodes[moduleId]) {
      const absolutePath = path.join(process.cwd(), moduleRoot, moduleId + '.js');
      if (!fs.existsSync(absolutePath)) {
        return null;
      }
      const file = fs.readFileSync(absolutePath, 'UTF-8');
      fileNodes[moduleId] = parser.astBuilder.build(file, absolutePath);
    }
    const moduleInfo = moduleInfos[moduleId] = {
      namedExports: {}
    };
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
        } else if (node.type === 'ExportNamedDeclaration' && node.declaration && node.declaration.type === 'ClassDeclaration') {
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
  return getModuleInfo(moduleId, parser).namedExports[symbol] ? '.' : '~'
}

exports.astNodeVisitor = {

  visitNode: function(node, e, parser, currentSourceName) {
    if (node.type === 'File') {
      const relPath = path.relative(process.cwd(), currentSourceName);
      const modulePath = path.relative(path.join(process.cwd(), moduleRoot), currentSourceName).replace(/\.js$/, '');
      fileNodes[modulePath] = node;
      const identifiers = {};
      let templateParameters = [];
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
            node.specifiers.forEach(specifier => {
              let defaultImport = false;
              switch (specifier.type) {
                case 'ImportDefaultSpecifier':
                  defaultImport = true;
                  // fallthrough
                case 'ImportSpecifier':
                  identifiers[specifier.local.name] = {
                    defaultImport,
                    value: node.source.value
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
                const comment = declarationComments[declarationComments.length - 1].value;
                if (/@enum/.test(comment)) {
                  identifiers[declaration.id.name] = {
                    value: path.basename(currentSourceName)
                  };
                }
              }
            }
          } else if (node.type === 'ClassDeclaration') {
            if (node.id && node.id.name) {
              identifiers[node.id.name] = {
                value: path.basename(currentSourceName)
              };
            }

            if (!node.leadingComments) {
              node.leadingComments = [];
              // Restructure named exports of classes so only the class, but not
              // the export are documented
              if (node.parent && node.parent.type === 'ExportNamedDeclaration' && node.parent.leadingComments) {
                for (let i = node.parent.leadingComments.length - 1; i >= 0; --i) {
                  const comment = node.parent.leadingComments[i];
                  if (comment.value.indexOf('@classdesc') !== -1 || !noClassdescRegEx.test(comment.value)) {
                    node.leadingComments.push(comment);
                    node.parent.leadingComments.splice(i, 1);
                    const ignore = parser.astBuilder.build('/** @ignore */').comments[0];
                    node.parent.leadingComments.push(ignore);
                  }
                }
              }
            }
            const leadingComments = node.leadingComments;
            if (leadingComments.length === 0 || leadingComments[leadingComments.length - 1].value.indexOf('@classdesc') === -1 &&
                noClassdescRegEx.test(leadingComments[leadingComments.length - 1].value)) {
              // Create a suitable comment node if we don't have one on the class yet
              const comment = parser.astBuilder.build('/**\n */', 'helper').comments[0];
              node.leadingComments.push(comment);
            }
            const leadingComment = leadingComments[node.leadingComments.length - 1];
            const lines = leadingComment.value.split(/\r?\n/);
            // Add @classdesc to make JSDoc show the class description
            if (leadingComment.value.indexOf('@classdesc') === -1) {
              lines[0] += ' @classdesc';
            }
            if (node.superClass) {
              // Remove the `@extends` tag because JSDoc does not does not handle generic type. (`@extends {Base<Type>}`)
              const extendsIndex = lines.findIndex(line => line.includes('@extends'));
              if (extendsIndex !== -1) {
                lines.splice(extendsIndex, 1);
              }
              // Add class inheritance information because JSDoc does not honor
              // the ES6 class's `extends` keyword
              lines.push(lines[lines.length - 1]);
              const identifier = identifiers[node.superClass.name];
              if (identifier) {
                const absolutePath = path.resolve(path.dirname(currentSourceName), identifier.value);
                const moduleId = path.relative(path.join(process.cwd(), moduleRoot), absolutePath).replace(/\.js$/, '');
                if (getModuleInfo(moduleId, parser)) {
                  const exportName = identifier.defaultImport ? getDefaultExportName(moduleId, parser) : node.superClass.name;
                  const delimiter = identifier.defaultImport ? '~' : getDelimiter(moduleId, exportName, parser);
                  lines[lines.length - 2] = ' * @extends ' + `module:${moduleId.replace(slashRegEx, '/')}${exportName ? delimiter + exportName : ''}`;
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
        node.comments.forEach(comment => {
          // Replace typeof Foo with Class<Foo>
          comment.value = comment.value.replace(/typeof ([^,\|\}\>]*)([,\|\}\>])/g, 'Class<$1>$2');

          // Convert `import("path/to/module").export` to
          // `module:path/to/module~Name`
          let importMatch;
          while ((importMatch = importRegEx.exec(comment.value))) {
            importRegEx.lastIndex = 0;
            let replacement;
            if (importMatch[1].charAt(0) !== '.') {
              // simplified replacement for external packages
              replacement = `module:${importMatch[1]}${importMatch[2] === 'default' ? '' : '~' + importMatch[2]}`;
            } else {
              const rel = path.resolve(path.dirname(currentSourceName), importMatch[1]);
              const moduleId = path.relative(path.join(process.cwd(), moduleRoot), rel).replace(/\.js$/, '');
              if (getModuleInfo(moduleId, parser)) {
                const exportName = importMatch[2] === 'default' ? getDefaultExportName(moduleId, parser) : importMatch[2];
                const delimiter = importMatch[2] === 'default' ? '~' : getDelimiter(moduleId, exportName, parser);
                replacement = `module:${moduleId.replace(slashRegEx, '/')}${exportName ? delimiter + exportName : ''}`;
              }
            }
            if (replacement) {
              comment.value = comment.value.replace(importMatch[0], replacement + importMatch[3]);
            }
          }

          // Treat `@typedef`s like named exports
          const typedefMatches = comment.value.replace(/\s*\*\s*/g, ' ').matchAll(typedefRegEx);
          for (const match of typedefMatches) {
            identifiers[match[1]] = {
              value: path.basename(currentSourceName)
            };
          }

          // Gather template Parameters
          const templateMatches = comment.value.replace(/\s*,\s*/g, ',').matchAll(/@template\s+(?:\{[^}]+}\s+)?([\w,]+)/g);
          for (const match of templateMatches) {
            templateParameters = templateParameters.concat(match[1].split(','));
          }
        });

        if (Object.keys(identifiers).length > 0) {
          // Replace local types with the full `module:` path

          let templateRule = '';
          if (templateParameters.length > 0) {
            templateRule = makeRule('TemplateParameter', templateParameters.map(t => `"${t}" & NoChar`));
          } else {
            templateRule = 'TemplateParameter = & { return false }\n';
          }

          const rules = buildTypeRewriteRules(identifiers, parser, currentSourceName)
            + '\n' + templateRule;

          const rewriter = peg.generate(rules);

          node.comments.forEach(comment => {
            const before = comment.value;

            comment.value = rewriter.parse(comment.value);

            let regexVersion = before;

            Object.keys(identifiers).forEach(key => {
              const eventRegex = new RegExp(`@(event |fires )${key}([^A-Za-z])`, 'g');
              replace(eventRegex);

              const typeRegex = new RegExp(`@(.*[{<|,(!?:]\\s*)${key}([^A-Za-z].*?\}|\})`, 'g');
              replace(typeRegex);

              function replace(regex) {
                if (regex.test(regexVersion)) {
                  const identifier = identifiers[key];
                  const absolutePath = path.resolve(path.dirname(currentSourceName), identifier.value);
                  const moduleId = path.relative(path.join(process.cwd(), moduleRoot), absolutePath).replace(/\.js$/, '');
                  if (getModuleInfo(moduleId, parser)) {
                    const exportName = identifier.defaultImport ? getDefaultExportName(moduleId, parser) : key;
                    const delimiter = identifier.defaultImport ? '~' : getDelimiter(moduleId, exportName, parser);
                    let replacement = `module:${moduleId.replace(slashRegEx, '/')}${exportName ? delimiter + exportName : ''}`;
                    regexVersion = regexVersion.replace(regex, '@$1' + replacement + '$2');
                  }
                }
              }
            });

            if (comment.value !== regexVersion) {
              console.log(before);
              console.log(comment.value);
              differences++;
            }
          });
        }
      }
    }
  }

};

exports.handlers = {
  parseComplete: function(e) {
    // Build inheritance chain after adding @extends annotations
    addInherited(e.doclets, e.doclets.index);
    console.log(`Differences: ${differences}`);
  }
}
