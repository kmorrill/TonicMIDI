// tests/unit/rhythm/rhythm-manager.test.js

import { RhythmManager } from "../../../src/rhythm-manager.js";

describe("RhythmManager", () => {
  let rhythmManager;

  beforeEach(() => {
    // Create a fresh RhythmManager with default settings before each test
    rhythmManager = new RhythmManager();
  });

  describe("initialization", () => {
    it("should initialize with default values", () => {
      expect(rhythmManager.stepsPerBar).toBe(16);
      expect(rhythmManager.stepsPerBeat).toBe(4);
      expect(rhythmManager.stepsPerOffbeat).toBe(2);
      expect(rhythmManager.subdivision).toBe("normal");
    });

    it("should initialize with custom values", () => {
      const customRhythmManager = new RhythmManager({
        stepsPerBar: 32,
        stepsPerBeat: 8,
        subdivision: "doubleTime"
      });

      expect(customRhythmManager.stepsPerBar).toBe(8); // After _updateStepCounts with doubleTime
      expect(customRhythmManager.stepsPerBeat).toBe(2); // After _updateStepCounts with doubleTime
      expect(customRhythmManager.stepsPerOffbeat).toBe(1);
      expect(customRhythmManager.subdivision).toBe("doubleTime");
    });
  });

  describe("beat detection", () => {
    it("should identify downbeats correctly", () => {
      // Downbeats are at the start of each bar (step 0, 16, 32, etc.)
      expect(rhythmManager.isDownbeat(0)).toBe(true);
      expect(rhythmManager.isDownbeat(16)).toBe(true);
      expect(rhythmManager.isDownbeat(32)).toBe(true);
      
      // Non-downbeats
      expect(rhythmManager.isDownbeat(1)).toBe(false);
      expect(rhythmManager.isDownbeat(4)).toBe(false);
      expect(rhythmManager.isDownbeat(15)).toBe(false);
    });
    
    it("should identify beats correctly", () => {
      // Beats occur every stepsPerBeat (4 steps in default 4/4 time)
      expect(rhythmManager.isBeat(0)).toBe(true);  // 1st beat
      expect(rhythmManager.isBeat(4)).toBe(true);  // 2nd beat
      expect(rhythmManager.isBeat(8)).toBe(true);  // 3rd beat
      expect(rhythmManager.isBeat(12)).toBe(true); // 4th beat
      
      // Non-beats
      expect(rhythmManager.isBeat(1)).toBe(false);
      expect(rhythmManager.isBeat(2)).toBe(false);
      expect(rhythmManager.isBeat(3)).toBe(false);
      expect(rhythmManager.isBeat(5)).toBe(false);
    });
    
    it("should identify offbeats correctly", () => {
      // Offbeats are halfway between beats (steps 2, 6, 10, 14 in default 4/4)
      expect(rhythmManager.isOffbeat(2)).toBe(true);
      expect(rhythmManager.isOffbeat(6)).toBe(true);
      expect(rhythmManager.isOffbeat(10)).toBe(true);
      expect(rhythmManager.isOffbeat(14)).toBe(true);
      
      // Non-offbeats
      expect(rhythmManager.isOffbeat(0)).toBe(false);
      expect(rhythmManager.isOffbeat(1)).toBe(false);
      expect(rhythmManager.isOffbeat(3)).toBe(false);
      expect(rhythmManager.isOffbeat(4)).toBe(false);
    });
  });

  describe("getSubdivision", () => {
    it("should return correct subdivision values", () => {
      // Test all possible subdivision values:
      // 0: downbeat, 1: other beats, 2: offbeats, 3: other subdivisions
      
      // Downbeats (first beat of bar)
      expect(rhythmManager.getSubdivision(0)).toBe(0);
      expect(rhythmManager.getSubdivision(16)).toBe(0);
      
      // Other beats (not first beat, but still on-beat)
      expect(rhythmManager.getSubdivision(4)).toBe(1);
      expect(rhythmManager.getSubdivision(8)).toBe(1);
      expect(rhythmManager.getSubdivision(12)).toBe(1);
      
      // Offbeats
      expect(rhythmManager.getSubdivision(2)).toBe(2);
      expect(rhythmManager.getSubdivision(6)).toBe(2);
      expect(rhythmManager.getSubdivision(10)).toBe(2);
      expect(rhythmManager.getSubdivision(14)).toBe(2);
      
      // Other subdivisions
      expect(rhythmManager.getSubdivision(1)).toBe(3);
      expect(rhythmManager.getSubdivision(3)).toBe(3);
      expect(rhythmManager.getSubdivision(5)).toBe(3);
      expect(rhythmManager.getSubdivision(7)).toBe(3);
    });
  });

  describe("getBeatNumber", () => {
    it("should return correct beat number within bar", () => {
      // In 4/4 time with 16 steps per bar and 4 steps per beat:
      // Beat 1: steps 0-3
      // Beat 2: steps 4-7
      // Beat 3: steps 8-11
      // Beat 4: steps 12-15
      
      // Beat 1
      expect(rhythmManager.getBeatNumber(0)).toBe(1);
      expect(rhythmManager.getBeatNumber(1)).toBe(1);
      expect(rhythmManager.getBeatNumber(2)).toBe(1);
      expect(rhythmManager.getBeatNumber(3)).toBe(1);
      
      // Beat 2
      expect(rhythmManager.getBeatNumber(4)).toBe(2);
      expect(rhythmManager.getBeatNumber(5)).toBe(2);
      expect(rhythmManager.getBeatNumber(6)).toBe(2);
      expect(rhythmManager.getBeatNumber(7)).toBe(2);
      
      // Beat 3
      expect(rhythmManager.getBeatNumber(8)).toBe(3);
      expect(rhythmManager.getBeatNumber(9)).toBe(3);
      expect(rhythmManager.getBeatNumber(10)).toBe(3);
      expect(rhythmManager.getBeatNumber(11)).toBe(3);
      
      // Beat 4
      expect(rhythmManager.getBeatNumber(12)).toBe(4);
      expect(rhythmManager.getBeatNumber(13)).toBe(4);
      expect(rhythmManager.getBeatNumber(14)).toBe(4);
      expect(rhythmManager.getBeatNumber(15)).toBe(4);
      
      // Looping around to next bar
      expect(rhythmManager.getBeatNumber(16)).toBe(1);
      expect(rhythmManager.getBeatNumber(20)).toBe(2);
    });
  });

  describe("setSubdivision", () => {
    it("should correctly update timing parameters for 'doubleTime'", () => {
      rhythmManager.setSubdivision("doubleTime");
      
      // In doubleTime, we have half as many steps per bar/beat
      expect(rhythmManager.subdivision).toBe("doubleTime");
      expect(rhythmManager.stepsPerBar).toBe(8);  // 16/2
      expect(rhythmManager.stepsPerBeat).toBe(2); // 4/2
      expect(rhythmManager.stepsPerOffbeat).toBe(1); // 2/2
    });
    
    it("should correctly update timing parameters for 'halfTime'", () => {
      rhythmManager.setSubdivision("halfTime");
      
      // In halfTime, we have twice as many steps per bar/beat
      expect(rhythmManager.subdivision).toBe("halfTime");
      expect(rhythmManager.stepsPerBar).toBe(32);  // 16*2
      expect(rhythmManager.stepsPerBeat).toBe(8);  // 4*2
      expect(rhythmManager.stepsPerOffbeat).toBe(4); // 8/2
    });
    
    it("should correctly update timing parameters for 'triplet'", () => {
      rhythmManager.setSubdivision("triplet");
      
      // In triplet, we have 2/3 as many steps
      expect(rhythmManager.subdivision).toBe("triplet");
      expect(rhythmManager.stepsPerBar).toBe(10);  // floor(16 * 2/3)
      expect(rhythmManager.stepsPerBeat).toBe(2);  // floor(4 * 2/3)
      expect(rhythmManager.stepsPerOffbeat).toBe(1); // floor(2/2)
    });
    
    it("should revert to normal timing when set to 'normal'", () => {
      // First set to something else
      rhythmManager.setSubdivision("doubleTime");
      
      // Then back to normal
      rhythmManager.setSubdivision("normal");
      
      expect(rhythmManager.subdivision).toBe("normal");
      expect(rhythmManager.stepsPerBar).toBe(16);
      expect(rhythmManager.stepsPerBeat).toBe(4);
      expect(rhythmManager.stepsPerOffbeat).toBe(2);
    });
    
    it("should do nothing when subdivision is already set", () => {
      // We'll modify a value and then call setSubdivision with the same value
      // to verify it doesn't change anything
      rhythmManager.stepsPerBar = 99;
      rhythmManager.setSubdivision("normal"); // Already normal
      
      expect(rhythmManager.stepsPerBar).toBe(99); // Should not have changed
    });
  });

  describe("getAccentPattern", () => {
    it("should return accent pattern of correct length for normal subdivision", () => {
      const accentPattern = rhythmManager.getAccentPattern();
      
      expect(Array.isArray(accentPattern)).toBe(true);
      expect(accentPattern).toHaveLength(16); // Default stepsPerBar
    });
    
    it("should have strong accent on downbeat for normal subdivision", () => {
      const accentPattern = rhythmManager.getAccentPattern();
      
      // Downbeat (first beat) should have strongest accent
      expect(accentPattern[0]).toBe(120);
      
      // Beat 3 should have medium accent
      expect(accentPattern[8]).toBe(100);
      
      // Beats 2 & 4 should have light accent
      expect(accentPattern[4]).toBe(90);
      expect(accentPattern[12]).toBe(90);
      
      // Offbeats should have even lighter accent
      expect(accentPattern[2]).toBe(70);
      expect(accentPattern[6]).toBe(70);
      expect(accentPattern[10]).toBe(70);
      expect(accentPattern[14]).toBe(70);
    });
    
    it("should return appropriate accent pattern for doubleTime", () => {
      rhythmManager.setSubdivision("doubleTime");
      const accentPattern = rhythmManager.getAccentPattern();
      
      expect(accentPattern).toHaveLength(8); // Half as many steps in doubleTime
      
      // Every beat has strong accent
      expect(accentPattern[0]).toBe(110);
      expect(accentPattern[2]).toBe(110);
      expect(accentPattern[4]).toBe(110);
      expect(accentPattern[6]).toBe(110);
      
      // Every offbeat has medium accent
      expect(accentPattern[1]).toBe(90);
      expect(accentPattern[3]).toBe(90);
      expect(accentPattern[5]).toBe(90);
      expect(accentPattern[7]).toBe(90);
    });
    
    it("should return appropriate accent pattern for halfTime", () => {
      rhythmManager.setSubdivision("halfTime");
      const accentPattern = rhythmManager.getAccentPattern();
      
      expect(accentPattern).toHaveLength(32); // Twice as many steps in halfTime
      
      // Downbeat has strongest accent
      expect(accentPattern[0]).toBe(127);
      
      // Beat 3 has medium accent (halfway through bar)
      expect(accentPattern[16]).toBe(110);
      
      // Other beats have light accents
      expect(accentPattern[8]).toBe(90);
      expect(accentPattern[24]).toBe(90);
      
      // Offbeats have very light accents
      expect(accentPattern[4]).toBe(70);
      expect(accentPattern[12]).toBe(70);
      expect(accentPattern[20]).toBe(70);
      expect(accentPattern[28]).toBe(70);
    });
  });
});