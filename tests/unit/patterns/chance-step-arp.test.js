// tests/unit/patterns/chance-step-arp.test.js

import { jest } from "@jest/globals";
import { ChanceStepArp } from "../../../src/patterns/chance-step-arp.js";

/**
 * A simple class that yields a hard-coded sequence of floats in [0..1).
 */
class FixedHardCodedRandom {
  constructor(values) {
    this.values = values.slice(); // copy array
    this.index = 0;
  }
  next() {
    if (this.index < this.values.length) {
      const val = this.values[this.index];
      this.index++;
      return val;
    }
    // If out of values, return the last one
    return this.values[this.values.length - 1];
  }
}

/**
 * Minimal chordManager returning e.g. ["C4","E4","G4"]
 */
function mockChordManager(notes = ["C4", "E4", "G4"]) {
  return {
    getCurrentChordNotes: jest.fn().mockReturnValue(notes),
  };
}

/**
 * Minimal energyManager returning hype + tension
 */
function mockEnergyManager({ hype = "low", tension = "none" } = {}) {
  return {
    getHypeLevel: jest.fn().mockReturnValue(hype),
    getTensionLevel: jest.fn().mockReturnValue(tension),
  };
}

/**
 * Minimal rhythmManager with isBeat, isDownbeat, isOffbeat
 */
function mockRhythmManager({
  downbeatSteps = [],
  offbeatSteps = [],
  beatSteps = [],
} = {}) {
  return {
    isDownbeat: jest
      .fn()
      .mockImplementation((step) => downbeatSteps.includes(step)),
    isOffbeat: jest
      .fn()
      .mockImplementation((step) => offbeatSteps.includes(step)),
    isBeat: jest.fn().mockImplementation((step) => beatSteps.includes(step)),
  };
}

/**
 * We'll also define a helper to parse the note's MIDI number
 * so we can confirm it is 63 or 65, etc.
 */
