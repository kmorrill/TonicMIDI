# Technical Design: LiveLoop (Defer Note-Off to TransportManager)

## Overview
A **LiveLoop** is the central domain object that **generates musical events** (notes and parameter modulations) each time the TransportManager calls its `tick()` method. The LiveLoop:

1. **Holds a Pattern** (implements the Pattern interface) to determine which notes to play at each step.
2. **Holds one or more LFOs** that output continuously varying values for MIDI CC or other parameters.
3. **Sends noteOn and CC changes** to the **MIDI Bus**, but **does not handle noteOff**. **Option B** is chosen: **defer note-off scheduling to TransportManager**. 

This ensures that **Transport** (Play/Stop, tempo) is always controlled externally. We never start or stop internally.

---

## Responsibilities

1. **Coordinate Patterns & LFOs**  
   - At each step (or clock pulse), the LiveLoop calls `pattern.getNotes(stepIndex)` to see if new notes should be triggered.  
   - Each LFO is updated based on the time delta, generating a value used for MIDI CC (or other parameters).

2. **Emit MIDI Events (No Note-Off)**  
   - Sends `noteOn(...)` events to `midiBus` for any notes produced by the pattern at that step.  
   - Sends `controlChange(...)` for LFOs.  
   - **Does not** call `noteOff(...)`. Per the chosen design, **TransportManager** (or the external sequencer) is responsible for note-offs. 

3. **Transport is External**  
   - The LiveLoop never calls `play` or `stop`; it only **responds** to `tick(...)` calls from **TransportManager**.  
   - That TransportManager, in turn, is driven by an **external device** (e.g., hardware sequencer sending MIDI Start/Stop/Clock).  
   - This ensures we do **not** override external transport control.

4. **Hot-Swapping Patterns or LFO Parameters**  
   - **Immediate Changes**: You can replace the pattern or adjust LFO settings on the fly, and see those changes reflected **immediately** on the next `tick()`.
   - **Enqueued Changes**: Optionally, changes can be queued for the **next pattern cycle** (when stepIndex returns to 0). This is helpful if you want transitions to be musically aligned with the loop boundary.

5. **High-Resolution LFO Updates**  
   - The LiveLoop can be ticked at a higher resolution than the step grid used for notes (e.g., multiple pulses per quarter note).  
   - This ensures the LFO can produce smooth parameter changes even if the Pattern only changes notes on a coarser 16-step grid.

---

## Data Flow

(TransportManager) -[tick(stepIndex, deltaTime)]-> (LiveLoop)

pattern.getNotes(stepIndex) --> [ { note: ... }, ... ]
LiveLoop => midiBus.noteOn(...) [No noteOff here]
LFO.update(deltaTime) => value
LiveLoop => midiBus.controlChange(...)
(TransportManager) -[some other logic]-> midiBus.noteOff(...) (transport controlled externally)


### Key Points
- The **external device** (hardware sequencer or master) sends Start, Stop, Clock pulses to TransportManager.  
- **TransportManager** calls `liveLoop.tick(...)` each time step or clock subdiv.  
- The LiveLoop obtains new notes from the Pattern, triggers them with noteOn, updates LFOs, and sends CC messages.  
- **Note-off** events are **not** handled by the LiveLoop. 

---

## LiveLoop Class Outline

