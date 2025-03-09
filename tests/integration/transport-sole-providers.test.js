/**
 * @jest-environment node
 *
 * tests/integration/transport-sole-providers.test.js
 *
 * Integration test for the "only one chord provider" and "only one kick provider" rules.
 * We test:
 *  1) That the TransportManager enforces a single chordProvider and a single kickProvider
 *     (i.e., adding a second chordProvider or kickProvider throws an error).
 *  2) That if a non-chord-provider pattern tries to set the chord, the ChordManager logs a warning and ignores.
 *  3) That if a non-kick-provider pattern tries to set the kick, the RhythmManager logs a warning and ignores.
 *  4) That with exactly one chordProvider and one kickProvider, everything still runs normally.
 */

import { jest } from "@jest/globals";
import { MidiBus } from "../../src/midi-bus.js";
import { TransportManager } from "../../src/transport/transport-manager.js";
import { ChordManager } from "../../src/chord-manager.js";
import { LiveLoop } from "../../src/live-loop.js";
import { MockPlaybackEngine } from "../../src/engines/mock-playback-engine.js";
import { RhythmManager } from "../../src/rhythm-manager.js";

/**
 * A minimal pattern that tries to set a chord or a kick, but is *not* designated for that role.
 */
class UnauthorizedPattern {
  constructor({
    triesToSetChord = false,
    triesToSetKick = false,
    patternId = "UnknownLoop",
  } = {}) {
    this.triesToSetChord = triesToSetChord;
    this.triesToSetKick = triesToSetKick;
    // We'll do a simple 4-step length
    this.length = 4;
    this.id = patternId;
  }

  getNotes(stepIndex, context) {
    // If user wants to test chord sets:
    if (this.triesToSetChord) {
      // Attempt to set chord => this should be blocked by ChordManager.
      if (context?.chordManager) {
        // We'll just pass some dummy chord
        context.chordManager.setCurrentChord(
          this.id, // pass our own ID (not authorized)
          "D4",
          ["D4", "F#4", "A4"]
        );
      }
    }
    // If user wants to test kick sets:
    if (this.triesToSetKick) {
      if (context?.rhythmManager) {
        // Attempt to set the kick => should be blocked by RhythmManager
        // We'll call setKickOnThisBeat with our own ID
        context.rhythmManager.setKickOnThisBeat(this.id, true);
      }
    }
    return [];
  }

  getLength() {
    return this.length;
  }
}

/**
 * A minimal chord provider pattern (legitimate).
 * We'll call chordManager.setCurrentChord with *our* authorized ID.
 */
class LegitChordProviderPattern {
  constructor({ patternId = "ChordProviderLoop" } = {}) {
    this.length = 4;
    this.id = patternId;
  }

  getNotes(stepIndex, context) {
    // Let's just set a chord on step=0 for demonstration
    if (stepIndex === 0 && context?.chordManager) {
      // We'll call it with the same ID we authorized
      context.chordManager.setCurrentChord(this.id, "C4", ["C4", "E4", "G4"]);
    }
    return [];
  }

  getLength() {
    return this.length;
  }
}

/**
 * A minimal kick provider pattern (legitimate).
 * We'll call rhythmManager.setKickOnThisBeat with our authorized ID.
 */
class LegitKickProviderPattern {
  constructor({ patternId = "KickProviderLoop" } = {}) {
    this.length = 4;
    this.id = patternId;
  }

  getNotes(stepIndex, context) {
    // We'll set a kick on step=0 for demonstration
    if (stepIndex === 0 && context?.rhythmManager) {
      context.rhythmManager.setKickOnThisBeat(this.id, true);
    }
    return [];
  }

  getLength() {
    return this.length;
  }
}

