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
    expect(pattern.getNotes(0)).toEqual([{ note: "C4", durationSteps: 1 }]);
    expect(pattern.getNotes(1)).toEqual([{ note: "E4", durationSteps: 1 }]);
    expect(pattern.getNotes(2)).toEqual([{ note: "G4", durationSteps: 1 }]);

    // Wrap around (loop)
    expect(pattern.getNotes(3)).toEqual([{ note: "C4", durationSteps: 1 }]);
    expect(pattern.getNotes(4)).toEqual([{ note: "E4", durationSteps: 1 }]);
  });

  it("returns getLength() equal to the number of notes in the constructor array", () => {
    const pattern = new ExplicitNotePattern(["C4", "E4", "G4"]);
    expect(pattern.getLength()).toBe(3);
  });

  it("handles note objects with optional durationSteps", () => {
    const pattern = new ExplicitNotePattern([
      { note: "C4", durationSteps: 2 },
      { note: "E4" },
      { note: "G4", durationSteps: 1 },
    ]);

    // Step 0 -> first note object
    let notes = pattern.getNotes(0);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ note: "C4", durationSteps: 2 });

    // Step 1 -> second note object
    notes = pattern.getNotes(1);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ note: "E4", durationSteps: 1 });

    // Step 2 -> third note object
    notes = pattern.getNotes(2);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ note: "G4", durationSteps: 1 });
  });

  it("loops around when stepIndex exceeds getLength()", () => {
    const pattern = new ExplicitNotePattern(["C4", "E4", "G4"]);

    // stepIndex = 3 should loop back to index 0
    expect(pattern.getNotes(3)).toEqual([{ note: "C4", durationSteps: 1 }]);
    // stepIndex = 4 -> index 1
    expect(pattern.getNotes(4)).toEqual([{ note: "E4", durationSteps: 1 }]);
    // stepIndex = 5 -> index 2
    expect(pattern.getNotes(5)).toEqual([{ note: "G4", durationSteps: 1 }]);
    // stepIndex = 6 -> index 0 again
    expect(pattern.getNotes(6)).toEqual([{ note: "C4", durationSteps: 1 }]);
  });

  it("ignores context if provided (no context usage in this pattern)", () => {
    const pattern = new ExplicitNotePattern(["C4"]);
    const notesWithContext = pattern.getNotes(0, { chord: "Cmaj7" });
    expect(notesWithContext).toEqual([{ note: "C4", durationSteps: 1 }]);
  });
  
  it("uses default duration of 1 for string notes and respects provided durations", () => {
    const pattern = new ExplicitNotePattern([
      "C4", // String note should default to duration 1
      { note: "E4", durationSteps: 2 }, // This should keep its explicit duration
      { note: "G4" } // Object without duration should default to 1
    ]);
    
    expect(pattern.getNotes(0)).toEqual([{ note: "C4", durationSteps: 1 }]);
    expect(pattern.getNotes(1)).toEqual([{ note: "E4", durationSteps: 2 }]);
    expect(pattern.getNotes(2)).toEqual([{ note: "G4", durationSteps: 1 }]);
  });
  
  it("supports multiple notes per step (chords) with individual durations", () => {
    const pattern = new ExplicitNotePattern([
      // Step 0: C major chord with different note durations
      [
        { note: "C4", durationSteps: 2 },
        { note: "E4", durationSteps: 3 },
        { note: "G4", durationSteps: 1 }
      ],
      // Step 1: Single note
      "D4",
      // Step 2: F major chord with explicit velocities
      [
        { note: "F4", velocity: 90, durationSteps: 2 },
        { note: "A4", velocity: 80, durationSteps: 2 },
        { note: "C5", velocity: 70, durationSteps: 2 }
      ]
    ]);
    
    // Step 0 should return a C major chord (3 notes) with different durations
    const chordC = pattern.getNotes(0);
    expect(chordC).toHaveLength(3);
    expect(chordC[0].note).toBe("C4");
    expect(chordC[0].durationSteps).toBe(2);
    expect(chordC[1].note).toBe("E4");
    expect(chordC[1].durationSteps).toBe(3);
    expect(chordC[2].note).toBe("G4");
    expect(chordC[2].durationSteps).toBe(1);
    
    // Step 1 should return a single D4 note with default duration
    const noteD = pattern.getNotes(1);
    expect(noteD).toHaveLength(1);
    expect(noteD[0].note).toBe("D4");
    expect(noteD[0].durationSteps).toBe(1);
    
    // Step 2 should return an F major chord with specified velocities
    const chordF = pattern.getNotes(2);
    expect(chordF).toHaveLength(3);
    expect(chordF[0].note).toBe("F4");
    expect(chordF[0].velocity).toBe(90);
    expect(chordF[1].note).toBe("A4");
    expect(chordF[1].velocity).toBe(80);
    expect(chordF[2].note).toBe("C5");
    expect(chordF[2].velocity).toBe(70);
  });
  
  it("handles string arrays as multiple notes per step with default durations", () => {
    const pattern = new ExplicitNotePattern([
      // Step 0: C major chord as array of strings
      ["C4", "E4", "G4"],
      // Step 1: Single note
      "D4"
    ]);
    
    // Step 0 should return a C major chord (3 notes) with default durations
    const chordC = pattern.getNotes(0);
    expect(chordC).toHaveLength(3);
    expect(chordC[0].note).toBe("C4");
    expect(chordC[0].durationSteps).toBe(1);
    expect(chordC[1].note).toBe("E4");
    expect(chordC[1].durationSteps).toBe(1);
    expect(chordC[2].note).toBe("G4");
    expect(chordC[2].durationSteps).toBe(1);
    
    // Step 1 should return a single D4 note
    const noteD = pattern.getNotes(1);
    expect(noteD).toHaveLength(1);
    expect(noteD[0].note).toBe("D4");
    expect(noteD[0].durationSteps).toBe(1);
  });
});
