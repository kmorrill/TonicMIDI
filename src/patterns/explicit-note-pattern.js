/**
 * src/patterns/explicit-note-pattern.js
 *
 * A pattern that plays a sequence of explicitly defined notes at each step.
 * This sequence can include both single notes and "chords" (multiple notes at once),
 * as well as note durations or optional velocities.
 *
 * **Key Features:**
 * 1. **Multiple notes per step**: If an element in `notesArray` is itself an array, all notes in it
 *    will be triggered simultaneously on that step.
 * 2. **Variable note duration**: You can specify `durationSteps` (or `durationStepsOrBeats`) per note.
 * 3. **Optional `velocity`**: If not present, defaults to whatever your downstream logic sets,
 *    or you can specify it per note.
 * 4. **RhythmManager integration** (optional): If `context.rhythmManager` is provided, and
 *    `rhythmManager.isBeat()` returns `false` for the current step, no notes are returned.
 *    This is an example usage—feel free to remove or customize if you want every step to trigger.
 *
 * ### Example Usage
 * ```js
 * import { ExplicitNotePattern } from "op-xy-live/patterns/explicit-note-pattern.js";
 *
 * // A simple sequence of single notes (one note per step):
 * const singleLine = new ExplicitNotePattern(["C4", "E4", "G4", "B4"]);
 *
 * // Multiple notes (a chord) on the first step, then single notes, etc.:
 * const chordLine = new ExplicitNotePattern([
 *   ["C4", "E4", "G4"],  // chord on step 0
 *   "F4",                // single note on step 1
 *   { note: "A4", durationSteps: 2 }, // step 2: duration specified
 *   "C5",                // step 3
 * ]);
 *
 * // In a LiveLoop:
 * const loop = new LiveLoop(midiBus, { pattern: chordLine });
 * // Now step calls to loop.tick() will retrieve these notes.
 * ```
 */
import { AbstractPattern } from "./pattern-interface.js";

export class ExplicitNotePattern extends AbstractPattern {
  /**
   * Constructs a new ExplicitNotePattern with an array describing each step's notes.
   *
   * @param {Array} notesArray
   *   A sequence of step definitions. Each element can be:
   *   - A **string** like `"C4"` (converted to `{ note: "C4" }`)
   *   - An **object** like `{ note: "C4", durationSteps: 2, velocity: 100 }`
   *   - An **array** of strings or objects (to trigger multiple notes simultaneously).
   *
   * #### Examples
   * ```js
   * // Single-note sequence
   * new ExplicitNotePattern(["C4", "E4", "G4"]);
   *
   * // Single notes with varied durations
   * new ExplicitNotePattern([
   *   { note: "C4", durationSteps: 2 },
   *   { note: "E4", durationSteps: 1 },
   *   "G4"
   * ]);
   *
   * // Multiple notes per step (chord)
   * new ExplicitNotePattern([
   *   ["C4", "E4", "G4"], // chord
   *   "D4",
   *   ["F4", "A4"],
   * ]);
   *
   * // Mixture of formats
   * new ExplicitNotePattern([
   *   "C4",
   *   [{ note: "E4", velocity: 90 }, { note: "G4", durationSteps: 2 }],
   *   { note: "B4" }
   * ]);
   * ```
   */
  constructor(notesArray) {
    super();

    /**
     * @private
     * Internal storage of notes in a normalized 2D array format:
     * `this.notes[stepIndex]` => array of note objects for that step.
     */
    this.notes = notesArray.map((item) => {
      if (Array.isArray(item)) {
        // Step with multiple notes
        return item.map((noteItem) =>
          typeof noteItem === "string" ? { note: noteItem } : noteItem
        );
      }
      // Single note or object
      return [typeof item === "string" ? { note: item } : item];
    });
  }

  /**
   * Retrieves the notes for a given step. This implementation:
   * 1. Floors the `stepIndex` to handle fractional steps.
   * 2. If `context.rhythmManager` is present and `rhythmManager.isBeat(intStep)` is false,
   *    returns an empty array (allowing you to skip off-beat steps).
   * 3. Wraps around using `stepIndex % this.getLength()`.
   * 4. Returns a set of note objects, each guaranteed a `durationSteps` (default=1).
   *
   * @param {number} stepIndex
   *   The current step in your sequence. Typically 0-based, incremented by a LiveLoop.
   * @param {object} [context]
   *   Pattern context. This pattern ignores most fields, but if `context.rhythmManager`
   *   is provided and `!rhythmManager.isBeat()`, we skip. You can remove or customize
   *   that logic if you want to trigger notes on every step.
   * @returns {Array<{ note: string, durationSteps: number, velocity?: number }>}
   *   The list of notes to be played on this step. May contain multiple note objects
   *   if the step had a chord. If none, returns an empty array.
   *
   * @private
   *
   */
  getNotes(stepIndex, context) {
    const intStep = Math.floor(stepIndex);

    // Check optional rhythmManager for "only trigger on beats" logic
    if (
      context &&
      context.rhythmManager &&
      !context.rhythmManager.isBeat(intStep)
    ) {
      return [];
    }

    const index = intStep % this.getLength();
    const noteObjects = this.notes[index] || [];

    // Filter out any null/undefined
    const validNoteObjects = noteObjects.filter(Boolean);

    // Ensure we always have a numeric durationSteps
    return validNoteObjects.map((noteObj) => {
      const duration =
        noteObj.durationSteps ?? noteObj.durationStepsOrBeats ?? 1;
      return {
        ...noteObj,
        durationSteps: Math.floor(duration),
      };
    });
  }

  /**
   * The total number of steps before this pattern loops back to step 0.
   * If your `notesArray` has length N, we repeat after N steps.
   *
   * @returns {number} Number of steps in the pattern.
   *
   * @private
   */
  getLength() {
    return this.notes.length;
  }
}