describe("TransportManager single chord provider & single kick provider rules", () => {
  let midiBus;
  let mockEngine;
  let chordManager;
  let rhythmManager;
  let transport;

  beforeEach(() => {
    midiBus = new MidiBus();
    mockEngine = new MockPlaybackEngine(midiBus);

    // Our newly "hardened" chordManager & rhythmManager
    chordManager = new ChordManager();
    rhythmManager = new RhythmManager({
      stepsPerBar: 4,
      stepsPerBeat: 1,
      subdivision: "normal",
    });

    // In the new hardened approach, we also want to see if the TransportManager
    // (or some other code) calls chordManager.authorizeProvider(...) and
    // rhythmManager.authorizeKickProvider(...) if we were implementing that.
    // For brevity, let's assume we've updated them, or we can do it manually:
    chordManager.authorizeProvider("ChordProviderLoop");
    rhythmManager.authorizeKickProvider("KickProviderLoop");

    // Create a TransportManager
    // pulsesPerStep=1 => every clock pulse -> 1 step
    transport = new TransportManager(midiBus, {
      liveLoops: [],
      pulsesPerStep: 1,
    });
  });

  afterEach(() => {
    // Clean up
    midiBus.off("midiMessage", transport._handleIncomingClock);
  });

  it("throws an error if we try to add two chordProvider roles", () => {
    // First chord provider loop
    const chordLoop1 = new LiveLoop(midiBus, {
      pattern: new LegitChordProviderPattern({
        patternId: "ChordProviderLoop",
      }),
      context: { chordManager, rhythmManager },
      name: "ChordLoop1",
      midiChannel: 1,
      role: "chordProvider",
    });

    // Add it
    transport.addLiveLoop(chordLoop1);

    // A second chord provider loop
    const chordLoop2 = new LiveLoop(midiBus, {
      pattern: new LegitChordProviderPattern({
        patternId: "ChordProviderLoop2",
      }),
      context: { chordManager, rhythmManager },
      name: "ChordLoop2",
      midiChannel: 2,
      role: "chordProvider", // same role => not allowed
    });

    // Expect an error when we attempt to add a second chordProvider
    expect(() => {
      transport.addLiveLoop(chordLoop2);
    }).toThrow(/Only one chord provider is allowed/);
  });

  it("throws an error if we try to add two kickProvider roles", () => {
    // First legit Kick provider
    const kickLoop1 = new LiveLoop(midiBus, {
      pattern: new LegitKickProviderPattern({ patternId: "KickProviderLoop" }),
      context: { chordManager, rhythmManager },
      name: "KickLoop1",
      midiChannel: 10,
      role: "kickProvider",
    });

    transport.addLiveLoop(kickLoop1);

    // Second would-be Kick provider
    const kickLoop2 = new LiveLoop(midiBus, {
      pattern: new LegitKickProviderPattern({ patternId: "KickProviderLoop2" }),
      context: { chordManager, rhythmManager },
      name: "KickLoop2",
      midiChannel: 11,
      role: "kickProvider",
    });

    expect(() => {
      transport.addLiveLoop(kickLoop2);
    }).toThrow(/Only one kick provider is allowed/);
  });

  it("blocks chord set attempts from a non-chordProvider role, logs a warning instead", () => {
    // We'll spy on console.warn to see the unauthorized message
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Add a legitimate chord provider
    const chordLoop = new LiveLoop(midiBus, {
      pattern: new LegitChordProviderPattern({
        patternId: "ChordProviderLoop",
      }),
      context: { chordManager, rhythmManager },
      role: "chordProvider",
    });
    transport.addLiveLoop(chordLoop);

    // Add a *non-chord* pattern that tries to set chord
    const unauthorizedChordLoop = new LiveLoop(midiBus, {
      pattern: new UnauthorizedPattern({
        triesToSetChord: true,
        patternId: "UnauthorizedChordLoop",
      }),
      context: { chordManager, rhythmManager },
      role: null, // not a chordProvider
    });
    transport.addLiveLoop(unauthorizedChordLoop);

    // Start transport
    midiBus.emit("midiMessage", { data: [0xfa] }); // Start
    // We'll run 5 pulses => 5 steps (pulsesPerStep=1)
    for (let i = 0; i < 5; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] }); // Clock
    }
    // Stop
    midiBus.emit("midiMessage", { data: [0xfc] });

    // We expect an unauthorized warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Unauthorized provider (UnauthorizedChordLoop) tried to set chord"
      )
    );

    // clean up spy
    warnSpy.mockRestore();
  });

  it("blocks kick set attempts from a non-kickProvider role, logs a warning instead", () => {
    // Spy on console.warn
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Add a legitimate kick provider
    const kickLoop = new LiveLoop(midiBus, {
      pattern: new LegitKickProviderPattern({ patternId: "KickProviderLoop" }),
      context: { chordManager, rhythmManager },
      role: "kickProvider",
    });
    transport.addLiveLoop(kickLoop);

    // Add a *non-kick* pattern that tries to set the kick
    const unauthorizedKickLoop = new LiveLoop(midiBus, {
      pattern: new UnauthorizedPattern({
        triesToSetKick: true,
        patternId: "UnauthorizedKickLoop",
      }),
      context: { chordManager, rhythmManager },
      role: null, // not a kickProvider
    });
    transport.addLiveLoop(unauthorizedKickLoop);

    // Start transport
    midiBus.emit("midiMessage", { data: [0xfa] }); // Start
    // We'll run 5 pulses => 5 steps
    for (let i = 0; i < 5; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] }); // Clock
    }
    // Stop
    midiBus.emit("midiMessage", { data: [0xfc] });

    // We expect an unauthorized warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unauthorized call to setKickOnThisBeat()")
    );

    // clean up spy
    warnSpy.mockRestore();
  });

  it("works fine with exactly one chordProvider and one kickProvider, no warnings", () => {
    // Spy on console.warn to ensure no warnings
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Create legit chord provider
    const chordLoop = new LiveLoop(midiBus, {
      pattern: new LegitChordProviderPattern({
        patternId: "ChordProviderLoop",
      }),
      context: { chordManager, rhythmManager },
      name: "ChordLoop",
      role: "chordProvider",
    });

    // Create legit kick provider
    const kickLoop = new LiveLoop(midiBus, {
      pattern: new LegitKickProviderPattern({ patternId: "KickProviderLoop" }),
      context: { chordManager, rhythmManager },
      name: "KickLoop",
      role: "kickProvider",
    });

    // Add them both, should not throw
    transport.addLiveLoop(chordLoop);
    transport.addLiveLoop(kickLoop);

    // Start
    midiBus.emit("midiMessage", { data: [0xfa] });
    // 5 pulses => 5 steps
    for (let i = 0; i < 5; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] });
    }
    // Stop
    midiBus.emit("midiMessage", { data: [0xfc] });

    // No warnings
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
