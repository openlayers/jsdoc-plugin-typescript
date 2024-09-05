// Import statement required for JSDoc to include first comment as leading comment of the class.
// Otherwise, it gets moved in the AST to the `Program` node from the `ExportNamedDeclaration` class node:
// https://github.com/jsdoc/jsdoc/blob/main/packages/jsdoc-ast/lib/walker.js#L465
// This itself may be a bug, as it seems to be intended for @module comments.
import ''; // eslint-disable-line

/*
  Comment
*/

/**
 * Doclet
 */
export class LeadingComments {}
