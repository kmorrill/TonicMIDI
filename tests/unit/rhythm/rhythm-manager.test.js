/**
 * tests/unit/rhythm/rhythm-manager.test.js
 *
 * A unit test for the new RhythmManager logic where:
 *   - "doubleTime" => stepsPerBar = base * 2 => 16 * 2 = 32
 *   - "halfTime"   => stepsPerBar = base / 2 => 16 / 2 = 8
 *
 * The accent pattern test also checks for array lengths of 32 (doubleTime) or 8 (halfTime).
 */

import { RhythmManager } from "../../../src/rhythm-manager.js";

describe("RhythmManager", () => {
  let rhythmManager;

  beforeEach(() => {
    // Create a fresh RhythmManager with default (base=16,4) before each test
    rhythmManager = new RhythmManager();
  });

  describe("initialization", () => {
    it("should initialize with default values", () => {
      // Default: stepsPerBar=16, stepsPerBeat=4, stepsPerOffbeat=2, subdivision="normal"
      expect(rhythmManager.stepsPerBar).toBe(16);
      expect(rhythmManager.stepsPerBeat).toBe(4);
      expect(rhythmManager.stepsPerOffbeat).toBe(2);
      expect(rhythmManager.subdivision).toBe("normal");
    });

    it("should initialize with custom base values in normal mode", () => {
      const custom = new RhythmManager({
        stepsPerBar: 32,
        stepsPerBeat: 8,
        subdivision: "normal",
      });

      // If we start "normal", it remains 32,8
      expect(custom.stepsPerBar).toBe(32);
      expect(custom.stepsPerBeat).toBe(8);
      expect(custom.stepsPerOffbeat).toBe(4);
      expect(custom.subdivision).toBe("normal");
    });
  });

  describe("beat detection", () => {
    it("should identify downbeats correctly", () => {
      // A downbeat is stepIndex % stepsPerBar === 0
      expect(rhythmManager.isDownbeat(0)).toBe(true);
      expect(rhythmManager.isDownbeat(16)).toBe(true);
      expect(rhythmManager.isDownbeat(32)).toBe(true);

      // Non-downbeats
      expect(rhythmManager.isDownbeat(1)).toBe(false);
      expect(rhythmManager.isDownbeat(15)).toBe(false);
      expect(rhythmManager.isDownbeat(17)).toBe(false);
    });

    it("should identify beats correctly", () => {
      // A beat is stepIndex % stepsPerBeat === 0
      expect(rhythmManager.isBeat(0)).toBe(true);
      expect(rhythmManager.isBeat(4)).toBe(true);
      expect(rhythmManager.isBeat(8)).toBe(true);
      expect(rhythmManager.isBeat(12)).toBe(true);

      // Non-beats
      expect(rhythmManager.isBeat(1)).toBe(false);
      expect(rhythmManager.isBeat(3)).toBe(false);
      expect(rhythmManager.isBeat(5)).toBe(false);
    });

    it("should identify offbeats correctly", () => {
      // By default, stepsPerOffbeat= floor(4/2)=2 => stepIndex%4===2 is offbeat
      expect(rhythmManager.isOffbeat(2)).toBe(true);
      expect(rhythmManager.isOffbeat(6)).toBe(true);
      expect(rhythmManager.isOffbeat(10)).toBe(true);
      expect(rhythmManager.isOffbeat(14)).toBe(true);

      // Non-offbeats
      expect(rhythmManager.isOffbeat(0)).toBe(false);
      expect(rhythmManager.isOffbeat(4)).toBe(false);
      expect(rhythmManager.isOffbeat(1)).toBe(false);
    });
  });

  describe("getSubdivision", () => {
    it("should return correct subdivision values", () => {
      // 0 => downbeat, 1 => other beats, 2 => offbeat, 3 => everything else
      expect(rhythmManager.getSubdivision(0)).toBe(0); // downbeat
      expect(rhythmManager.getSubdivision(16)).toBe(0); // next bar downbeat

      expect(rhythmManager.getSubdivision(4)).toBe(1); // other beat
      expect(rhythmManager.getSubdivision(8)).toBe(1);

      expect(rhythmManager.getSubdivision(2)).toBe(2); // offbeat
      expect(rhythmManager.getSubdivision(6)).toBe(2);

      expect(rhythmManager.getSubdivision(1)).toBe(3); // other subdivisions
      expect(rhythmManager.getSubdivision(3)).toBe(3);
    });
  });

  describe("getBeatNumber", () => {
    it("should return correct beat number within bar", () => {
      // stepsPerBar=16, stepsPerBeat=4 => 4 beats
      // step 0..3 => beat 1, step 4..7 => beat 2, step 8..11 => beat 3, step12..15 => beat 4

      // Beat 1
      expect(rhythmManager.getBeatNumber(0)).toBe(1);
      expect(rhythmManager.getBeatNumber(3)).toBe(1);

      // Beat 2
      expect(rhythmManager.getBeatNumber(4)).toBe(2);
      expect(rhythmManager.getBeatNumber(7)).toBe(2);

      // Beat 3
      expect(rhythmManager.getBeatNumber(8)).toBe(3);
      expect(rhythmManager.getBeatNumber(11)).toBe(3);

      // Beat 4
      expect(rhythmManager.getBeatNumber(12)).toBe(4);
      expect(rhythmManager.getBeatNumber(15)).toBe(4);

      // Next bar => loop around
      expect(rhythmManager.getBeatNumber(16)).toBe(1);
    });
  });

  describe("setSubdivision", () => {
    it("should correctly update timing for 'doubleTime' => 32 steps", () => {
      rhythmManager.setSubdivision("doubleTime");
      expect(rhythmManager.subdivision).toBe("doubleTime");

      // Now we want 16 -> 32, 4 -> 8
      expect(rhythmManager.stepsPerBar).toBe(32);
      expect(rhythmManager.stepsPerBeat).toBe(8);
      expect(rhythmManager.stepsPerOffbeat).toBe(4);
    });

    it("should correctly update timing for 'halfTime' => 8 steps", () => {
      rhythmManager.setSubdivision("halfTime");
      expect(rhythmManager.subdivision).toBe("halfTime");

      // 16 -> 8, 4 -> 2
      expect(rhythmManager.stepsPerBar).toBe(8);
      expect(rhythmManager.stepsPerBeat).toBe(2);
      expect(rhythmManager.stepsPerOffbeat).toBe(1);
    });

    // If you no longer support triplet, remove or comment out:
    /*
    it("should correctly update timing for 'triplet'", () => {
      rhythmManager.setSubdivision("triplet");
      expect(rhythmManager.subdivision).toBe("triplet");
      // If your code does something like floor(baseStepsPerBar*2/3)
      // This is optional if you keep triplet logic
      expect(rhythmManager.stepsPerBar).toBe(10);
      expect(rhythmManager.stepsPerBeat).toBe(2);
      expect(rhythmManager.stepsPerOffbeat).toBe(1);
    });
    */

    it("should revert to normal timing when set to 'normal'", () => {
      // First go doubleTime
      rhythmManager.setSubdivision("doubleTime");

      // Then back to normal
      rhythmManager.setSubdivision("normal");
      expect(rhythmManager.subdivision).toBe("normal");
      expect(rhythmManager.stepsPerBar).toBe(16);
      expect(rhythmManager.stepsPerBeat).toBe(4);
      expect(rhythmManager.stepsPerOffbeat).toBe(2);
    });

    it("should do nothing if we set it to the current subdivision", () => {
      rhythmManager.stepsPerBar = 99;
      rhythmManager.setSubdivision("normal"); // Already normal
      // no change
      expect(rhythmManager.stepsPerBar).toBe(99);
    });
  });

  describe("getAccentPattern", () => {
    it("should return array of length stepsPerBar in normal mode", () => {
      const accentPattern = rhythmManager.getAccentPattern();
      expect(Array.isArray(accentPattern)).toBe(true);
      expect(accentPattern.length).toBe(16);
    });

    it("should have strong accent on beat 1 in normal mode", () => {
      const accentPattern = rhythmManager.getAccentPattern();
      // Example logic:
      //   i=0 => 120 (downbeat),
      //   i=8 => 100 or 90, etc.
      expect(accentPattern[0]).toBe(120);
      // etc. You can adapt as needed if your code sets different values
    });

    it("should reflect doubleTime => accent pattern of length 32", () => {
      rhythmManager.setSubdivision("doubleTime");
      const accentPattern = rhythmManager.getAccentPattern();
      expect(accentPattern.length).toBe(32);

      // If your code sets accentPattern[0]=110 for strong beat, etc.
      // You can test a few indexes
      expect(accentPattern[0]).toBe(110);
      // ...
    });

    it("should reflect halfTime => accent pattern of length 8", () => {
      rhythmManager.setSubdivision("halfTime");
      const accentPattern = rhythmManager.getAccentPattern();
      expect(accentPattern.length).toBe(8);

      // If your code sets accentPattern[0]=127 for big downbeat
      expect(accentPattern[0]).toBe(127);
      // ...
    });
  });
});
