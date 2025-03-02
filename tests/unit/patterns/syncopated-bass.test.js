/**
 * @jest-environment node
 *
 * tests/unit/patterns/syncopated-bass.test.js
 *
 * Unit tests for SyncopatedBass, verifying syncopated rhythm generation and probability-based note selection.
 */

import { SyncopatedBass } from "../../../src/patterns/syncopated-bass.js";

describe("SyncopatedBass", () => {
  const mockChordManager = {
    getChord: function () {
      return {
        root: "C",
        fifth: "G",
        third: "Eb",
      };
    },
  };

  const context = { chordManager: mockChordManager };

  it("generates notes according to the rhythm preset 'funk'", () => {
    const pattern = new SyncopatedBass({ rhythmPreset: "funk" });

    // Verify rhythm on specific steps
    const notesOnStep1 = pattern.getNotes(1, context);
    const notesOnStep0 = pattern.getNotes(0, context);

    expect(notesOnStep1).toHaveLength(1); // Syncopated beat
    expect(notesOnStep0).toHaveLength(0); // No note on downbeat
  });

  it("selects notes based on provided probabilities", () => {
    const pattern = new SyncopatedBass({
      probabilities: { root: 0, fifth: 0, third: 100 },
      rhythmPreset: "funk",
    });

    const notes = pattern.getNotes(1, context);

    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe("Eb2");
  });

  it("returns empty array when no chord manager in context", () => {
    const pattern = new SyncopatedBass();

    const notes = pattern.getNotes(1, {});

    expect(notes).toEqual([]);
  });

  it("respects pattern length", () => {
    const pattern = new SyncopatedBass({ length: 8 });

    expect(pattern.getLength()).toBe(8);
  });

  it("uses default probabilities and rhythm preset if none provided", () => {
    const pattern = new SyncopatedBass();

    const notes = pattern.getNotes(1, context);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveProperty("note");
    expect(notes[0]).toHaveProperty("velocity");
    expect(notes[0]).toHaveProperty("durationSteps", 1);
  });

  it("uses default properties correctly", () => {
    const pattern = new SyncopatedBass({
      probabilityToAdvance: 100, // ensures always advance
      restProbability: 0, // ensures notes always play
    });

    const notes = pattern.getNotes(0, context);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveProperty("note");
    expect(notes[0]).toHaveProperty("velocity");
    expect(notes[0]).toHaveProperty("durationSteps", 1);
  });
});
