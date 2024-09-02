# jsdoc-plugin-typescript

Plugin to make TypeScript's JSDoc type annotations work with JSDoc. Requires JSDoc v3.6.0 or higher.

## Installation and use

JSDoc accepts plugins by simply installing their npm package:

    npm install --save-dev jsdoc-plugin-typescript

To configure JSDoc to use the plugin, add the following to the JSDoc configuration file, e.g. `conf.json`:

```jsonc
"plugins": [
  "jsdoc-plugin-typescript"
],
"typescript": {
  "moduleRoot": "src" // optional
}
```

See http://usejsdoc.org/about-configuring-jsdoc.html for more details on how to configure JSDoc.

If `typescript.moduleRoot` is specified, the plugin will assume module ids are relative to that directory and format them as such. For example, `@type {import("./folder/file").Class}` will be converted to `@type {module:folder/file.Class}`. The file extension is removed along with any leading `../` segments (if the referenced module is outside `moduleRoot`).

In the absence of `typescript.moduleRoot`, the plugin will mirror the method JSDoc uses to assign module ids:

1. Parse the referenced module for an `@module` tag.
2. If a tag is found and it has an explicit id, use that.
3. If a tag is found, but it doesn't have an explicit id, use the file path relative to the **nearest shared parent directory**, and remove the file extension.

## What this plugin does

When using the `class` keyword for defining classes (required by TypeScript), JSDoc requires `@classdesc` and `@extends` annotations. With this plugin, no `@classdesc` and `@extends` annotations are needed.

Types defined in a project are converted to JSDoc module paths, so they can be documented and linked properly.

In addition to types that are used in the same file that they are defined in, imported types are also supported.

TypeScript and JSDoc use a different syntax for imported types. This plugin converts the TypeScript types so JSDoc can handle them:

### TypeScript

**Named export:**
```js
/**
 * @type {import("./path/to/module").exportName}
 */
```

**Default export:**
```js
/**
 * @type {import("./path/to/module").default}
 */
```

**typeof type:**
```js
/**
 * @type {typeof import("./path/to/module").exportName}
 */
```

**Template literal type**
```js
/**
 * @type {`static:${dynamic}`}
 */

**@override annotations**

are removed because they make JSDoc stop inheritance

### JSDoc

**Named export:**
```js
/**
 * @type {module:path/to/module.exportName}
 */
```

**Default export assigned to a variable in the exporting module:**
```js
/**
 * @type {module:path/to/module~variableOfDefaultExport}
 */
```

This syntax is also used when referring to types of `@typedef`s and `@enum`s.

**Anonymous default export:**
```js
/**
 * @type {module:path/to/module}
 */
```

**typeof type:**
```js
/**
 * @type {Class<module:path/to/module.exportName>}
 */
```

**Template literal type**
```js
/**
 * @type {'static:${dynamic}'}
 */
```

## Contributing

If you are interested in making a contribution to the project, please see the [contributing page](./contributing.md) for details on getting your development environment set up.
