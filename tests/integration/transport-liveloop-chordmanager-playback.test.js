/**
 * @jest-environment node
 *
 * tests/integration/transport-liveloop-chordmanager-playback.test.js
 *
 * Integration test for:
 *  1) TransportManager receiving clock pulses
 *  2) A LiveLoop using a ChordPattern with a ChordManager
 *  3) A MockPlaybackEngine logging the resulting MIDI events
 */

import { jest } from "@jest/globals";
import { MidiBus } from "../../src/midi-bus.js";
import { TransportManager } from "../../src/transport/transport-manager.js";
import { ChordManager } from "../../src/chord-manager.js";
import { LiveLoop } from "../../src/live-loop.js";
import { MockPlaybackEngine } from "../../src/engines/mock-playback-engine.js";
import { ChordPattern } from "../../src/patterns/chord-pattern.js";

describe("Transport + LiveLoop + ChordManager: Basic Progression Playback", () => {
  let midiBus;
  let mockEngine;
  let transport;
  let chordManager;
  let liveLoop;

  beforeAll(() => {
    // 1) Create the MidiBus
    midiBus = new MidiBus();

    // 2) Create a MockPlaybackEngine subscribed to the MidiBus
    mockEngine = new MockPlaybackEngine(midiBus);

    // 3) Create a ChordManager with a simple chord progression
    chordManager = new ChordManager({
      progression: [
        { root: "C", type: "maj", duration: 16 }, // steps 0..15
        { root: "F", type: "maj", duration: 16 }, // steps 16..31
        { root: "G", type: "7", duration: 16 }, // steps 32..47
        { root: "C", type: "maj", duration: 16 }, // steps 48..63
      ],
    });

    // 4) Create a ChordPattern that will trigger chords every 16 steps
    //    By default, ChordPattern triggers on stepIndex % chord.duration === 0.
    const chordPattern = new ChordPattern({
      length: 16, // internal reference length for velocity pattern, etc.
      // We could also customize voicingType if we want
    });

    // 5) Create a LiveLoop bound to the chordPattern and referencing chordManager
    //    We'll put it on MIDI channel 1 by default.
    liveLoop = new LiveLoop(midiBus, {
      pattern: chordPattern,
      context: { chordManager },
      midiChannel: 1,
      name: "ChordLoop",
    });

    // 6) Create a TransportManager that uses 6 pulses per step
    //    That means 24 PPQ for 16 steps => one bar is 16 steps.
    transport = new TransportManager(midiBus, {
      liveLoops: [liveLoop],
      pulsesPerStep: 6,
    });
  });

  afterAll(() => {
    // Clean up the midiBus subscriptions if needed
    midiBus.off("midiMessage", transport._handleIncomingClock);
  });

  it("plays a 4-chord progression across 64 steps (C, F, G7, C) and logs correct MIDI events", () => {
    // Clear the MockPlaybackEngine event log before we start
    mockEngine.clearEvents();

    // Simulate a MIDI Start message (status 0xFA)
    midiBus.emit("midiMessage", { data: [0xfa] });

    // We want to advance through at least 64 steps.
    // Each step requires 6 pulses => 64 steps * 6 = 384 pulses.
    const totalPulses = 63 * 6; // 378

    for (let i = 0; i < totalPulses; i++) {
      midiBus.emit("midiMessage", { data: [0xf8] }); // MIDI Clock (0xF8)
    }

    // Now send a MIDI Stop (0xFC) to end transport
    midiBus.emit("midiMessage", { data: [0xfc] });

    // Let's inspect the events in the mock engine's log.
    const events = mockEngine.getEvents();

    // We expect noteOn / noteOff pairs for each chord.

    // 1) C maj => stepIndex=0 => triggered notes
    //    We'll see noteOn for "C4", "E4", "G4" at step=0
    //    They should turn off at step=16
    //
    // 2) F maj => stepIndex=16 => "F4", "A4", "C5" ...
    //    Off at step=32
    //
    // 3) G7 => stepIndex=32 => "G4", "B4", "D5", "F5"
    //    Off at step=48
    //
    // 4) C maj => stepIndex=48 => "C4", "E4", "G4" again
    //    Off at step=64 or right when we stop

    // Let's group the events by their type (noteOn/noteOff) and by the note number
    // or note name. We'll do a simple check on presence & ordering rather than
    // verifying every detail if we want to keep it flexible.

    // Helper to make it easier to see type/note, ignoring velocity for brevity
    const simplifiedLog = events.map((ev) => {
      const { type, data } = ev;
      return {
        type,
        note: data?.note,
        channel: data?.channel,
      };
    });

    // Confirm we have the expected sequence of noteOns and noteOffs by note number.
    // We'll reconstruct the note name => MIDI mapping from the pattern:
    //   - C4 = 60, E4 = 64, G4 = 67
    //   - F4 = 65, A4 = 69, C5 = 72
    //   - G4 = 67, B4 = 71, D5 = 74, F5 = 77
    //
    // Each chord triggers noteOn for its notes, then later noteOff for the same notes.

    // We'll find the first set of noteOns: 60, 64, 67
    // Then noteOff for them, then next set for 65,69,72, etc.

    // Let's do a few minimal expectations:
    //  - The first noteOn events we see should be [60,64,67] for channel=1
    //  - The next chord's noteOn events [65,69,72], and so on...
    //  - We expect the same number of noteOff events matching those notes.

    // We'll collect them in chronological order:
    const noteOnEvents = simplifiedLog.filter((e) => e.type === "noteOn");
    const noteOffEvents = simplifiedLog.filter((e) => e.type === "noteOff");

    // We expect exactly 4 chords:
    //   (C4,E4,G4), (F4,A4,C5), (G4,B4,D5,F5), (C4,E4,G4)
    // That is 3 notes + 3 notes + 4 notes + 3 notes = 13 noteOn calls
    expect(noteOnEvents.length).toBe(13);

    // We also expect 13 matching noteOff calls in total
    expect(noteOffEvents.length).toBe(13);

    // For a more thorough check, let's look at them in groups:
    const firstChordOns = noteOnEvents.slice(0, 3).map((e) => e.note);
    const secondChordOns = noteOnEvents.slice(3, 6).map((e) => e.note);
    const thirdChordOns = noteOnEvents.slice(6, 10).map((e) => e.note);
    const fourthChordOns = noteOnEvents.slice(10, 13).map((e) => e.note);

    expect(firstChordOns.sort()).toEqual([60, 64, 67]); // C4, E4, G4
    expect(secondChordOns.sort()).toEqual([65, 69, 72]); // F4, A4, C5
    expect(thirdChordOns.sort()).toEqual([67, 71, 74, 77]); // G4, B4, D5, F5
    expect(fourthChordOns.sort()).toEqual([60, 64, 67]); // C4, E4, G4

    // We won't deeply check the noteOff exact order, but we do want to confirm that
    // all noteOns are matched by a corresponding noteOff of the same note+channel.
    // A simple approach is to ensure each note number from noteOn appears in noteOff.

    const noteOffNotes = noteOffEvents.map((e) => e.note);
    for (const on of noteOnEvents) {
      const matchingOffIndex = noteOffNotes.indexOf(on.note);
      expect(matchingOffIndex).toBeGreaterThanOrEqual(0);
      // Remove it so we don't double-count
      noteOffNotes.splice(matchingOffIndex, 1);
    }
    expect(noteOffNotes.length).toBe(0);

    // If we wanted to confirm no stuck notes remain after stop, we can also check:
    expect(midiBus.activeNotes.size).toBe(0);

    // If we get here with no errors, the test has passed.
  });
});
