Technical Design: MIDI Bus
================================

Overview
--------

The MIDI Bus is a central hub for sending MIDI events (such as noteOn, noteOff, controlChange, etc.) within your live-coding system. It decouples your domain logic (e.g., LiveLoops, LFOs, Patterns) from the actual MIDI/audio playback engine.

Why a MIDI Bus?
----------------

* **Decoupling**: Domain objects like LiveLoops or the TransportManager only need to call simple methods like midiBus.noteOn(). They do not need to know how the MIDI data is ultimately delivered to hardware or software.
* **Testability**: By routing all events through a single bus, you can use a mock subscriber for testing. This lets you verify that the right events are fired without requiring actual MIDI hardware or the Web MIDI API at test time.
* **Flexibility**: The bus can have multiple subscribers. For example, you might have:
	+ A real playback engine (using Web MIDI or Tone.js).
	+ A logging/monitoring subscriber that prints messages for debugging.
	+ A mock subscriber in unit tests that captures events for assertions.

Responsibilities
----------------

### API for Sending MIDI

Provide methods for high-level MIDI actions:

* `noteOn({ channel, note, velocity })`
* `noteOff({ channel, note })`
* `controlChange({ channel, cc, value })`
* (Optionally) SysEx, programChange, pitchBend, etc. if desired.

### Event Emission / Subscription

Internally, the bus should have a mechanism to emit events (e.g., 'noteOn', 'noteOff', 'controlChange').
Subscribers (e.g., playback engines) can register callbacks for specific events.

Example:
```javascript
midiBus.on('noteOn', (data) => { /* handle noteOn */ });
```

### Tracking Active Notes (Optional / Helpful)

You can maintain an internal map of “active notes” to help handle forced noteOff calls.
This can be useful when the TransportManager needs to stop all notes on Stop.

Example internal data structure:
```javascript
// key: `channel_note`, value: { channel, note, velocity, timestamp }
activeNotes: {
  "10_36": { channel: 10, note: 36, velocity: 100, startedAt: 12345 },
  ...
}
```

Testability
------------

Your unit tests should be able to:

* Create a MidiBus instance.
* Attach a mock subscriber to capture events.
* Call midiBus.noteOn(...), etc.
* Verify that the correct event was emitted with the correct data.
Integration tests might also wire up the MidiBus to a mock or real playback engine.

Interface & Methods
--------------------

Here’s a suggested interface (in TypeScript-style pseudo-code, but you can adapt to JavaScript):

```typescript
// midi-bus.js (or midiBus.js, naming is flexible)
export class MidiBus {
  private subscribers: { [eventName: string]: Array<(payload: any) => void> };
  private activeNotes: Map<string, ActiveNoteData>; // optional

  constructor() {
    // Initialize internal structures
  }

  on(eventName: string, callback: (payload: any) => void): void {
    // Register a callback for the given eventName
  }

  off(eventName: string, callback: (payload: any) => void): void {
    // Remove a callback for the given eventName
  }

  // -- High-level MIDI calls --
  noteOn(params: { channel: number, note: number, velocity?: number }): void {
    // Possibly store active note in activeNotes
    // Emit 'noteOn' event
  }

  noteOff(params: { channel: number, note: number }): void {
    // Remove from activeNotes if present
    // Emit 'noteOff' event
  }

  controlChange(params: { channel: number, cc: number, value: number }): void {
    // Emit 'controlChange' event
  }

  // Additional calls if needed:
  // programChange, pitchBend, aftertouch, etc.

  // -- Utility / Force Cleanup --
  stopAllNotes(): void {
    // For each active note, emit noteOff
    // Clear activeNotes
  }
}

interface ActiveNoteData {
  channel: number;
  note: number;
  velocity: number;
  startedAt: number; // or a Date/time if you want
}
Event Payloads
----------------

Each event emission should include an object with relevant data:

* `noteOn`: { channel, note, velocity }
* `noteOff`: { channel, note }
* `controlChange`: { channel, cc, value }
(Feel free to extend these objects with fields like timestamp, sourceLoopName, etc., if you need that data for logging or other logic.)

Usage Example
-------------

### 1. Creating and Subscribing

```javascript
import { MidiBus } from './midi-bus.js';

const midiBus = new MidiBus();