function noteNameToMidi(noteName) {
  // Very minimal parse; handle sharps (#).
  // If your code has a more robust parse, adapt as needed.
  const map = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };
  const m = noteName.match(/^([A-G][b#]?)(\d+)$/);
  if (!m) return 60; // fallback => C4
  const semitone = map[m[1]] ?? 0;
  const octave = parseInt(m[2], 10);
  return (octave + 1) * 12 + semitone;
}

describe("ChanceStepArp pattern", () => {
  it("defaults: patternLength=16, advanceProbability=0.7, restProbability=0.1, etc.", () => {
    const pattern = new ChanceStepArp();
    expect(pattern.patternLength).toBe(16);
    expect(pattern.advanceProbability).toBeCloseTo(0.7, 5);
    expect(pattern.restProbability).toBeCloseTo(0.1, 5);
    expect(pattern.baseVelocity).toBe(90);
    expect(pattern.tensionApproachProb).toBeCloseTo(0.2, 5);
    expect(pattern.getLength()).toBe(16);
  });

  it("returns empty array if chordManager has no notes", () => {
    const pattern = new ChanceStepArp({ patternLength: 4 });
    const chordMgr = mockChordManager([]);
    const context = { chordManager: chordMgr };

    // step0 => no chord => no notes
    const notes = pattern.getNotes(0, context);
    expect(notes).toEqual([]);
    // confirm chordManager was called
    expect(chordMgr.getCurrentChordNotes).toHaveBeenCalledTimes(1);
  });

  it("respects restProbability => skip notes if random < restProb", () => {
    // restProbability=0.5 => if random=0.3 => we rest
    const rng = new FixedHardCodedRandom([0.3]);
    const pattern = new ChanceStepArp({
      restProbability: 0.5,
      randomFn: rng.next.bind(rng),
    });
    const chordMgr = mockChordManager(["C4"]);
    const context = { chordManager: chordMgr };

    // step0 => random=0.3 => 0.3<0.5 => rest => no notes
    const notes = pattern.getNotes(0, context);
    expect(notes).toEqual([]);
  });

  it("advances chord tone if random < advanceProbability", () => {
    // We'll define rest=0 so we definitely produce a note
    // For advProbability=0.7 => if random=0.2 => we do advance
    const rng = new FixedHardCodedRandom([0.0, 0.2]);
    const pattern = new ChanceStepArp({
      restProbability: 0.0,
      advanceProbability: 0.7,
      randomFn: rng.next.bind(rng),
    });
    const chordMgr = mockChordManager(["C4", "E4", "G4"]);
    const context = { chordManager: chordMgr };

    const notes = pattern.getNotes(0, context);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe("E4"); // advanced from index=0 =>1 => E4
  });

  it("stays on same chord tone if random >= advanceProbability", () => {
    // advProb=0.3 => random=0.6 => stay
    // chord = ["C4","E4","G4"], start toneIndex=0 => "C4"
    const rng = new FixedHardCodedRandom([0.0, 0.6]);
    const pattern = new ChanceStepArp({
      restProbability: 0.0,
      advanceProbability: 0.3,
      randomFn: rng.next.bind(rng),
    });
    const chordMgr = mockChordManager(["C4", "E4", "G4"]);
    const context = { chordManager: chordMgr };

    const notes = pattern.getNotes(0, context);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe("C4"); // stayed at index=0
  });

  it("high tension => approach note => ±1 semitone if random < scaledApproachProb", () => {
    // tensionApproachProb=0.4 => tension=high => factor=2.5 => actual=1.0 => random=0.2 => approach => ±1
    // chord= ["E4"] => midi=64 => ±1 => 63 or 65
    const rng = new FixedHardCodedRandom([0.0, 0.2]);
    const pattern = new ChanceStepArp({
      restProbability: 0.0,
      tensionApproachProb: 0.4,
      randomFn: rng.next.bind(rng),
    });
    const chordMgr = mockChordManager(["E4"]); // single chord tone
    const energyMgr = mockEnergyManager({ tension: "high" });
    const context = { chordManager: chordMgr, energyManager: energyMgr };

    const notes = pattern.getNotes(0, context);
    expect(notes).toHaveLength(1);
    const midiVal = noteNameToMidi(notes[0].note);
    // Must be either 63 or 65
    expect([63, 65].includes(midiVal)).toBe(true);
  });

  it("medium hype => velocity ~ baseVelocity+10, downbeat => +15 => total +25", () => {
    // rest=0 => produce a note
    // hype=medium => +10
    // downbeat => +15 => total +25
    // baseVelocity=90 => final=115
    // We'll define random=0.5 => not used for rest or approach
    const rng = new FixedHardCodedRandom([0.0, 0.5]);
    const pattern = new ChanceStepArp({
      baseVelocity: 90,
      restProbability: 0.0,
      randomFn: rng.next.bind(rng),
    });
    const chordMgr = mockChordManager(["C4"]);
    const energyMgr = mockEnergyManager({ hype: "medium" });
    // Mark step0 as a "beat" or we won't skip it
    // (Though your code might not strictly skip, let's ensure it sees downbeat too)
    const rhythmMgr = mockRhythmManager({
      beatSteps: [0],
      downbeatSteps: [0],
    });

    const context = {
      chordManager: chordMgr,
      energyManager: energyMgr,
      rhythmManager: rhythmMgr,
    };

    const notes = pattern.getNotes(0, context);
    expect(notes).toHaveLength(1);
    expect(notes[0].velocity).toBe(115); // 90 +10 for medium +15 for downbeat => 115
  });

  it("returns empty array if restProbability=1.0", () => {
    // random doesn't matter, always rest
    const rng = new FixedHardCodedRandom([0.5]);
    const pattern = new ChanceStepArp({
      restProbability: 1.0,
      randomFn: rng.next.bind(rng),
    });
    const chordMgr = mockChordManager(["C4", "E4"]);
    const context = { chordManager: chordMgr };

    const notes = pattern.getNotes(0, context);
    expect(notes).toEqual([]);
  });
});
