# Technical Design: TransportManager

## Overview
The **TransportManager** listens to **external MIDI clock and transport messages** (e.g., **Start** (0xFA), **Stop** (0xFC), **Clock** (0xF8) pulses) and **coordinates** calls to **LiveLoop** objects. This ensures:

1. We **never** override external Start/Stop—only **respond** to it.
2. We **convert** incoming clock pulses into **step indices** or pulses that **LiveLoop** can use.
3. We handle **Stop** by forcing note-offs so there are no stuck notes (since LiveLoop defers note-offs).

This design respects the requirement that **LFOs** or other continuous modulations can be updated more frequently than, say, a 16-step bar. The TransportManager can call `liveLoop.tick(...)` as often as needed (e.g., after every clock pulse or every fraction of a step) to achieve **high-resolution LFO updates**, even if the pattern uses a coarser grid for note generation.

---

## Responsibilities

1. **Listen to External Transport**  
   - **Start** (`0xFA`): Set `isRunning = true`, reset `stepIndex`.
   - **Stop** (`0xFC`): Set `isRunning = false`, force note-offs (`midiBus.stopAllNotes()`).
   - **Clock** (`0xF8`): Called multiple times per quarter note (typically 24 pulses/quarter note). Accumulate these pulses to decide when to advance stepIndex—or call LiveLoop tick more often if needed.

2. **Convert Pulses to Steps**  
   - If you want a 16-step pattern per bar, and 1 bar = 4 quarter notes = 96 pulses, you might choose **6 pulses** = 1 step.  
   - Each time you accumulate 6 pulses, increment `stepIndex` by 1.  
   - **But** if you want higher resolution for LFO, you could call `liveLoop.tick(...)` on every pulse and let the pattern only produce notes on certain pulse multiples.

3. **No Internal Start/Stop**  
   - We do **not** send `Start` or `Stop` messages; we **only** react.  
   - The external device is the master tempo source and transport controller.

4. **Note-Off on Stop**  
   - Once we receive `Stop` (0xFC), we ensure `midiBus.stopAllNotes()` is called, preventing stuck notes.

5. **Optional Song Position Pointer**  
   - Some systems may handle **Song Position Pointer** (`0xF2`). You can jump `stepIndex` to match the external device’s position. This is optional.

6. **High-Resolution for LFO**  
   - Because LFOs might need updates more frequently than a 16-step bar, the TransportManager can call `liveLoop.tick(...)` at each clock pulse or even subdivide pulses.  
   - The `deltaTime` or “time since last tick” can help the LFO compute its phase accurately.

---

## Example Implementation Outline

```js
// transport-manager.js

export class TransportManager {
  /**
   * @param {object} midiBus - The MIDI Bus for sending/receiving events.
   * @param {Array<LiveLoop>} liveLoops - Array of LiveLoop instances to coordinate.
   * @param {number} pulsesPerStep - If using a step-based approach (e.g., 6 pulses=1 step).
   *                                 If you want even higher LFO resolution, you can call each loop
   *                                 on every pulse or sub-pulse instead.
   */
  constructor(midiBus, { liveLoops = [], pulsesPerStep = 6 } = {}) {
    this.midiBus = midiBus;
    this.liveLoops = liveLoops;
    this.pulsesPerStep = pulsesPerStep;

    this.isRunning = false;
    this.stepIndex = 0;      // which step we’re on
    this.pulseCounter = 0;   // how many pulses have accumulated

    // Bind and subscribe to MIDI messages
    this._handleIncomingClock = this._handleIncomingClock.bind(this);
    midiBus.on('midiMessage', this._handleIncomingClock);
  }

  _handleIncomingClock(message) {
    const byte0 = message?.data?.[0];
    if (byte0 === 0xFA) {
      // Start
      this._onStart();
    } else if (byte0 === 0xFC) {
      // Stop
      this._onStop();
    } else if (byte0 === 0xF8) {
      // Clock pulse
      this._onClockPulse();
    } else if (byte0 === 0xF2) {
      // Song Position Pointer (optional)
      const lsb = message.data[1];
      const msb = message.data[2];
      this._onSongPositionPointer(lsb, msb);
    }
    // no 'Continue' handling here, as per design
  }

  _onStart() {
    this.isRunning = true;
    this.stepIndex = 0;
    this.pulseCounter = 0;
    // Optionally note-off or stopAllNotes if you want a clean state
  }

  _onStop() {
    this.isRunning = false;
    // Force note-offs to prevent stuck notes
    this.midiBus.stopAllNotes();
  }

  _onClockPulse() {
    if (!this.isRunning) return;

    // We can increment stepIndex in different ways depending on desired resolution.
    // Option A: Accumulate pulses, increment stepIndex whenever we reach pulsesPerStep
    this.pulseCounter++;
    if (this.pulseCounter >= this.pulsesPerStep) {
      this.stepIndex++;
      this.pulseCounter -= this.pulsesPerStep;

      // e.g. call each LiveLoop with step-based updates
      // If you want to track real time (deltaTime), measure with performance.now() or similar
      // For simplicity, use 0 or an approximate value
      const deltaTime = 0;
      this.liveLoops.forEach(loop => loop.tick(this.stepIndex, deltaTime));
    }

    // Option B: call liveLoops on EVERY pulse for higher LFO resolution:
    // let deltaTime = 0;
    // this.liveLoops.forEach(loop => loop.tick(this.stepIndex + this.pulseCounter / this.pulsesPerStep, deltaTime));
    // ...
  }

  _onSongPositionPointer(lsb, msb) {
    // optional: combine LSB/MSB => 14-bit
    const position = (msb << 7) | lsb;
    // Convert that to steps if desired
    // e.g. position is in "MIDI beats" (1 beat = 6 pulses)
    // This might require more logic to align with your steps
  }

  addLiveLoop(liveLoop) {
    this.liveLoops.push(liveLoop);
  }
}
### Key Points

* `isRunning` is `false` until we see Start (0xFA).
* No mention of Continue (0xFB). We ignore it.
* **High-Resolution LFO**:
	+ We can call `tick(...)` on every clock pulse instead of every “step.”
	+ Or combine partial pulses to keep a fine-grained approach.
* Stop => `stopAllNotes()` ensures no stuck notes.

### Testing Strategy

#### Unit Tests:

* Mock the `midiBus` (with a method like `on(type, callback)`, or directly call `_handleIncomingClock`.
* Mock `LiveLoop` objects to confirm that `tick(stepIndex, deltaTime)` is called the correct number of times.
* Simulate:
	+ Start (0xFA) => check `isRunning` = `true`, resets `stepIndex`.
	+ Clock pulses => ensure `stepIndex` increments after the correct # pulses.
	+ Stop (0xFC) => check `isRunning` = `false`, note-offs.
	+ Song Position Pointer => optional test if you implement it.

#### Integration Tests:

* Combine a real `LiveLoop`, send a series of clock pulses, confirm notes appear at expected pulses.
* Ensure stopping the transport triggers `midiBus.stopAllNotes()`.

### Summary

`TransportManager` is the layer that glues external MIDI clock pulses to your `LiveLoops`.
On each Start message, it resets counters; on Stop, it halts and calls `stopAllNotes()`.
Clock pulses increment an internal pulse counter. Once we reach the threshold for a “step” (or if we want a higher resolution per pulse), we call `liveLoop.tick(...)`.
This approach respects the system’s requirement to never initiate transport from within and ensures LFO updates can happen with higher granularity than a simple 16-step grid, if desired.