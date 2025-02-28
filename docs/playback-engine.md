Technical Design: Playback Engine
================================

Overview
--------

The Playback Engine is responsible for actually sending MIDI (or audio) data to hardware or software instruments. In your architecture, all MIDI commands (e.g., noteOn, noteOff, controlChange) flow from the MIDI Bus to the Playback Engine.

In order to ensure testability and flexibility, we will first implement a Mock Playback Engine that captures and logs events for verification. Once you have validated your domain logic (LiveLoops, Patterns, TransportManager, MIDI Bus), you can replace or augment the mock with a Real Playback Engine that talks to:

* Web MIDI API (in the browser),
* Tone.js (web-based audio library),
* node-midi (Node.js environment),
* Any hardware MIDI interface via system-level drivers.

Responsibilities
----------------

### Subscribing to the MIDI Bus

The Playback Engine listens for events like 'noteOn', 'noteOff', 'controlChange', etc.
Reacts to these by either logging (Mock) or sending MIDI (Real).

### Handling MIDI Output

* Mock: Store events in an in-memory array or print them to console for debugging/tests.
* Real: Use an actual driver/API to produce sound or send MIDI messages to connected devices.

### Potential Scheduling (optional for mock)

In many systems, the TransportManager handles timing. However, some playback engines (like Tone.js) can do their own scheduling. For this design, the TransportManager is responsible for timing, so the Playback Engine only reacts to immediate events.

### Error Handling or Connection Management (mostly in Real implementation)

* Mock engine can ignore hardware concerns.
* Real engine might need to handle device disconnects, error codes, or user permission requests (e.g., in a browser for Web MIDI).

Data Flow
---------

MIDI Bus
All domain logic calls midiBus.noteOn(...), midiBus.noteOff(...), etc.
The MIDI Bus emits events (like 'noteOn') with payloads (e.g., { channel, note, velocity }).
Playback Engine (Mock or Real)
Subscribes to MIDI Bus events: midiBus.on('noteOn', callback)
On receiving an event, it processes or logs them.
Hardware/Software Output (Real engine only)
The Real engine translates events to low-level MIDI or audio output.
+----------------+       emits events       +----------------------+
|    MIDI Bus    | -----------------------> | Playback Engine      |
| (noteOn, etc.) |                          | (Mock or Real)       |
+----------------+                          +----------------------+
                                                |    (only in Real)
                                                v
                                        +----------------------+
                                        |  Hardware/Software   |
                                        +----------------------+
Mock Playback Engine
-------------------

### Purpose

Test correctness: confirm that when domain logic calls midiBus.noteOn(...), your engine receives the corresponding event with the correct parameters.
No external dependency: no MIDI drivers, no real-time audio. Just logs data.

### Implementation Outline

Constructor:
Accepts a midiBus as a dependency (or you attach it externally).
Creates an internal log array, e.g. this.events = [].
Subscriptions:
In constructor or an init method:
midiBus.on('noteOn', (data) => this.handleNoteOn(data));
midiBus.on('noteOff', (data) => this.handleNoteOff(data));
midiBus.on('controlChange', (data) => this.handleControlChange(data));
// ... pitchBend, aftertouch, programChange, etc. if needed
Each handler just pushes the event into the events array (or logs to console).
Methods:
handleNoteOn(data): this.events.push({ type: 'noteOn', data });
handleNoteOff(data): this.events.push({ type: 'noteOff', data });
etc.
Testing:
Inspect the events array to ensure the correct sequence and payloads were received.
Example Interface
export class MockPlaybackEngine {
  constructor(midiBus) {
    this.midiBus = midiBus;
    this.events = []; // store all received events

    // Subscribe
    this.midiBus.on('noteOn', (data) => this.handleNoteOn(data));
    this.midiBus.on('noteOff', (data) => this.handleNoteOff(data));
    this.midiBus.on('controlChange', (data) => this.handleControlChange(data));
    // (Optional) pitchBend, aftertouch, etc.

    // If needed, store references for unsubscribing or toggling.
  }

  handleNoteOn(data) {
    this.events.push({ type: 'noteOn', data });
  }

  handleNoteOff(data) {
    this.events.push({ type: 'noteOff', data });
  }

