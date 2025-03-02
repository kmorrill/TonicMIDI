/**
 * @jest-environment node
 *
 * tests/unit/patterns/chance-step-arp.test.js
 *
 * Unit tests for ChanceStepArp, verifying probabilistic and conditional note generation,
 * but done in a deterministic way using a mocked or fixed random function when needed.
 */

import { ChanceStepArp } from "../../../src/patterns/chance-step-arp.js";
import { jest } from '@jest/globals';

describe("ChanceStepArp", () => {
  // Mock chord manager always returns the same chord.
  const mockChordManager = {
    getChord: jest.fn(() => ({
      root: "C",
      type: "maj",
      notes: ["C4", "E4", "G4"],
    })),
  };

  const context = { chordManager: mockChordManager };

  it("generates notes respecting probability settings", () => {
    // Force random checks so that:
    //  - The rest check fails (so we do NOT rest).
    //  - The advance check (with prob=100) always succeeds.
    //  - This ensures we move from C4 -> E4 -> G4.
    const mockRandomFn = jest
      .fn()
      // 1) rest check => 0.5 * 100 < 0? false => no rest (restProbability=0)
      // 2) advance check => 0.5 * 100 < 100? true => advance => E4
      // 3) rest check => 0.5 * 100 < 0? false => no rest
      // 4) advance check => 0.5 * 100 < 100? true => advance => G4
      .mockReturnValue(0.5);

    const pattern = new ChanceStepArp({
      probabilityToAdvance: 100,
      restProbability: 0,
      randomFn: mockRandomFn,
    });

    const notes1 = pattern.getNotes(0, context);
    const notes2 = pattern.getNotes(1, context);

    expect(notes1).toHaveLength(1);
    expect(notes2).toHaveLength(1);

    // With 100% advance probability, we should move from C4 -> E4, then E4 -> G4
    expect(notes1[0].note).toBe("E4");
    expect(notes2[0].note).toBe("G4");
  });

  it("generates rests according to restProbability", () => {
    // restProbability=100 => ALWAYS rest, regardless of random
    const pattern = new ChanceStepArp({
      restProbability: 100,
      // We don't even need a custom randomFn here, since 100% rest is guaranteed
    });

    const notes = pattern.getNotes(0, context);
    expect(notes).toHaveLength(0);
  });

  it("avoids repeating notes when avoidRepeats is true", () => {
    // Probability to advance = 0 => normally would NOT advance
    // But the second call sees the same note repeated, so avoidRepeats forces an advance.
    // We mock random to ensure we never rest.
    const mockRandomFn = jest
      .fn()
      // rest check => 0.5 * 100 < 0? false => no rest
      // advance check => 0.5 * 100 < 0? false => do not advance unless forced by avoidRepeats
      .mockReturnValue(0.5);

    const pattern = new ChanceStepArp({
      probabilityToAdvance: 0,
      restProbability: 0,
      avoidRepeats: true,
      randomFn: mockRandomFn,
    });

    const notes1 = pattern.getNotes(0, context);
    const notes2 = pattern.getNotes(1, context);

    // 1st call => no rest => note is chord.notes[0] => "C4"
    // 2nd call => tries not to advance, but lastPlayedNote === "C4" again,
    // so avoidRepeats => force advancement => "E4"
    expect(notes1[0].note).not.toBe(notes2[0].note);
  });

  it("allows repeating notes when avoidRepeats is false", () => {
    // Probability to advance = 0 => do not advance
    // With avoidRepeats = false, second note is the same as the first.
    // We mock random so we never rest.
    const mockRandomFn = jest.fn().mockReturnValue(0.5);

    const pattern = new ChanceStepArp({
      probabilityToAdvance: 0,
      restProbability: 0,
      avoidRepeats: false,
      randomFn: mockRandomFn,
    });

    const notes1 = pattern.getNotes(0, context);
    const notes2 = pattern.getNotes(1, context);

    // 1st call => "C4"
    // 2nd call => no rest => still "C4"
    expect(notes1[0].note).toBe(notes2[0].note);
  });

  it("uses default properties correctly", () => {
    // By default: restProbability=10, probabilityToAdvance=80, etc.
    // We do NOT want to rest, so let's pick a random value that ensures
    //  random * 100 = 20 => 20 < 10 is false => no rest
    //  20 < 80 is true => we do advance from C4 to E4
    const mockRandomFn = jest.fn().mockReturnValue(0.2);

    const pattern = new ChanceStepArp({
      // Provide only randomFn; everything else is default
      randomFn: mockRandomFn,
    });

    const notes = pattern.getNotes(0, context);

    // We do only one step => it should produce exactly 1 note (E4)
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveProperty("note");
    expect(notes[0]).toHaveProperty("velocity");
    expect(notes[0]).toHaveProperty("durationSteps", 1);
  });

  it("returns empty array if no chord manager provided", () => {
    const pattern = new ChanceStepArp({
      // random doesn't matter since there's no chord
      randomFn: () => 0.5,
    });

    const notes = pattern.getNotes(0, {});
    expect(notes).toEqual([]);
  });
});
