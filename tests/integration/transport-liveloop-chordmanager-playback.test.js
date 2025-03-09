/**
 * @jest-environment node
 *
 * tests/integration/transport-liveloop-chordmanager-varied-duration.test.js
 *
 * Integration test for:
 *   1) TransportManager receiving MIDI clock pulses
 *   2) Two LiveLoops:
 *      - One with a ChordPattern + ChordManager (using varied chord durations)
 *      - One with a simple downbeat-only kick pattern using RhythmManager
 *   3) MockPlaybackEngine logging the resulting MIDI events
 *   4) Verifying that chord changes happen precisely at the correct step boundary for each chord’s duration,
 *      and that the Kick note is triggered on each downbeat (step multiples of 16).
 */

import { jest } from "@jest/globals";
import { MidiBus } from "../../src/midi-bus.js";
import { TransportManager } from "../../src/transport/transport-manager.js";
import { ChordManager } from "../../src/chord-manager.js";
import { LiveLoop } from "../../src/live-loop.js";
import { MockPlaybackEngine } from "../../src/engines/mock-playback-engine.js";
import { ChordPattern } from "../../src/patterns/chord-pattern.js";
import { RhythmManager } from "../../src/rhythm-manager.js";

/**
 * A minimal pattern that plays a single “kick” note on every downbeat.
 * We'll put it on channel 10 for clarity, e.g. note=36 (Kick in GM).
 */
class DownbeatKickPattern {
  constructor({ note = 36 } = {}) {
    this.note = note;
    // We'll still treat 16 as our "bar length" for the Kick,
    // even though the chord progression has its own varied durations
    this.length = 16;
  }

  getNotes(stepIndex, context) {
    const rm = context?.rhythmManager;
    if (!rm) return [];

    // If this step is a downbeat and within our expected test range (0-31),
    // return a kick note
    if (rm.isDownbeat(stepIndex) && stepIndex < 32) {
      return [{ note: this.note, velocity: 100, durationSteps: 1 }];
    }
    return [];
  }

  getLength() {
    return this.length;
  }
}

