/**
 * tests/unit/patterns/chord-pattern.test.js
 *
 * Verifies that:
 *  1) Tension=high transforms "maj" => "maj7#11" (5 notes).
 *  2) We only return notes on the chord boundary (step=0). Steps 1..3 => [].
 */

import { jest } from "@jest/globals";
import { ChordPattern } from "../../../src/patterns/chord-pattern.js";

describe("ChordPattern (New System) with tension logic", () => {
  let mockChordManager;

  beforeEach(() => {
    // Minimal chord manager that can store setCurrentChord
    mockChordManager = {
      setCurrentChord: jest.fn(),
    };
  });

  it("calculates chord in all steps but only plays it on chord boundaries", () => {
    // A single chord in progression => root:"C", type:"maj", duration=4
    const chordPattern = new ChordPattern({
      progression: [{ root: "C", type: "maj", duration: 4 }],
    });

    const mockContext = {
      chordManager: mockChordManager,
      energyManager: {
        getTensionLevel: () => "high", // triggers expansion "maj" => "maj7#11"
      },
    };

    // Step=0 => chord boundary => expect the chord to be "C4,E4,G4,B4,F#5"
    const notesAt0 = chordPattern.getNotes(0, mockContext);

    // Chord manager was set to that 5-note chord
    expect(mockChordManager.setCurrentChord).toHaveBeenCalledTimes(1);
    expect(mockChordManager.setCurrentChord).toHaveBeenCalledWith(
      "C4", // from chordObj.root + "4"
      ["C4", "E4", "G4", "B4", "F#5"]
    );

    // Expect 5 notes with duration=4
    expect(notesAt0).toHaveLength(5);
    notesAt0.forEach((noteObj) => {
      expect(noteObj.durationSteps).toBe(4);
    });

    // Steps 1..3 => no notes because _shouldPlayChordThisStep() only hits boundary
    mockChordManager.setCurrentChord.mockClear(); // reset call count

    for (let s = 1; s < 4; s++) {
      const notes = chordPattern.getNotes(s, mockContext);
      // We expect no notes to be played because we're not at a chord boundary
      expect(notes).toEqual([]);
    }
    
    // But we do still update the chord manager on each step
    expect(mockChordManager.setCurrentChord).toHaveBeenCalledTimes(3);
  });

  it("returns empty array if chordManager is missing from context", () => {
    const chordPattern = new ChordPattern({
      progression: [{ root: "C", type: "maj", duration: 4 }],
    });

    // No chordManager in context
    const notes = chordPattern.getNotes(0, {});
    expect(notes).toEqual([]);
  });
});
