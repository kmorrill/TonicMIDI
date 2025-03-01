/**
 * src/patterns/pattern-interface.js
 *
 * In JavaScript, there's no built-in "interface" keyword. Instead, we use:
 * 1) JSDoc to specify the contract.
 * 2) (Optional) An abstract base class that throws errors if methods are not implemented.
 *
 * Usage:
 *   import { AbstractPattern } from './pattern-interface.js';
 *
 *   export class MyPattern extends AbstractPattern {
 *     getNotes(stepIndex, context) {
 *       // return an array of { note: string, durationSteps?: number }
 *     }
 *     getLength() {
 *       // return total number of steps in pattern
 *     }
 *   }
 */

/**
 * @typedef {Object} PatternNote
 * @property {string} note - A note name (e.g., "C4", "D#3", or a drum note like "C1").
 * @property {number} [durationSteps] - (Optional) How many integer steps the note should last.
 */

/**
 * A Pattern interface. Classes that implement this interface must:
 *  1. Provide a `getNotes(stepIndex, context?)` method.
 *  2. Provide a `getLength()` method.
 *
 * @interface
 */
export class AbstractPattern {
  constructor() {
    if (new.target === AbstractPattern) {
      throw new TypeError(
        "Cannot instantiate AbstractPattern directly; extend it instead."
      );
    }
  }

  /**
   * Returns an array of PatternNote objects for the given step.
   * This method must be implemented by a subclass.
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
   * This method must be implemented by a subclass.
   *
   * @returns {number} The pattern length.
   * @abstract
   */
  getLength() {
    throw new Error("getLength() must be implemented by subclass.");
  }
}