```js
import { MidiBus } from '../midi-bus.js';

/**
 * @typedef {Object} LiveLoopOptions
 * @property {Pattern} pattern - Pattern implementing getNotes() & getLength()
 * @property {Array} [lfos] - Array of LFO instances
 * @property {number} [midiChannel=1] - Default MIDI channel for noteOn
 * @property {any} [context] - Optional context passed to pattern (chords, scale, etc.)
 */

/**
 * LiveLoop class that:
 *  - Calls pattern for notes, but does NOT schedule noteOff
 *  - Updates LFOs and sends CC messages
 *  - Patterns & LFOs can be changed on the fly (immediate or enqueued)
 */
export class LiveLoop {
  constructor(midiBus, {
    pattern,
    lfos = [],
    midiChannel = 1,
    context = {}
  } = {}) {
    this.midiBus = midiBus;
    this.pattern = pattern;
    this.lfos = lfos;
    this.midiChannel = midiChannel;
    this.context = context;

    // For enqueued changes to apply on loop boundary
    this.changeQueue = [];
  }

  /**
   * Called by TransportManager each step or sub-step.
   * @param {number} stepIndex - current step index (or pulse index)
   * @param {number} deltaTime - time since last tick (beats or seconds)
   */
  tick(stepIndex, deltaTime) {
    // If we want changes only on the next pattern cycle:
    this._applyQueuedChangesIfNeeded(stepIndex);

    // 1. Get notes from pattern
    const notes = this.pattern.getNotes(stepIndex, this.context);
    for (const n of notes) {
      // We do NOT schedule noteOff here; TransportManager does that
      this.midiBus.noteOn({
        channel: this.midiChannel,
        note: this._convertNoteNameToMidi(n.note),
        velocity: n.velocity ?? 100
      });
    }

    // 2. Update LFOs and send CC
    for (const lfo of this.lfos) {
      const val = lfo.update(deltaTime);
      // Map [-1..+1] to [0..127] (simple approach)
      const ccValue = Math.max(0, Math.min(127, Math.floor((val + 1) * 63.5)));
      // Example: CC #74
      this.midiBus.controlChange({
        channel: this.midiChannel,
        cc: 74,
        value: ccValue
      });
    }
  }

  /**
   * If using the "enqueued" approach, only apply changes at loop boundary
   */
  _applyQueuedChangesIfNeeded(stepIndex) {
    if (!this.changeQueue.length) return;

    const length = this.pattern.getLength();
    // If the pattern has no length, fallback or skip
    if (length > 0 && (stepIndex % length) === 0) {
      // Apply all pending changes
      for (const change of this.changeQueue) {
        if (change.type === 'setPattern') {
          this.pattern = change.pattern;
        } else if (change.type === 'updateLFO') {
          const { index, newProps } = change;
          Object.assign(this.lfos[index], newProps);
        }
      }
      this.changeQueue = [];
    }
  }

  /**
   * Convert a note name (e.g. "C4") to a MIDI note number (60).
   * Placeholder or use a real parser library.
   */
  _convertNoteNameToMidi(noteName) {
    // This is just a stub. A real function might parse "A4" => 69, etc.
    return 60; 
  }

  /**
   * Set pattern immediately or enqueued.
   * If immediate, just do `this.pattern = newPattern`.
   * If enqueued:
   */
  setPattern(newPattern, immediate = false) {
    if (immediate) {
      this.pattern = newPattern;
    } else {
      this.changeQueue.push({ type: 'setPattern', pattern: newPattern });
    }
  }

  /**
   * Add or update LFOs
   */
  addLFO(lfo) {
    this.lfos.push(lfo);
  }

  updateLFO(index, newProps, immediate = false) {
    if (immediate) {
      Object.assign(this.lfos[index], newProps);
    } else {
      this.changeQueue.push({ type: 'updateLFO', index, newProps });
    }
  }

  /**
   * Set a new context (chords, keys, etc.) 
   * Could also enqueue, but typically context changes can be immediate.
   */
  setContext(context) {
    this.context = context;
  }
}
## Note on LFO Updates vs. Note Grid

The TransportManager can call tick() more frequently than 16 steps per 4-bar loop to get high-resolution LFO updates.
The pattern might only generate new notes every integer step (like 16 steps per bar), but the LFOs will still produce continuous changes across many sub-steps.

## Approaches for Runtime Changes

### Immediate Update
`setPattern(newPattern, true)` or `updateLFO(index, { frequency: 2.0 }, true)`.
Takes effect the very next call to tick().

### Enqueued for Next Loop
`setPattern(newPattern, false)` or `updateLFO(index, { frequency: 2.0 }, false)` enqueues the change.
The _applyQueuedChangesIfNeeded(...) method applies these changes when stepIndex % pattern.getLength() === 0 (start of the pattern cycle).

## Testing Strategy

### Unit Tests:
- Use a mock or fake MIDI Bus (like jest.fn() stubs) to confirm noteOn / controlChange calls.
- Use a mock Pattern that returns predictable notes:
  `{ getNotes: jest.fn().mockReturnValue([{ note: "C4" }]), getLength: jest.fn().mockReturnValue(8) }`
- Use a trivial or mock LFO that returns a constant or controlled wave.
- Verify that liveLoop.tick(...) triggers the correct bus calls.

### Integration Tests:
- Combine with a real pattern (e.g., ExplicitNotePattern) and a real LFO.
- Tick multiple times, confirm the events that end up on the MIDI Bus.

### No Conflicts with External Transport
- Confirm no calls to midiBus.start or midiBus.stop.
- The LiveLoop only responds to tick() from the external clock/TransportManager.

## Demo Usage Example (Optional)

In demo/index.html or demo/demo.js, you can create:
- A Mock Playback Engine or real engine.
- A TransportManager that increments stepIndex in a setInterval.
- The LiveLoop with a basic pattern & LFO.
- Observe notes (like “C4 noteOn”) and CC changes in real-time console logs.

```import { MidiBus } from '../src/midi-bus.js';
import { MockPlaybackEngine } from '../src/engines/mock-playback-engine.js';
import { ExplicitNotePattern } from '../src/patterns/explicit-note-pattern.js';
import { LFO } from '../src/lfo.js';
import { LiveLoop } from '../src/live-loop.js';

const midiBus = new MidiBus();
const mockEngine = new MockPlaybackEngine(midiBus);

const pattern = new ExplicitNotePattern(["C4", "E4", "G4", "B4"]);
const lfo = new LFO({ frequency: 2.0, shape: 'sine' });
const liveLoop = new LiveLoop(midiBus, { pattern, lfos: [lfo], midiChannel: 1 });

// Simple fake Transport:
let stepIndex = 0;
setInterval(() => {
  // Suppose each 100ms is a “tick”, so ~10 ticks per second
  // This can be a sub-step if your pattern is 16 steps per bar
  liveLoop.tick(stepIndex, 0.1); // deltaTime in "beats" or seconds, your choice
  stepIndex++;
}, 100);

## Summary

- Defer Note-Off: The LiveLoop does not handle noteOff; that’s the TransportManager’s job.
- Never Start/Stop: We only produce events in tick() when asked by the external clock/transport.
- High-Resolution LFO: The LiveLoop can be ticked multiple times per step for smooth modulations, even if note generation is on a 16-step grid.
- Changing Patterns & LFOs: Either immediately or enqueued for next loop.
- Testing: Rely on mocking the MIDI Bus, Pattern, and LFO. Validate correct calls in tick().

With this LiveLoop design, you have a clean domain object that handles pattern-based note triggers and LFO-based parameter modulation while respecting external transport control and TransportManager responsibilities.