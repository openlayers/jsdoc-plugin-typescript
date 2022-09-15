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
