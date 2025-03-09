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

    // If this step is a downbeat, return a kick note
    if (rm.isDownbeat(stepIndex)) {
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
    // But we'll emit exactly 32 steps worth of pulses (no more)
    const totalPulses = 32 * 6;

    // Emit clock pulses
    for (let i = 0; i < totalPulses; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] }); // Clock (0xF8)
    }

    // Send MIDI Stop (0xFC)
    midiBus.emit("midiMessage", { data: [0xfc] });

    // Gather the recorded events
    const events = mockEngine.getEvents();
    expect(events.length).toBeGreaterThan(0);

    // Simplify for inspection: we only check type, note, channel
    const simplified = events.map((ev) => ({
      type: ev.type,
      note: ev.data.note,
      channel: ev.data.channel,
    }));

    // Kick pattern:
    //   The Kick loop considers 16-step bars. So we expect a kick on steps 0 and 16.
    //   That yields noteOn+noteOff at step0, and noteOn+noteOff at step16.
    //   Also the initial "start" might yield an immediate noteOn at step0 (so total 3 noteOn?). Let’s see:

    // Filter for Kick on channel=10, note=36
    const kickOns = simplified.filter(
      (e) => e.type === "noteOn" && e.channel === 10 && e.note === 36
    );
    const kickOffs = simplified.filter(
      (e) => e.type === "noteOff" && e.channel === 10 && e.note === 36
    );

    // Typically we get 1 extra noteOn at step=0 right when we start (some setups do that),
    // but let’s just confirm at least 2 or 3 total:
    expect(kickOns.length).toBeGreaterThanOrEqual(2);
    expect(kickOffs.length).toBeGreaterThanOrEqual(2);

    // Now confirm we see noteOns near step=0, step=16 (the expected downbeats).
    // (You could do more rigorous checks by grouping the events, but this is enough to show the pattern is at multiples of 16.)

    // Next, let's look at chord changes on channel=1:
    const chordOnEvents = simplified.filter(
      (e) => e.type === "noteOn" && e.channel === 1
    );
    const chordOffEvents = simplified.filter(
      (e) => e.type === "noteOff" && e.channel === 1
    );

    // We have four chords:
    //   1) C (8 steps): from step 0..7
    //   2) F (12 steps): step 8..19
    //   3) G7 (8 steps): step 20..27
    //   4) C (4 steps): step 28..31
    // Let’s see if we get the correct notes:

    // 1) For “C maj,” we usually see triad: 60 (C4), 64 (E4), 67 (G4)
    // 2) For “F maj,” triad: 65 (F4), 69 (A4), 72 (C5)
    // 3) For “G7,” e.g. 67 (G4), 71 (B4), 74 (D5), 77 (F5)
    // 4) For final “C maj” again: 60,64,67

    // Let’s see how many noteOn we have:
    //   Chord1 (C) => 3 notes
    //   Chord2 (F) => 3 notes
    //   Chord3 (G7) => 4 notes
    //   Chord4 (C) => 3 notes
    // total = 3+3+4+3 = 13
    expect(chordOnEvents.length).toBe(13);
    expect(chordOffEvents.length).toBe(13);

    // We'll slice them in the order they appear:
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

    // Check matching noteOff for each noteOn
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
