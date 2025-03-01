/**
 * tests/unit/patterns/chord-pattern.test.js
 *
 * Unit tests for ChordPattern, verifying that it returns notes with durations
 */

import { ChordPattern } from "../../../src/patterns/chord-pattern.js";

describe("ChordPattern", () => {
  it("returns notes with durationStepsOrBeats set to 1", () => {
    const pattern = new ChordPattern({ length: 4 });
    
    // Mock chord manager
    const mockChordManager = {
      getChord: function() {
        return {
          root: "C",
          type: "maj",
          notes: ["C4", "E4", "G4"]
        };
      }
    };
    
    // Mock context with chord manager
    const context = {
      chordManager: mockChordManager
    };
    
    // Get notes for step 0
    const notes = pattern.getNotes(0, context);
    
    // Verify notes have the expected properties
    expect(notes).toHaveLength(3);
    notes.forEach(note => {
      expect(note).toHaveProperty("durationStepsOrBeats", 1);
      expect(note).toHaveProperty("note");
      expect(note).toHaveProperty("velocity");
    });
    
    // Check specific notes
    expect(notes[0].note).toBe("C4");
    expect(notes[1].note).toBe("E4");
    expect(notes[2].note).toBe("G4");
  });
  
  it("returns empty array when no chord manager in context", () => {
    const pattern = new ChordPattern();
    const notes = pattern.getNotes(0, {});
    expect(notes).toEqual([]);
  });
});