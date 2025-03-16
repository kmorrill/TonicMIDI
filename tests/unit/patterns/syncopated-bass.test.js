// File: tests/unit/patterns/syncopated-bass.test.js

import { jest } from "@jest/globals";
import { SyncopatedBass } from "../../../src/patterns/syncopated-bass.js";

/**
 * Helper: cycle through a fixed array of [0..1) values
 */
function createMockRNG(sequence) {
  let idx = 0;
  return () => {
    const val = sequence[idx % sequence.length];
    idx++;
    return val;
  };
}

/**
 * Minimal chordManager returning e.g. ["C4","E4","G4","Bb4"]
 */
function mockChordManager(notes = ["C4", "E4", "G4", "Bb4"]) {
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

describe("SyncopatedBass pattern", () => {
  it("density=0 => yields no events (all rests)", () => {
    const rng = createMockRNG([0.0]);
    const pattern = new SyncopatedBass({
      genre: "funk",
      patternLength: 8,
      density: 0,
      randomFn: rng,
    });
    // All steps should be 0
    expect(pattern._patternArray).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("density=1 => yields no rests, preserving multi-step if present in seed", () => {
    // Create the pattern
    const rng = createMockRNG([0.0, 0.1, 0.2]);
    const pattern = new SyncopatedBass({
      genre: "rock",
      patternLength: 8,
      density: 1,
      randomFn: rng,
    });

    // This helper checks coverage for every step, ignoring the fact that
    // a 2-step note stores step0=2 but step1=0 (continuation).
    function allStepsCovered(array) {
      for (let i = 0; i < array.length; i++) {
        let covered = false;
        // Look backward for an event that started at j
        for (let j = i; j >= 0; j--) {
          if (array[j] > 0) {
            const dur = array[j];
            // If j+dur > i, step i is within that multi-step note
            if (j + dur > i) {
              covered = true;
            }
            break;
          }
        }
        if (!covered) return false;
      }
      return true;
    }

    expect(allStepsCovered(pattern._patternArray)).toBe(true);

    // Also confirm that if the first event from the seed was multi-step,
    // it remains multi-step (like '2').
    // The default rock seed: [2,0,0,1,0,0,1,0, 2,0,0,1,0,0,2,0], truncated to 8 => [2,0,0,1,0,0,1,0].
    // Then fillAllSteps() might keep step0=2 if it didn't remove or override it.
    if (pattern._patternArray[0] > 0) {
      expect(pattern._patternArray[0]).toBe(2);
    }
  });

  it("density=0.5 => about half the events remain, preserving multi-step shape for those that survive", () => {
    // We'll do a short pattern so we can see the final shape easily
    // "funk" seed => first 8 => [2,0,0,1,0,1,0,0]
    // That has 3 events in the first 8 steps.

    // We'll define random so that if it tries to add, we place a new single-step somewhere.
    const rng = createMockRNG([
      0.99, // might skip removing any
      0.2, // pick a spot to add
      0.5, // newDur maybe=1
    ]);

    const pattern = new SyncopatedBass({
      genre: "funk",
      patternLength: 8,
      density: 0.5,
      randomFn: rng,
    });

    const arr = pattern._patternArray;
    const events = _scanEvents(arr);
    // We'll just ensure it's between 1..4 events.
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.length).toBeLessThanOrEqual(4);

    // If step0 is not 0, it should remain 2
    if (arr[0] !== 0) {
      expect(arr[0]).toBe(2);
    }
  });

  it("getNotes() triggers noteOn only at the start index of each multi-step event", () => {
    // We'll pick a simpler array manually
    const rng = createMockRNG([0.0]);
    const pattern = new SyncopatedBass({
      patternLength: 4,
      randomFn: rng,
      density: 1,
    });
    // We'll just override it to avoid random fill:
    pattern._patternArray = [2, 0, 0, 1]; // 2-step note at step0, then a single-step at step3

    const chordMgr = mockChordManager(["C4", "E4"]);
    const energyMgr = mockEnergyManager({ hype: "medium", tension: "none" });
    const context = { chordManager: chordMgr, energyManager: energyMgr };

    // step0 => event => 2-step => noteOn
    let notes = pattern.getNotes(0, context);
    expect(notes).toHaveLength(1);
    expect(notes[0].durationSteps).toBe(2);

    // step1 => still covered by that 2-step note, so no new noteOn
    notes = pattern.getNotes(1, context);
    expect(notes).toEqual([]);

    // step2 => is 0 => rest => no note
    notes = pattern.getNotes(2, context);
    expect(notes).toEqual([]);

    // step3 => single-step => noteOn
    notes = pattern.getNotes(3, context);
    expect(notes).toHaveLength(1);
    expect(notes[0].durationSteps).toBe(1);
  });
});

/**
 * Local helper to parse the final array for event segments.
 */
function _scanEvents(array) {
  const evs = [];
  let i = 0;
  while (i < array.length) {
    const dur = array[i];
    if (dur > 0) {
      evs.push({ start: i, dur });
      i += dur;
    } else {
      i++;
    }
  }
  return evs;
}
