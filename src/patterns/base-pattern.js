/**
 * src/patterns/base-pattern.js
 *
 * BasePattern class:
 *   - Provides a common constructor that stores `options`.
 *   - Declares two required methods: `getNotes(stepIndex, context)` and `getLength()`.
 *   - Throws if not overridden.
 *   - Adds a `toConfig()` method for serializing the pattern’s essential data.
 *
 * Usage:
 *   import { BasePattern } from './base-pattern.js';
 *
 *   export class MyPattern extends BasePattern {
 *     constructor(options) {
 *       super(options);
 *       // custom logic...
 *     }
 *
 *     getNotes(stepIndex, context) {
 *       // must implement
 *     }
 *
 *     getLength() {
 *       // must implement
 *     }
 *
 *     // Optionally override toConfig() for more custom serialization
 *   }
 */

/**
 * @typedef {Object} PatternNote
 * @property {string} note - A note name (e.g., "C4", "D#3", or a drum note like "C1").
 * @property {number} [durationSteps] - Optional integer for how many steps the note should last.
 */

export class BasePattern {
  /**
   * Constructs the base pattern with optional configuration data.
   * @param {Object} [options={}] - A configuration object stored in this.options.
   */
  constructor(options = {}) {
    if (new.target === BasePattern) {
      throw new TypeError(
        "Cannot instantiate BasePattern directly; extend it instead."
      );
    }
    /**
     * @private
     * Store any pattern configuration (probabilities, arrays, etc.)
     */
    this.options = { ...options };
  }

  /**
   * Returns an array of PatternNote objects for the given step.
   * Subclasses must override this with their own note generation logic.
   *
   * @param {number} stepIndex - Current step index (usually 0-based).
   * @param {any} [context] - Optional context (chord info, scale, user data, etc.).
   * @returns {PatternNote[]} An array of notes/hits for this step.
   * @abstract
   */
  getNotes(stepIndex, context) {
    throw new Error("getNotes() must be implemented by subclass.");
  }

  /**
   * Returns the number of steps in the pattern before it repeats.
   * Subclasses must override this.
   *
   * @returns {number} The pattern length.
   * @abstract
   */
  getLength() {
    throw new Error("getLength() must be implemented by subclass.");
  }

  /**
   * Provides a default serialization of the pattern to a config object,
   * showing the pattern type (class name) and the stored options.
   *
   * Subclasses may override if more detail is needed.
   *
   * @returns {Object} A serializable object describing this pattern.
   */
  toConfig() {
    return {
      patternType: this.constructor.name,
      options: { ...this.options },
    };
  }
}
