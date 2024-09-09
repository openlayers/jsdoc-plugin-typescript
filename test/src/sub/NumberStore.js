/**
 * @module test/sub/NumberStore
 */

/**
 * @typedef {Object} Options
 * @property {number} number A number.
 */

/**
 * @classdesc
 * A test class.
 */
class NumberStore {
  /**
   * @param {Options} options The options.
   */
  constructor(options) {
    /**
     * @type {number}
     * @private
     */
    this.num_ = options.number;
  }

  /**
   * @return {number} A number.
   */
  getNumber() {
    return this.num_;
  }
}

export default NumberStore;