  handleControlChange(data) {
    this.events.push({ type: 'controlChange', data });
  }

  // ...
  // Additional handlers for pitchBend, aftertouch, etc.

  // Utility method: clear the log
  clearEvents() {
    this.events = [];
  }
}
Testing the Mock Playback Engine
--------------------------------

Unit Tests (or small integration tests)
Create a MidiBus instance.
Create a MockPlaybackEngine and pass in that MidiBus.
Call midiBus.noteOn({ channel: 1, note: 60, velocity: 100 });
Assert that MockPlaybackEngine.events includes [ { type: 'noteOn', data: { channel: 1, note: 60, velocity: 100 }} ].
Integration with Domain
In a bigger test, you can create a LiveLoop or other domain object, send events to the bus, and ensure the engine logs them. This verifies end-to-end that the domain logic → MIDI Bus → Playback Engine chain works correctly.
Example Test Outline
// test/unit/midi/mock-playback-engine.test.js

import { MidiBus } from '../../../src/midi-bus.js';
import { MockPlaybackEngine } from '../../../src/engines/mock-playback-engine.js';

describe('MockPlaybackEngine', () => {
  let midiBus;
  let mockEngine;

  beforeEach(() => {
    midiBus = new MidiBus();
    mockEngine = new MockPlaybackEngine(midiBus);
  });

  it('should log noteOn events', () => {
    midiBus.noteOn({ channel: 1, note: 60, velocity: 100 });
    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toEqual({
      type: 'noteOn',
      data: { channel: 1, note: 60, velocity: 100 },
    });
  });

  it('should log noteOff events', () => {
    midiBus.noteOff({ channel: 2, note: 64 });
    expect(mockEngine.events).toHaveLength(1);
    expect(mockEngine.events[0]).toEqual({
      type: 'noteOff',
      data: { channel: 2, note: 64 },
    });
  });

  // ...
});
Real Playback Engine (Future Implementation)
-----------------------------------------

Once the system is stable, you can implement a Real Playback Engine. The design is similar, but instead of pushing to an internal array:

Browser & Web MIDI:
Request MIDI access (e.g., navigator.requestMIDIAccess()).
Open output devices.
On noteOn event, call output.send([0x90 + channelOffset, note, velocity]).
Tone.js:
Instead of direct MIDI messages, you’d call Tone.js methods (e.g., synth.triggerAttackRelease(note, duration, time, velocity)).
This might require some additional mapping from integer note numbers to note strings (60 -> "C4") and durations.
Node.js / node-midi:
Initialize a MIDI output port.
On events, call output.sendMessage([0x90, note, velocity]), etc.
Key: The domain logic remains the same because you only change the subscriber to the MIDI Bus, not your LiveLoop, TransportManager, or Patterns.

Architectural Notes
-------------------

Transport vs. Playback:
The TransportManager is responsible for timing (Start/Stop/Clock).
The Playback Engine is responsible for output.
Together they ensure “when” and “what” to play.
Flexibility:
The bus–engine pattern allows you to swap out the Mock or Real engine without touching any domain code.
Testing:
Continue using the Mock Engine in CI or unit tests.
Perform integration or e2e tests with the Real Engine where you connect actual devices or software synthesizers.
Summary
--------

Goals:

Create a MockPlaybackEngine that subscribes to the MIDI Bus and simply logs or stores events.
Write tests ensuring correct receipt of messages from the bus.
Later, replace or complement the mock engine with a Real Playback Engine using Web MIDI, Tone.js, or node-midi to output actual MIDI data to hardware or software instruments.
Key Benefits:

Clear separation of concerns:
Domain logic never directly touches hardware or audio libraries.
The bus just emits events; the engine handles how to output them.
Excellent testability:
The mock engine can be fully tested in isolation or in integration with your domain code, ensuring correctness before introducing hardware complexities.
Scalability:
Multiple engines (or multiple outputs) can subscribe to the same bus if needed, allowing parallel logging, analytics, or multiple hardware outputs.
By following this design, you ensure a smooth development process. You’ll validate your domain logic with the Mock Playback Engine first, and then plug in a Real Playback Engine once confident everything is working as intended.