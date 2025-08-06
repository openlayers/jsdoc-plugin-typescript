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
```

See https://jsdoc.app/about-configuring-jsdoc for more details on how to configure JSDoc.

## What this plugin does

When using the `class` keyword for defining classes (required by TypeScript), JSDoc requires `@classdesc` and `@extends` annotations. With this plugin, no `@classdesc` and `@extends` annotations are needed.

Types defined in a project are converted to JSDoc module paths, so they can be documented and linked properly.

In addition to types that are used in the same file that they are defined in, imported types are also supported.

TypeScript and JSDoc use a different syntax for imported types. This plugin converts the TypeScript types so JSDoc can handle them:

### Named export

```js
/**
 * @type {import("./path/to/module").exportName}
 */
```

To:

```js
/**
 * @type {module:path/to/module.exportName}
 */
```

### Default export

```js
/**
 * @type {import("./path/to/module").default}
 */
```

To:

```js
/**
 * @type {module:path/to/module}
 */
```

When assigned to a variable in the exporting module:

```js
/**
 * @type {module:path/to/module~variableOfDefaultExport}
 */
```

This syntax is also used when referring to types of `@typedef`s and `@enum`s.

### `@link` tags

```js
/**
 * {@link Identifier}
 */

/**
 * {@link Identifier Link text}
 */

/**
 * {@link Identifier.member}
 */
```

To:

```js
/**
 * {@link module:path/to/module.Identifier Identifier}
 */

/**
 * {@link module:path/to/module.Identifier Link text}
 */

/**
 * Member accessors are not currently linked to, just the root identifier:
 * {@link module:path/to/module.Identifier Identifier.member}
 */
```

### `typeof type`

```js
/**
 * @type {typeof import("./path/to/module").exportName}
 */
```

To:

```js
/**
 * @type {Class<module:path/to/module.exportName>}
 */
```

### Template literal type

```js
/**
 * @type {`static:${dynamic}`}
 */
```

To:

```js
/**
 * @type {'static:${dynamic}'}
 */
```

### @override annotations

are removed because they make JSDoc stop inheritance

### Interface style semi-colon separators

```js
/**
 * @type {{a: number; b: string;}}
 */
```

To:

```js
/**
 * @type {{a: number, b: string}}
 */
```

Also removes trailing commas from object types.

### TS inline function syntax

```js
/**
 * @type {(a: number, b: string) => void}
 */
```

To:

```js
/**
 * @type {function(): void}
 */
```

### Bracket notation

```js
/**
 * @type {obj['key']}
 */
```

To:

```js
/**
 * @type {obj.key}
 */
```

### Tuples

```js
/**
 * @type {[string, number]}
 */
```

To:

```js
/**
 * @type {Array}
 */
```

## Module id resolution

For resolving module ids, this plugin mirrors the method used by JSDoc:

1. Parse the referenced module for an `@module` tag.
2. If a tag is found and it has an explicit id, use that.
3. If a tag is found, but it doesn't have an explicit id, use the module's file path relative to the nearest shared parent directory, and remove the file extension.

## Contributing

If you are interested in making a contribution to the project, please see the [contributing page](./contributing.md) for details on getting your development environment set up.
