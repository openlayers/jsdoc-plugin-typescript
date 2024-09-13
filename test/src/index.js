/**
 * @module test
 */

import NumberStore from './sub/NumberStore.js';

/**
 * @param {import("proj4")} proj4 Proj4
 */
export function register(proj4) {
  // code here
}

/**
 * @param {import("geojson").Geometry} geometry The geometry.
 * @return {Array<number>} The bounding box.
 */
export function getBounds(geometry) {
  return [Infinity, Infinity, -Infinity, -Infinity];
}

/**
 * @param {number} number A number.
 * @return {import("./sub/NumberStore.js").default} A number store.
 */
export function getNumberStore(number) {
  return new NumberStore({number});
}

/**
 * @type {{a: number; b: string;c:{a:number},d: {a:number;b:string,c:number }; e: "{a: number; b: string;}"; }}
 */
export const interfaceSeparators = {
  a: 1,
  b: '2',
};

/**
 * @type {(...args: Parameters<typeof getNumberStore>) => void}
 */
export const tsFunctionSyntax = (...args) => {};

/**
 * @type {(a: () => void | (a: {a: string; b: number;}) => void) => void}
 */
export const tsFunctionSyntaxNested = (...args) => {};

/**
 * @type {function(number): void}
 */
export const jsdocFunctionSyntax = (...args) => {};

/**
 * @type {interfaceSeparators['a']}
 */
export const bracketNotation = 1;
