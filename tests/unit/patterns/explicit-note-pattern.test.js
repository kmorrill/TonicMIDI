/**
 * tests/unit/patterns/explicit-note-pattern.test.js
 *
 * Unit tests for ExplicitNotePattern, verifying that it
 * 1) Cycles through notes correctly
 * 2) Respects optional duration properties
 */

import { ExplicitNotePattern } from "../../../src/patterns/explicit-note-pattern.js";

describe("ExplicitNotePattern", () => {
  it("cycles through an array of note strings in the correct order", () => {
    const pattern = new ExplicitNotePattern(["C4", "E4", "G4"]);

    // Check each step
    expect(pattern.getNotes(0)).toEqual([{ note: "C4" }]);
    expect(pattern.getNotes(1)).toEqual([{ note: "E4" }]);
    expect(pattern.getNotes(2)).toEqual([{ note: "G4" }]);

    // Wrap around (loop)
    expect(pattern.getNotes(3)).toEqual([{ note: "C4" }]);
    expect(pattern.getNotes(4)).toEqual([{ note: "E4" }]);
  });

  it("returns getLength() equal to the number of notes in the constructor array", () => {
    const pattern = new ExplicitNotePattern(["C4", "E4", "G4"]);
    expect(pattern.getLength()).toBe(3);
  });

  it("handles note objects with optional durationStepsOrBeats", () => {
    const pattern = new ExplicitNotePattern([
      { note: "C4", durationStepsOrBeats: 2 },
      { note: "E4" },
      { note: "G4", durationStepsOrBeats: 1 },
    ]);

    // Step 0 -> first note object
    let notes = pattern.getNotes(0);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ note: "C4", durationStepsOrBeats: 2 });

    // Step 1 -> second note object
    notes = pattern.getNotes(1);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ note: "E4" });

    // Step 2 -> third note object
    notes = pattern.getNotes(2);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ note: "G4", durationStepsOrBeats: 1 });
  });

  it("loops around when stepIndex exceeds getLength()", () => {
    const pattern = new ExplicitNotePattern(["C4", "E4", "G4"]);

    // stepIndex = 3 should loop back to index 0
    expect(pattern.getNotes(3)).toEqual([{ note: "C4" }]);
    // stepIndex = 4 -> index 1
    expect(pattern.getNotes(4)).toEqual([{ note: "E4" }]);
    // stepIndex = 5 -> index 2
    expect(pattern.getNotes(5)).toEqual([{ note: "G4" }]);
    // stepIndex = 6 -> index 0 again
    expect(pattern.getNotes(6)).toEqual([{ note: "C4" }]);
  });

  it("ignores context if provided (no context usage in this pattern)", () => {
    const pattern = new ExplicitNotePattern(["C4"]);
    const notesWithContext = pattern.getNotes(0, { chord: "Cmaj7" });
    expect(notesWithContext).toEqual([{ note: "C4" }]);
  });
});
