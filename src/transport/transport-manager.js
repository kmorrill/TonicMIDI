/**
 * src/transport/transport-manager.js
 *
 * The TransportManager reacts to external MIDI clock messages and
 * coordinates LiveLoops accordingly. It does NOT initiate Start/Stop,
 * only responds to them. On Stop, it calls stopAllNotes to avoid stuck notes.
 *
 * Key Points:
 * - isRunning = false until we see Start (0xFA).
 * - Stop (0xFC) -> isRunning = false and stopAllNotes.
 * - Clock (0xF8) pulses -> accumulate pulses; on enough pulses, increment stepIndex
 *   and call liveLoop.tick(stepIndex).
 * - Optionally handle Song Position Pointer (0xF2) to jump stepIndex if needed.
 */

export class TransportManager {
  /**
   * @param {Object} midiBus - The MIDI Bus or similar object that can emit events and handle noteOff/noteOn.
   * @param {Object} options
   * @param {Array} [options.liveLoops=[]] - An array of LiveLoop instances to coordinate.
   * @param {number} [options.pulsesPerStep=6] - Number of clock pulses per "step" (e.g., 6 for 16 steps/bar at 24PPQN).
   * @param {boolean} [options.highResolution=false] - If true, calls liveLoop.tick on every pulse for finer LFO updates.
   */
  constructor(
    midiBus,
    { liveLoops = [], pulsesPerStep = 6, highResolution = false } = {}
  ) {
    this.midiBus = midiBus;
    this.liveLoops = liveLoops;

    this.pulsesPerStep = pulsesPerStep;
    this.highResolution = highResolution; // if true, we call tick() on each pulse (or partial pulses)

    // Transport state
    this.isRunning = false;
    this.stepIndex = 0;
    this.pulseCounter = 0;
    this.timeInBeats = 0.0; // Continuous time counter in beats (1 beat = 1 quarter note)

    // Bind handler for incoming MIDI messages
    this._handleIncomingClock = this._handleIncomingClock.bind(this);
    // Listen for a 'midiMessage' event on the midiBus
    // (Adjust if your bus emits a different event name.)
    this.midiBus.on("midiMessage", this._handleIncomingClock);
  }

  /**
   * Process incoming MIDI messages. Typically `message.data[0]` is the status byte (0xFA, 0xFC, 0xF8, etc.).
   * @param {Object} message - e.g. { data: [0xF8], ... }
   */
  _handleIncomingClock(message) {
    const byte0 = message?.data?.[0];
    if (byte0 === 0xfa) {
      // Start
      this._onStart();
    } else if (byte0 === 0xfc) {
      // Stop
      this._onStop();
    } else if (byte0 === 0xf8) {
      // Clock Pulse
      this._onClockPulse();
    } else if (byte0 === 0xf2) {
      // Song Position Pointer (optional)
      const lsb = message?.data?.[1] ?? 0;
      const msb = message?.data?.[2] ?? 0;
      this._onSongPositionPointer(lsb, msb);
    }
    // No "Continue" (0xFB) handling per design
  }

  /**
   * Called when external device sends Start (0xFA).
   * We reset counters and set isRunning = true.
   */
  _onStart() {
    this.isRunning = true;
    this.stepIndex = 0;
    this.pulseCounter = 0;
    this.timeInBeats = 0.0; // Reset the continuous time counter on start
    // Optionally: Clear any leftover notes if you want a fresh start
    // this.midiBus.stopAllNotes();
  }

  /**
   * Called when external device sends Stop (0xFC).
   * We set isRunning = false and force noteOff for all active notes.
   */
  _onStop() {
    this.isRunning = false;
    // Force note-offs to prevent stuck notes
    this.midiBus.stopAllNotes();
  }

  /**
   * Called for each MIDI clock pulse (0xF8). Typically 24 pulses per quarter note.
   * We decide how to increment stepIndex, or optionally call tick on every pulse
   * if high resolution for LFO is desired.
   */
  _onClockPulse() {
    if (!this.isRunning) return;

    // Increment the continuous time counter (assuming 24 PPQ standard MIDI clock)
    this.timeInBeats += 1.0 / 24.0;

    // If we want highest resolution, call tick() on every pulse
    if (this.highResolution) {
      // stepIndex + fractional offset
      const fraction = this.pulseCounter / this.pulsesPerStep;
      this._callTick(this.stepIndex + fraction);

      // Now handle the normal "accumulate pulses" logic too,
      // so we still increment stepIndex for pattern steps.
    }

    // Accumulate pulses
    this.pulseCounter++;

    // Once we've reached pulsesPerStep, we increment stepIndex
    if (this.pulseCounter >= this.pulsesPerStep) {
      this.stepIndex++;
      this.pulseCounter -= this.pulsesPerStep;

      if (!this.highResolution) {
        // If we're not calling tick() on every pulse, we call it here each step
        this._callTick(this.stepIndex);
      }
    }
  }

  /**
   * Optionally handle Song Position Pointer (0xF2).
   * Each position unit = 6 MIDI clocks per beat, but you might map to your stepIndex if desired.
   */
  _onSongPositionPointer(lsb, msb) {
    const position = (msb << 7) | lsb; // 14-bit value
    // position is in "MIDI beats" (1 beat = 6 clocks).
    // If you want to jump your stepIndex accordingly, do that here.
    // Example:
    // let pulses = position * 6; // total pulses from start
    // let steps = Math.floor(pulses / this.pulsesPerStep);
    // this.stepIndex = steps;
    // this.pulseCounter = pulses % this.pulsesPerStep;
  }

  /**
   * Helper to call tick() on each LiveLoop with the same step index.
   * If you track real time, you could pass a deltaTime argument to each tick().
   * For now, we pass 0 or a placeholder.
   */
  _callTick(stepIndexFloat) {
    const deltaTime = 0; // or measure with performance.now() between pulses
    this.liveLoops.forEach((loop) => {
      loop.tick(stepIndexFloat, deltaTime);
    });
  }

  /**
   * If we want to add another LiveLoop after creation
   */
  addLiveLoop(liveLoop) {
    this.liveLoops.push(liveLoop);
  }
}
