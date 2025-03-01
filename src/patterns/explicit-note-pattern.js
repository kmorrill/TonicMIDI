/**
 * src/patterns/explicit-note-pattern.js
 *
 * Example pattern that cycles through a fixed array of notes.
 * It extends AbstractPattern, ensuring we implement getNotes() and getLength().
 *
 * Now supports multiple notes per step:
 * - Each element in notesArray can be a single note or an array of notes
 * - If an array, all notes in the array will be triggered on the same step
 * - Each note can have its own duration
 */

import { AbstractPattern } from "./pattern-interface.js";

export class ExplicitNotePattern extends AbstractPattern {
  /**
   * @param {Array<string|{note: string, durationSteps?: number, velocity?: number}|Array<string|{note: string, durationSteps?: number, velocity?: number}>>} notesArray
   *   An array of note definitions. Each item can be:
   *     - A string like "C4" (will be converted internally to { note: "C4" })
   *     - An object like { note: "C4", durationSteps: 2 }
   *     - An array of strings or objects for multiple notes per step: ["C4", "E4", "G4"]
   *     - An array of note objects: [{ note: "C4", durationSteps: 2 }, { note: "E4", durationSteps: 3 }]
   *
   * @example
   *   // Simple sequence of single notes
   *   new ExplicitNotePattern(["C4", "E4", "G4"]);
   *
   *   // Single notes with durations
   *   new ExplicitNotePattern([
   *     { note: "C4" },
   *     { note: "E4", durationSteps: 1 },
   *     { note: "G4" }
   *   ]);
   *
   *   // Multiple notes per step (chords)
   *   new ExplicitNotePattern([
   *     [{ note: "C4", durationSteps: 2 }, { note: "E4", durationSteps: 2 }, { note: "G4", durationSteps: 2 }],
   *     [{ note: "F4", durationSteps: 3 }, { note: "A4", durationSteps: 3 }, { note: "C5", durationSteps: 3 }]
   *   ]);
   *
   *   // Mixed single notes and chords
   *   new ExplicitNotePattern([
   *     { note: "C4", durationSteps: 1 },
   *     [{ note: "E4", durationSteps: 2 }, { note: "G4", durationSteps: 2 }],
   *     "B4"
   *   ]);
   */
  constructor(notesArray) {
    // Call the abstract parent constructor (throws if instantiated directly).
    super();

    // Normalize the notes array to handle mixed formats
    this.notes = notesArray.map((item) => {
      // If it's an array, it represents multiple notes for this step
      if (Array.isArray(item)) {
        // Normalize each item in the array
        return item.map((noteItem) =>
          typeof noteItem === "string" ? { note: noteItem } : noteItem
        );
      }
      // If it's a single item, it represents one note for this step
      else {
        return [typeof item === "string" ? { note: item } : item];
      }
    });
  }

  /**
   * Returns an array of note objects for the current stepIndex.
   * May return multiple notes if the pattern has multiple notes for this step.
   *
   * @param {number} stepIndex - Which step we are on (0-based).
   * @param {any} [context] - Unused in this pattern, but could be chord info, etc.
   * @returns {Array<{ note: string, durationSteps: number, velocity?: number }>}
   */
  getNotes(stepIndex, context) {
    const intStep = Math.floor(stepIndex); // Floor the step index for rhythm checks
    if (
      context &&
      context.rhythmManager &&
      !context.rhythmManager.isBeat(intStep)
    ) {
      return []; // Return empty array if not on a beat
    }

    const index = intStep % this.getLength(); // Use the floored step index for pattern logic
    // If for some reason this.notes[index] is missing or not an array, default to []
    const noteObjects = this.notes[index] || [];

    // Filter out nulls before mapping
    const validNoteObjects = noteObjects.filter(
      (n) => n !== null && n !== undefined
    );

    // Now map safely
    return validNoteObjects.map((noteObj) => {
      // Check for old property name and migrate it
      const duration = noteObj.durationSteps ?? noteObj.durationStepsOrBeats ?? 1;
      return {
        ...noteObj,
        durationSteps: Math.floor(duration), // Ensure integer steps
      };
    });
  }

  /**
   * The total number of steps before repeating.
   * @returns {number}
   */
  getLength() {
    return this.notes.length;
  }
}
