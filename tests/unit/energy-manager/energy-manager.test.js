/**
 * tests/unit/energy-manager/energy-manager.test.js
 *
 * Tests the "hybrid" approach for EnergyManager:
 * - On hype changes: unmute / mute loops, adjust LFO parameters, store "doubleTime"/"normal"/"halfTime" in a property (patterns or rhythm manager decide how to interpret it as 32 steps, etc.).
 * - On tension changes: just store tension, warn on unknown levels, but do no direct chord logic.
 * - On arrangement style: logs and stores it.
 * - On add/remove loop: we can dynamically modify manager.liveLoops.
 */

import { jest } from "@jest/globals";
import { EnergyManager } from "../../../src/energy-manager.js";

describe("EnergyManager (Hybrid Approach)", () => {
  let manager;
  let mockLoopA;
  let mockLoopB;
  let mockLoopC;

  beforeEach(() => {
    // Create mock loops
    mockLoopA = {
      name: "Drums",
      setMuted: jest.fn(),
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
      lfos: [],
    };
    mockLoopC = {
      name: "Chord",
      setMuted: jest.fn(),
      lfos: [],
    };

    // Construct a new EnergyManager with these loops
    manager = new EnergyManager({
      liveLoops: [mockLoopA, mockLoopB, mockLoopC],
    });
  });

  it("should initialize with default levels", () => {
    // We assume your manager starts at hype="low", tension="none", subdiv="normal", arrangement=null
    expect(manager.getHypeLevel()).toBe("low");
    expect(manager.getTensionLevel()).toBe("none");
    expect(manager.getSubdivision()).toBe("normal");
    expect(manager.getArrangementStyle()).toBeNull();
  });

  describe("setHypeLevel", () => {
    it('should set "full" hype => unmute Drums, intensify LFO, store "doubleTime"', () => {
      manager.setHypeLevel("full");

      // The manager's internal hype changes to "full"
      expect(manager.getHypeLevel()).toBe("full");
      // The manager's internal subdivision label => "doubleTime"
      expect(manager.getSubdivision()).toBe("doubleTime");

      // Check the Drums loop is unmuted
      expect(mockLoopA.setMuted).toHaveBeenCalledWith(false);

      // Check LFO intensification
      expect(mockLoopA.lfos[0].setFrequency).toHaveBeenCalledWith(2.0);
      expect(mockLoopA.lfos[0].setAmplitude).toHaveBeenCalledWith(1.0);
    });

    it('should set "medium" hype => unmute Drums w/ moderate LFO, store "normal"', () => {
      manager.setHypeLevel("medium");
      expect(manager.getHypeLevel()).toBe("medium");
      expect(manager.getSubdivision()).toBe("normal");

      // Drums unmuted, moderate LFO
      expect(mockLoopA.setMuted).toHaveBeenCalledWith(false);
      expect(mockLoopA.lfos[0].setFrequency).toHaveBeenCalledWith(1.0);
      expect(mockLoopA.lfos[0].setAmplitude).toHaveBeenCalledWith(0.8);
    });

    it('should set "low" hype => mute Drums, store "halfTime"', () => {
      manager.setHypeLevel("low");
      expect(manager.getHypeLevel()).toBe("low");
      expect(manager.getSubdivision()).toBe("halfTime");

      // e.g. Mute Drums at "low"
      expect(mockLoopA.setMuted).toHaveBeenCalledWith(true);
    });

    it("should warn on unknown hype level", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      manager.setHypeLevel("unknown");
      // We store the hype level, but also warn
      expect(manager.getHypeLevel()).toBe("unknown");
      // Test we logged/warned
      expect(warnSpy).toHaveBeenCalledWith(
        'EnergyManager: Unknown hype level "unknown". No changes made.'
      );

      warnSpy.mockRestore();
    });
  });

  describe("setTensionLevel", () => {
    it('should set tension to "high" with no direct chord push', () => {
      manager.setTensionLevel("high");
      expect(manager.getTensionLevel()).toBe("high");
      // We do not push to chord manager. Patterns use this if they want dissonance.
    });

    it("should warn on unknown tension level", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      manager.setTensionLevel("extreme");
      // We store 'extreme' but also warn
      expect(manager.getTensionLevel()).toBe("extreme");
      expect(warnSpy).toHaveBeenCalledWith(
        'EnergyManager: Unknown tension level "extreme". No changes made.'
      );

      warnSpy.mockRestore();
    });
  });

  describe("setArrangementStyle", () => {
    it("should store style and log the change", () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      manager.setArrangementStyle("wide");
      expect(manager.getArrangementStyle()).toBe("wide");
      // Logged the style choice
      expect(logSpy).toHaveBeenCalledWith(
        'EnergyManager: Setting arrangement style to "wide"'
      );

      logSpy.mockRestore();
    });
  });

  describe("addLiveLoop / removeLiveLoop", () => {
    it("should allow adding a new loop", () => {
      const newLoop = { name: "Lead", setMuted: jest.fn() };
      manager.addLiveLoop(newLoop);

      expect(manager.liveLoops).toHaveLength(4);
      expect(manager.liveLoops).toContain(newLoop);
    });

    it("should remove an existing loop", () => {
      manager.removeLiveLoop(mockLoopB);
      expect(manager.liveLoops).toHaveLength(2);
      expect(manager.liveLoops).not.toContain(mockLoopB);
    });
  });
});