// Mock subscriber for demonstration
midiBus.on('noteOn', (data) => {
  console.log('noteOn event received:', data);
});
midiBus.on('noteOff', (data) => {
  console.log('noteOff event received:', data);
});
midiBus.on('controlChange', (data) => {
  console.log('controlChange event:', data);
});
```

### 2. Sending Events

```javascript
// Simulate a LiveLoop calling these methods:
midiBus.noteOn({ channel: 1, note: 60, velocity: 100 });
midiBus.controlChange({ channel: 1, cc: 74, value: 64 });
midiBus.noteOff({ channel: 1, note: 60 });

// Force all notes off (e.g., on Transport Stop)
midiBus.stopAllNotes(); 
```

### 3. Implementation Details

#### Event Emission

You could use a minimal custom event system:
```javascript
emit(eventName, payload) {
  const callbacks = this.subscribers[eventName] || [];
  callbacks.forEach(cb => cb(payload));
}
```

#### Active Notes

If you store active notes:
```javascript
noteOn(params) {
  const key = `${params.channel}_${params.note}`;
  this.activeNotes.set(key, {
    ...params,
    startedAt: performance.now() // or Date.now()
  });
  this.emit('noteOn', params);
}

noteOff(params) {
  const key = `${params.channel}_${params.note}`;
  this.activeNotes.delete(key);
  this.emit('noteOff', params);
}

stopAllNotes() {
  // For each active note, emit a noteOff
  for (const [key, noteData] of this.activeNotes.entries()) {
    this.emit('noteOff', {
      channel: noteData.channel,
      note: noteData.note
    });
  }
  this.activeNotes.clear();
}
```

Testing Strategy
----------------

### Unit Tests for MidiBus

Create a MidiBus instance.
Register a mock subscriber.
Call noteOn({channel:1, note:60, velocity:80}).
Assert that the subscriber’s callback is triggered with { channel:1, note:60, velocity:80 }.
Repeat for noteOff, controlChange, etc.
Active Notes: Confirm that noteOn adds to activeNotes, and noteOff removes from it.
stopAllNotes: Confirm it emits noteOff for all currently active notes.
Integration Tests (later)
Wire it up with a Mock Playback Engine that subscribes to noteOn, noteOff, etc.
Ensure calls to the bus produce the correct underlying playback method calls (or logs).
Example Jest-style unit test outline:

```javascript
// midi-bus.test.js
import { MidiBus } from '../src/midi-bus.js';

describe('MidiBus', () => {
  let midiBus;
  let receivedEvents;

  beforeEach(() => {
    midiBus = new MidiBus();
    receivedEvents = [];
    // Mock subscriber for noteOn
    midiBus.on('noteOn', (data) => {
      receivedEvents.push({ event: 'noteOn', data });
    });
    // Mock subscriber for noteOff
    midiBus.on('noteOff', (data) => {
      receivedEvents.push({ event: 'noteOff', data });
    });
  });

  it('should emit noteOn event with correct payload', () => {
    midiBus.noteOn({ channel: 1, note: 60, velocity: 80 });
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({
      event: 'noteOn',
      data: { channel: 1, note: 60, velocity: 80 }
    });
  });

  it('should track active notes and remove them on noteOff', () => {
    midiBus.noteOn({ channel: 1, note: 60, velocity: 80 });
    midiBus.noteOff({ channel: 1, note: 60 });
    // ...
  });

  it('should stop all notes', () => {
    // ...
  });
});
```

Future Considerations
---------------------

### Extended MIDI Messages

If you need system exclusive (SysEx), pitch bend, aftertouch, or program changes, add corresponding methods to the bus.

### Multiple Listeners

If performance is a concern, consider how many subscribers might exist. The design here should still scale well for typical uses.

### Thread/Concurrency

In a typical browser or Node.js environment, concurrency is event-driven. No special concurrency handling is required beyond normal callback order.

Summary
--------

The MIDI Bus:

* Exposes a simple API to send MIDI events (noteOn, noteOff, controlChange, etc.).
* Emits events internally so that any subscriber (mock, real playback engine, or logger) can respond.
* Optionally tracks active notes to support forced note-offs (avoiding “stuck notes”).
* Is fully testable using mock subscribers, making sure the correct events and data flow through.
This design ensures that domain logic (e.g., LiveLoop) never needs to know how or where MIDI is ultimately played. It just calls midiBus.noteOn(...), and the rest of the system listens and reacts accordingly.

Recommended File Location:

src/midi-bus.js (or midiBus.js, or inside a directory like src/midi/midi-bus.js if you prefer more structure).
Use this doc as a starting point for implementing the actual class in JavaScript. Once you have the MIDI Bus component finished and tested, you can move on to the Playback Engine (mock vs. real), Patterns, LiveLoops, etc.