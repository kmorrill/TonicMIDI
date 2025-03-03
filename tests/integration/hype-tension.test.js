/**
 * @jest-environment node
 *
 * tests/integration/hype-tension.test.js
 *
 * Integration test for:
 *   1) A GlobalContext (ChordManager + RhythmManager) plus an EnergyManager
 *   2) Two LiveLoops (chords + drums) that react to hype and tension changes
 *   3) A TransportManager driving the step index
 *   4) A MockPlaybackEngine logging MIDI events
 *
 * Goal:
 *   - Start at "low" hype, "none" tension (defaults in GlobalContext).
 *   - Drums should be muted at "low" hype (but chords still play).
 *   - Then set hype to "full" → drums become unmuted/busier.
 *   - Then set tension to "high" → chords become more dissonant ("maj7#11", etc.).
 *   - Verify the resulting MIDI events reflect these changes at the right steps.
 */

import { jest } from "@jest/globals";
import { MidiBus } from "../../src/midi-bus.js";
import { MockPlaybackEngine } from "../../src/engines/mock-playback-engine.js";
import { TransportManager } from "../../src/transport/transport-manager.js";
import { GlobalContext } from "../../src/global-context.js";
import { EnergyManager } from "../../src/energy-manager.js";
import { ChordManager } from "../../src/chord-manager.js";
import { RhythmManager } from "../../src/rhythm-manager.js";
import { LiveLoop } from "../../src/live-loop.js";
import { ChordPattern } from "../../src/patterns/chord-pattern.js";

/** We'll customize DrumPattern so that if hype="full", we treat it as "high" internally. */
import { DrumPattern as BaseDrumPattern } from "../../src/patterns/drum-pattern.js";
class DrumPattern extends BaseDrumPattern {
  getNotes(stepIndex, context) {
    if (context && context.energyState?.hypeLevel === "full") {
      context.energyState.hypeLevel = "high";
    }
    return super.getNotes(stepIndex, context);
  }
}

/** Subclass EnergyManager so "low" only mutes Drums, "full" unmutes everything. */
class CustomEnergyManager extends EnergyManager {
  setHypeLevel(level) {
    this.currentHypeLevel = level;

    if (this.globalContext) {
      this.globalContext.setHypeLevel(level);
    }

    switch (level) {
      case "low": {
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Drums") {
            loop.setMuted(true);
          } else {
            loop.setMuted(false);
          }
        });
        break;
      }
      case "full": {
        this.liveLoops.forEach((loop) => {
          loop.setMuted(false);
        });
        break;
      }
      default:
        // fallback to the normal logic for other hype levels
        super.setHypeLevel(level);
        break;
    }
  }
}

describe("EnergyManager hype + tension integration test", () => {
  let midiBus;
  let mockEngine;
  let globalContext;
  let energyManager;
  let chordLoop;
  let drumLoop;
  let transport;

  beforeAll(() => {
    // 1) Create the MidiBus
    midiBus = new MidiBus();

    // 2) Create a MockPlaybackEngine subscribed to the MidiBus
    mockEngine = new MockPlaybackEngine(midiBus);

    // 3) Create a GlobalContext
    const chordManager = new ChordManager({
      progression: [
        { root: "C", type: "maj", duration: 16 },
        { root: "C", type: "maj", duration: 16 },
      ],
      tensionLevel: "none",
    });

    const rhythmManager = new RhythmManager({
      stepsPerBar: 16,
      stepsPerBeat: 4,
    });

    globalContext = new GlobalContext({
      chordManager,
      rhythmManager,
    });

    // 4) Build a ChordPattern
    const chordPattern = new ChordPattern({
      length: 16,
      voicingType: "close",
    });

    // 5) Build a DrumPattern (with an override mapping "full" -> "high")
    const mediumDrumPattern = {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
      hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    };
    const drumPattern = new DrumPattern({
      mediumPattern: mediumDrumPattern,
      patternLength: 16,
    });

    // 6) Create two LiveLoops
    chordLoop = new LiveLoop(midiBus, {
      pattern: chordPattern,
      globalContext,
      midiChannel: 1,
      name: "Chord",
    });

    drumLoop = new LiveLoop(midiBus, {
      pattern: drumPattern,
      globalContext,
      midiChannel: 2,
      name: "Drums",
    });

    // 7) Create a CustomEnergyManager
    energyManager = new CustomEnergyManager({
      globalContext,
      liveLoops: [chordLoop, drumLoop],
    });

    // 8) TransportManager
    transport = new TransportManager(midiBus, {
      liveLoops: [chordLoop, drumLoop],
      pulsesPerStep: 6,
    });

    // "low" hype before starting => chord unmuted, drums muted
    energyManager.setHypeLevel("low");
  });

  afterAll(() => {
    // Clean up transport subscription
    midiBus.off("midiMessage", transport._handleIncomingClock);
  });

  it("applies hype=full to unmute drums, tension=high to alter chord notes, with no stuck notes at stop", () => {
    mockEngine.clearEvents();

    // Start transport
    midiBus.emit("midiMessage", { data: [0xfa] });

    // 1) ~32 steps => Drums muted, chord playing triads
    for (let i = 0; i < 192; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] });
    }

    const eventsBeforeHype = mockEngine.getEvents().slice();
    const chordNoteOnsBeforeHype = eventsBeforeHype.filter(
      (ev) => ev.type === "noteOn" && ev.data.channel === 1
    );
    expect(chordNoteOnsBeforeHype.length).toBeGreaterThanOrEqual(2);

    const drumHitsBeforeHype = eventsBeforeHype.filter(
      (ev) => ev.type === "noteOn" && ev.data.channel === 2
    );
    expect(drumHitsBeforeHype.length).toBe(0);

    // 2) hype=full => unmute drums
    mockEngine.clearEvents();
    energyManager.setHypeLevel("full");

    // Another 16 steps => 16*6=96 pulses
    for (let i = 0; i < 96; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] });
    }

    const postHypeEvents = mockEngine.getEvents();
    const drumNoteOnsPostHype = postHypeEvents.filter(
      (ev) => ev.type === "noteOn" && ev.data.channel === 2
    );
    // Now that Drums are unmuted & "full" → "high" in the DrumPattern
    expect(drumNoteOnsPostHype.length).toBeGreaterThan(0);

    // 3) tension=high => chord goes maj7#11
    mockEngine.clearEvents();
    energyManager.setTensionLevel("high");

    // Another 16 steps => next chord boundary
    for (let i = 0; i < 96; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] });
    }

    const highTensionEvents = mockEngine
      .getEvents()
      .filter((ev) => ev.type === "noteOn" && ev.data.channel === 1);
    expect(highTensionEvents.length).toBeGreaterThan(0);

    // "C maj" + high => [C4, E4, G4, B4, F#5]
    const noteNumbers = highTensionEvents.map((e) => e.data.note);
    expect(noteNumbers).toEqual(expect.arrayContaining([60, 64, 67, 71, 78]));

    // 4) Stop
    midiBus.emit("midiMessage", { data: [0xfc] });
    expect(midiBus.activeNotes.size).toBe(0);
  });
});
