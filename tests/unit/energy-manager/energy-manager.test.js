/**
 * tests/unit/energy-manager/energy-manager.test.js
 *
 * Unit tests for the EnergyManager class, ensuring that calling
 * setHypeLevel(...) or setTensionLevel(...) manipulates the relevant
 * LiveLoops in the expected ways (e.g., muting/unmuting, swapping patterns,
 * adjusting LFO parameters, etc.).
 *
 * Note: Since this is an ES module project, we must import { jest }
 * from '@jest/globals'; to access jest.fn(), jest.mock(), etc.
 */

import { jest } from "@jest/globals"; // Required for ES modules
import { EnergyManager } from "../../../src/energy-manager.js";

describe("EnergyManager", () => {
  let manager;
  let mockLoopA;
  let mockLoopB;
  let mockLoopC;

  beforeEach(() => {
    // Create mock loops, each with name + possibly some methods we'll spy on
    mockLoopA = {
      name: "Drums",
      setMuted: jest.fn(),
      setPattern: jest.fn(),
      setTranspose: jest.fn(),
      lfos: [
        {
          setFrequency: jest.fn(),
          setAmplitude: jest.fn(),
        },
      ],
    };
    mockLoopB = {
      name: "Bass",
      setMuted: jest.fn(),
      setPattern: jest.fn(),
      setTranspose: jest.fn(),
      lfos: [],
    };
    mockLoopC = {
      name: "Chord",
      setMuted: jest.fn(),
      setPattern: jest.fn(),
      setTranspose: jest.fn(),
      lfos: [],
    };

    // Create an EnergyManager with these loops
    manager = new EnergyManager({
      liveLoops: [mockLoopA, mockLoopB, mockLoopC],
    });
  });

  it("should construct properly", () => {
    expect(manager.liveLoops).toHaveLength(3);
    expect(manager.currentHypeLevel).toBeNull();
    expect(manager.currentTensionLevel).toBeNull();
  });

  describe("setHypeLevel", () => {
    it('should handle "full" hype by unmuting loops / adjusting LFOs', () => {
      manager.setHypeLevel("full");
      // Check that manager stored this
      expect(manager.currentHypeLevel).toBe("full");

      // Our example code in the EnergyManager stub might:
      //  - loop.setMuted(false) for Drums
      //  - loop.lfos[0].setFrequency(2.0), etc.
      // We just verify that something was called.
      // You can adapt to your actual logic.
      expect(mockLoopA.setMuted).toHaveBeenCalledWith(false);
      // Also check LFO changes
      expect(mockLoopA.lfos[0].setFrequency).toHaveBeenCalledWith(2.0);
      expect(mockLoopA.lfos[0].setAmplitude).toHaveBeenCalledWith(1.0);

      // If your logic also unmuted or changed patterns on other loops, test them:
      // e.g., expect(mockLoopB.setMuted).toHaveBeenCalledWith(false);
      // It's up to your actual code in the switch statements.
    });

    it('should handle "low" hype by muting or simplifying loops', () => {
      manager.setHypeLevel("low");
      expect(manager.currentHypeLevel).toBe("low");

      // If your example logic mutes everything except Bass
      // then:
      expect(mockLoopA.setMuted).toHaveBeenCalledWith(true);
      // Possibly also check patterns changed
      // expect(mockLoopA.setPattern).toHaveBeenCalledWith(simplePattern, false);
    });

    it("should warn on unknown hype level", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      manager.setHypeLevel("ultra");
      expect(manager.currentHypeLevel).toBe("ultra");
      // Check console.warn usage
      expect(warnSpy).toHaveBeenCalledWith(
        'EnergyManager: Unknown hype level "ultra". No changes made.'
      );
      warnSpy.mockRestore();
    });
  });

  describe("setTensionLevel", () => {
    it('should handle "high" tension by dissonant chord patterns, etc.', () => {
      manager.setTensionLevel("high");
      expect(manager.currentTensionLevel).toBe("high");

      // If your code sets chord to a dissonant pattern or modifies the bass
      // we test that:
      // expect(mockLoopC.setPattern).toHaveBeenCalledWith(dissonantChordPattern);
      // or something like that, depending on your logic.
    });

    it('should handle "none" tension by stable chord patterns', () => {
      manager.setTensionLevel("none");
      expect(manager.currentTensionLevel).toBe("none");
    });

    it("should warn on unknown tension level", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      manager.setTensionLevel("extreme");
      expect(manager.currentTensionLevel).toBe("extreme");
      expect(warnSpy).toHaveBeenCalledWith(
        'EnergyManager: Unknown tension level "extreme". No changes made.'
      );
      warnSpy.mockRestore();
    });
  });

  describe("arrangement style", () => {
    it("should handle setArrangementStyle call", () => {
      // By default it's just a stub that logs something
      // We can verify the console output or any loop changes
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      manager.setArrangementStyle("wide");
      expect(logSpy).toHaveBeenCalledWith(
        'EnergyManager: Setting arrangement style to "wide"'
      );
      logSpy.mockRestore();
    });
  });

  describe("add/remove liveLoops", () => {
    it("should allow adding a new loop", () => {
      const newLoop = { name: "Lead", setMuted: jest.fn() };
      manager.addLiveLoop(newLoop);
      expect(manager.liveLoops).toContain(newLoop);
      expect(manager.liveLoops).toHaveLength(4);
    });

    it("should remove an existing loop", () => {
      manager.removeLiveLoop(mockLoopB);
      expect(manager.liveLoops).not.toContain(mockLoopB);
      expect(manager.liveLoops).toHaveLength(2);
    });
  });
});