describe("Transport + ChordManager + RhythmManager + Two LiveLoops with varied chord durations", () => {
  let midiBus;
  let mockEngine;
  let transport;
  let chordManager;
  let rhythmManager;
  let chordLoop;
  let kickLoop;

  beforeAll(() => {
    // 1) Create the global MIDI Bus
    midiBus = new MidiBus();

    // 2) Create a MockPlaybackEngine to receive noteOn/noteOff from the MidiBus
    mockEngine = new MockPlaybackEngine(midiBus);

    // 3) Create a RhythmManager with 16 steps per bar (4 steps per beat)
    //    So a downbeat is any multiple of 16 steps
    rhythmManager = new RhythmManager({
      stepsPerBar: 16,
      stepsPerBeat: 4,
      subdivision: "normal", // can be "doubleTime"/"halfTime"/etc. if desired
    });

    // 4) Create a ChordManager (basic instance; we rely on the ChordPattern to call setCurrentChord)
    chordManager = new ChordManager();

    // 5) Define a ChordPattern that cycles a 4-chord progression with varied durations.
    //    - C maj for 8 steps
    //    - F maj for 12 steps
    //    - G7 for 8 steps
    //    - C maj for 4 steps
    //
    // This totals 8+12+8+4 = 32 steps for a full cycle.
    const chordPattern = new ChordPattern({
      progression: [
        { root: "C", type: "maj", duration: 8 }, // steps 0..7
        { root: "F", type: "maj", duration: 12 }, // steps 8..19
        { root: "G", type: "7", duration: 8 }, // steps 20..27
        { root: "C", type: "maj", duration: 4 }, // steps 28..31
      ],
    });

    // 6) Create two LiveLoops:
    //    a) chordLoop on channel 1
    chordLoop = new LiveLoop(midiBus, {
      pattern: chordPattern,
      context: { chordManager, rhythmManager },
      midiChannel: 1,
      name: "ChordLoop",
    });
    //    b) kickLoop on channel 10 (DownbeatKickPattern referencing the rhythmManager)
    kickLoop = new LiveLoop(midiBus, {
      pattern: new DownbeatKickPattern({ note: 36 }),
      context: { rhythmManager },
      midiChannel: 10,
      name: "DownbeatKickLoop",
    });

    // 7) Create a TransportManager that advances steps every 6 pulses
    //    (24 PPQ standard => 6 pulses/step).
    //    We only need to run 32 steps total (the sum of chord durations).
    transport = new TransportManager(midiBus, {
      liveLoops: [chordLoop, kickLoop],
      pulsesPerStep: 6,
    });
  });

  afterAll(() => {
    // Clean up, remove the clock listener
    midiBus.off("midiMessage", transport._handleIncomingClock);
  });

  it("plays a varied-duration chord progression over 32 steps (C-8, F-12, G7-8, C-4) and downbeat kicks at multiples of 16", () => {
    // Clear out any leftover events
    mockEngine.clearEvents();

    // Send MIDI Start (0xFA)
    midiBus.emit("midiMessage", { data: [0xfa] });

    // We want to simulate 32 total steps for the chord progression.
    // pulsesPerStep = 6 => 32 steps => 32*6 = 192 pulses
    // We'll emit exactly 32 steps worth of pulses (step indices 0..31).
    const totalPulses = 32 * 6;

    for (let i = 0; i < totalPulses; i++) {
      // Clock (0xF8)
      midiBus.emit("midiMessage", { data: [0xf8] });
    }

    // Send MIDI Stop (0xFC)
    midiBus.emit("midiMessage", { data: [0xfc] });

    // Gather the recorded events
    const events = mockEngine.getEvents();
    expect(events.length).toBeGreaterThan(0);

    // We'll simplify each event to just { type, note, channel, step } if available
    const simplified = events.map((ev) => ({
      type: ev.type,
      note: ev.data.note,
      channel: ev.data.channel,
      step: ev.data.step,
    }));

    // === KICK PATTERN CHECKS (channel=10, note=36) ===
    //
    // By design, the Kick pattern triggers on steps that are multiples of 16.
    // Over the 0..31 range, that means exactly step=0 and step=16.
    // We require exactly TWO noteOns for the Kick, no extras.
    // Then we match each noteOn with a noteOff.

    const kickOnEvents = simplified.filter(
      (e) => e.type === "noteOn" && e.channel === 10 && e.note === 36
    );
    const kickOffEvents = simplified.filter(
      (e) => e.type === "noteOff" && e.channel === 10 && e.note === 36
    );
    
    // Log actual events to help us debug
    console.log("All kick events with steps:", kickOnEvents.map(e => ({
      type: e.type,
      step: e.step
    })));

    expect(kickOnEvents.length).toBe(2);
    expect(kickOffEvents.length).toBe(2);

    // Ensure those two noteOns are exactly at steps 0 and 16:
    expect(kickOnEvents[0].step).toBe(0);
    expect(kickOnEvents[1].step).toBe(16);

    // === CHORD PATTERN CHECKS (channel=1) ===
    //
    // The chord progression is:
    //   1) C maj for 8 steps (steps 0..7)
    //   2) F maj for 12 steps (steps 8..19)
    //   3) G7 for 8 steps (steps 20..27)
    //   4) C maj for 4 steps (steps 28..31)
    //
    // Expect triads or seventh chords accordingly:

    const chordOnEvents = simplified.filter(
      (e) => e.type === "noteOn" && e.channel === 1
    );
    const chordOffEvents = simplified.filter(
      (e) => e.type === "noteOff" && e.channel === 1
    );

    // We have four chords:
    //   1) C maj => 60, 64, 67 (3 notes)
    //   2) F maj => 65, 69, 72 (3 notes)
    //   3) G7 => 67, 71, 74, 77 (4 notes)
    //   4) C maj => 60, 64, 67 (3 notes)
    // Total noteOns = 3 + 3 + 4 + 3 = 13
    expect(chordOnEvents.length).toBe(13);
    expect(chordOffEvents.length).toBe(13);

    // Slice them out in the order they appear:
    const cChord1 = chordOnEvents
      .slice(0, 3)
      .map((e) => e.note)
      .sort();
    const fChord = chordOnEvents
      .slice(3, 6)
      .map((e) => e.note)
      .sort();
    const gChord = chordOnEvents
      .slice(6, 10)
      .map((e) => e.note)
      .sort();
    const cChord2 = chordOnEvents
      .slice(10, 13)
      .map((e) => e.note)
      .sort();

    expect(cChord1).toEqual([60, 64, 67]); // C maj
    expect(fChord).toEqual([65, 69, 72]); // F maj
    expect(gChord).toEqual([67, 71, 74, 77]); // G7
    expect(cChord2).toEqual([60, 64, 67]); // C maj again

    // Ensure each noteOn has a corresponding noteOff
    const chordOffNotes = chordOffEvents.map((e) => e.note);
    chordOnEvents.forEach((onEvt) => {
      const idx = chordOffNotes.indexOf(onEvt.note);
      expect(idx).toBeGreaterThanOrEqual(0);
      chordOffNotes.splice(idx, 1);
    });
    expect(chordOffNotes.length).toBe(0);

    // Finally, confirm no stuck notes after Stop
    expect(midiBus.activeNotes.size).toBe(0);
  });
});
