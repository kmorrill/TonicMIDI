// tests/unit/engines/mock-playback-engine.test.js

import { MidiBus } from "../../../src/midi-bus.js";
import { MockPlaybackEngine } from "../../../src/engines/mock-playback-engine.js";
import { LiveLoop } from "../../../src/live-loop.js";

describe("MockPlaybackEngine", () => {
  let midiBus;
  let mockEngine;

  beforeEach(() => {
    // Create a new MidiBus and a MockPlaybackEngine before each test
    midiBus = new MidiBus();
    mockEngine = new MockPlaybackEngine(midiBus);
  });

  it("should log noteOn events", () => {
    expect(mockEngine.events).toHaveLength(0);

    midiBus.noteOn({ channel: 1, note: 60, velocity: 100 });

    // Verify the engine logged the event
    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toMatchObject({
      type: "noteOn",
      data: { channel: 1, note: 60, velocity: 100 },
    });
  });

  it("should log noteOff events", () => {
    midiBus.noteOff({ channel: 2, note: 64 });

    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toMatchObject({
      type: "noteOff",
      data: { channel: 2, note: 64 },
    });
  });

  it("should log controlChange events", () => {
    midiBus.controlChange({ channel: 3, cc: 74, value: 64 });

    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toMatchObject({
      type: "controlChange",
      data: { channel: 3, cc: 74, value: 64 },
    });
  });

  it("should log pitchBend events", () => {
    midiBus.pitchBend({ channel: 1, value: 1024 });

    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toMatchObject({
      type: "pitchBend",
      data: { channel: 1, value: 1024 },
    });
  });

  it("should log programChange events", () => {
    midiBus.programChange({ channel: 2, program: 10 });

    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toMatchObject({
      type: "programChange",
      data: { channel: 2, program: 10 },
    });
  });

  it("should log aftertouch events", () => {
    midiBus.aftertouch({ channel: 1, pressure: 57 });

    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toMatchObject({
      type: "aftertouch",
      data: { channel: 1, pressure: 57 },
    });
  });

  it("should allow clearing of logged events", () => {
    midiBus.noteOn({ channel: 1, note: 60, velocity: 80 });
    expect(mockEngine.events).toHaveLength(1);

    mockEngine.clearEvents();
    expect(mockEngine.events).toHaveLength(0);
  });

  it("should log multiple events in order", () => {
    midiBus.noteOn({ channel: 1, note: 60 });
    midiBus.controlChange({ channel: 1, cc: 10, value: 50 });
    midiBus.noteOff({ channel: 1, note: 60 });

    expect(mockEngine.events).toHaveLength(3);
    expect(mockEngine.events[0].type).toBe("noteOn");
    expect(mockEngine.events[1].type).toBe("controlChange");
    expect(mockEngine.events[2].type).toBe("noteOff");
  });
  
  it("should log LiveLoop noteOff events with proper timing", () => {
    // Create a simple pattern that returns fixed notes
    const patternMock = {
      getNotes: (stepIndex) => {
        if (stepIndex === 0) {
          return [{ note: "C4", durationSteps: 2 }]; // Note with 2-step duration
        }
        return []; // No new notes on other steps
      },
      getLength: () => 4
    };
    
    // Create a LiveLoop with our pattern
    const liveLoop = new LiveLoop(midiBus, {
      pattern: patternMock,
      midiChannel: 1
    });
    
    // Clear any existing events
    mockEngine.clearEvents();
    
    // Step 0: Should trigger a noteOn for C4
    liveLoop.tick(0, 0.25);
    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toMatchObject({
      type: "noteOn",
      data: { channel: 1, note: 60, velocity: 100 } // C4 is MIDI 60
    });
    
    // Step 1: Nothing should happen yet (duration is 2)
    liveLoop.tick(1, 0.25);
    expect(mockEngine.events).toHaveLength(1); // Still only the noteOn
    
    // Step 2: Should send noteOff for C4 (duration expired)
    liveLoop.tick(2, 0.25);
    expect(mockEngine.events).toHaveLength(2);
    expect(mockEngine.events[1]).toMatchObject({
      type: "noteOff",
      data: { channel: 1, note: 60 } // noteOff for C4
    });
  });
});
