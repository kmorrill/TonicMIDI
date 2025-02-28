/**
 * src/patterns/explicit-note-pattern.js
 *
 * Example pattern that cycles through a fixed array of notes.
 * It extends AbstractPattern, ensuring we implement getNotes() and getLength().
 */

import { AbstractPattern } from "./pattern-interface.js";

export class ExplicitNotePattern extends AbstractPattern {
  /**
   * @param {Array<string|{note: string, durationStepsOrBeats?: number}>} notesArray
   *   An array of note definitions. Each item can be:
   *     - A string like "C4" (will be converted internally to { note: "C4" })
   *     - An object like { note: "C4", durationStepsOrBeats: 2 }
   *
   * @example
   *   new ExplicitNotePattern(["C4", "E4", "G4"]);
   *   // or
   *   new ExplicitNotePattern([
   *     { note: "C4" },
   *     { note: "E4", durationStepsOrBeats: 1 },
   *     { note: "G4" }
   *   ]);
   */
  constructor(notesArray) {
    // Call the abstract parent constructor (throws if instantiated directly).
    super();

    // Normalize items: if string, wrap in { note: string }
    this.notes = notesArray.map((item) =>
      typeof item === "string" ? { note: item } : item
    );
  }

  /**
   * Returns an array with a single note object for the current stepIndex.
   *
   * @param {number} stepIndex - Which step we are on (0-based).
   * @param {any} [context] - Unused in this pattern, but could be chord info, etc.
   * @returns {Array<{ note: string, durationStepsOrBeats?: number }>}
   */
  getNotes(stepIndex, context) {
    const index = stepIndex % this.getLength();
    // Return an array of length 1. You could modify this pattern to return multiple notes if needed.
    return [this.notes[index]];
  }

  /**
   * The total number of steps before repeating.
   * @returns {number}
   */
  getLength() {
    return this.notes.length;
  }
}
