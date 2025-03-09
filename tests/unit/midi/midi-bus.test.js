// test/unit/midi/midi-bus.test.js

import { MidiBus } from "../../../src/midi-bus.js";

describe("MidiBus (Unit Tests)", () => {
  let midiBus;
  let events; // array to store emitted events for verification

  // Helper to create a subscriber that captures all events into `events` array
  function createSubscriber(eventType) {
    return (data) => {
      events.push({ type: eventType, data });
    };
  }

  beforeEach(() => {
    // Fresh MidiBus before each test
    midiBus = new MidiBus();
    events = [];

    // Register test subscribers for noteOn, noteOff, and controlChange
    midiBus.on("noteOn", createSubscriber("noteOn"));
    midiBus.on("noteOff", createSubscriber("noteOff"));
    midiBus.on("controlChange", createSubscriber("controlChange"));

    // Optionally subscribe to extended events if you're testing them
    midiBus.on("pitchBend", createSubscriber("pitchBend"));
    midiBus.on("programChange", createSubscriber("programChange"));
    midiBus.on("aftertouch", createSubscriber("aftertouch"));
  });

  it("should emit noteOn event with correct payload and track active note", () => {
    expect(events).toHaveLength(0);

    midiBus.noteOn({ channel: 1, note: 60, velocity: 80 });

    // Check emitted event
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "noteOn",
      data: { channel: 1, note: 60, velocity: 80 },
    });

    // Check activeNotes
    const key = "1_60";
    expect(midiBus.activeNotes.has(key)).toBe(true);
    const activeNote = midiBus.activeNotes.get(key);
    expect(activeNote).toEqual({ channel: 1, note: 60, velocity: 80 });
  });

  it("should emit noteOff event and remove active note", () => {
    // Turn note on
    midiBus.noteOn({ channel: 1, note: 60, velocity: 90 });
    expect(midiBus.activeNotes.size).toBe(1);

    // Turn note off
    midiBus.noteOff({ channel: 1, note: 60 });

    // We expect noteOff to have been emitted
    expect(events).toHaveLength(2);
    const secondEvent = events[1];
    expect(secondEvent).toMatchObject({
      type: "noteOff",
      data: { channel: 1, note: 60 },
    });

    // The note should be removed from activeNotes
    const key = "1_60";
    expect(midiBus.activeNotes.has(key)).toBe(false);
  });

  it("should handle multiple active notes at once", () => {
    midiBus.noteOn({ channel: 1, note: 60, velocity: 100 });
    midiBus.noteOn({ channel: 1, note: 64, velocity: 110 });
    midiBus.noteOn({ channel: 2, note: 60, velocity: 90 });

    expect(midiBus.activeNotes.size).toBe(3);

    // Turn off one note
    midiBus.noteOff({ channel: 1, note: 60 });
    expect(midiBus.activeNotes.size).toBe(2);

    // Turn off the rest
    midiBus.noteOff({ channel: 1, note: 64 });
    midiBus.noteOff({ channel: 2, note: 60 });
    expect(midiBus.activeNotes.size).toBe(0);
  });

  it("should emit controlChange with correct payload", () => {
    midiBus.controlChange({ channel: 2, cc: 74, value: 64 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "controlChange",
      data: { channel: 2, cc: 74, value: 64 },
    });
  });

  it("should stop all active notes with stopAllNotes", () => {
    midiBus.noteOn({ channel: 1, note: 60 });
    midiBus.noteOn({ channel: 1, note: 64 });
    midiBus.noteOn({ channel: 2, note: 60 });
    expect(midiBus.activeNotes.size).toBe(3);

    // stopAllNotes should emit noteOff for every active note
    midiBus.stopAllNotes();

    // We turned on 3 notes, so we expect 3 noteOff events
    // events array also contains noteOn events, so let's find all noteOff
    const noteOffEvents = events.filter((e) => e.type === "noteOff");
    expect(noteOffEvents).toHaveLength(3);

    // Now activeNotes should be empty
    expect(midiBus.activeNotes.size).toBe(0);
  });

  it("should handle pitchBend, programChange, and aftertouch (optional)", () => {
    // Clear events from the initial noteOn/off/CC subscribers
    events = [];

    // pitchBend
    midiBus.pitchBend({ channel: 3, value: 123 });
    expect(events.some(e => 
      e.type === "pitchBend" && 
      e.data.channel === 3 && 
      e.data.value === 123
    )).toBe(true);

    // programChange
    midiBus.programChange({ channel: 4, program: 10 });
    expect(events.some(e => 
      e.type === "programChange" && 
      e.data.channel === 4 && 
      e.data.program === 10
    )).toBe(true);

    // aftertouch
    midiBus.aftertouch({ channel: 1, pressure: 57 });
    expect(events.some(e => 
      e.type === "aftertouch" && 
      e.data.channel === 1 && 
      e.data.pressure === 57
    )).toBe(true);
  });

  it("should support removing (off) an event listener", () => {
    // Create a special callback we can track
    let callCount = 0;
    const tempCallback = () => {
      callCount++;
    };
    
    midiBus.on("noteOn", tempCallback);

    midiBus.noteOn({ channel: 1, note: 60 });
    // tempCallback should have been called once
    expect(callCount).toBe(1);

    // Now remove it
    midiBus.off("noteOn", tempCallback);

    // This second noteOn shouldn't trigger tempCallback
    midiBus.noteOn({ channel: 1, note: 64 });
    expect(callCount).toBe(1); // still 1, no additional calls
  });
  
  it("should update active note when the same note is retriggered", () => {
    // First note with velocity 80
    midiBus.noteOn({ channel: 1, note: 60, velocity: 80 });
    
    // Check initial state
    const key = "1_60";
    expect(midiBus.activeNotes.has(key)).toBe(true);
    expect(midiBus.activeNotes.get(key)).toEqual({ channel: 1, note: 60, velocity: 80 });
    
    // Retrigger the same note with different velocity
    midiBus.noteOn({ channel: 1, note: 60, velocity: 100 });
    
    // The active note should be updated with the new velocity
    expect(midiBus.activeNotes.has(key)).toBe(true);
    expect(midiBus.activeNotes.get(key)).toEqual({ channel: 1, note: 60, velocity: 100 });
    
    // Verify two noteOn events were emitted
    const noteOnEvents = events.filter(e => e.type === "noteOn");
    expect(noteOnEvents).toHaveLength(2);
  });
});
