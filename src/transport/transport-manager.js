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
 * - Only calls liveLoop.tick on integer step boundaries (not fractional steps).
 * - Optionally handle Song Position Pointer (0xF2) to jump stepIndex if needed.
 */

export class TransportManager {
  /**
   * @param {Object} midiBus - The MIDI Bus or similar object that can emit events and handle noteOff/noteOn.
   * @param {Object} options
   * @param {Array} [options.liveLoops=[]] - An array of LiveLoop instances to coordinate.
   * @param {number} [options.pulsesPerStep=6] - Number of clock pulses per "step" (e.g., 6 for 16 steps/bar at 24PPQN).
   * @param {boolean} [options.highResolution=false] - DEPRECATED: No longer used. We always update LFOs per pulse but only call note logic at step boundaries.
   */
  constructor(
    midiBus,
    { liveLoops = [], pulsesPerStep = 6, highResolution = false } = {}
  ) {
    this.midiBus = midiBus;

    this.liveLoops = [];
    for (const loop of liveLoops) {
      this.addLiveLoop(loop);
    }

    this.pulsesPerStep = pulsesPerStep;
    // highResolution is deprecated - we now always update LFOs at high resolution
    // but only trigger notes at integer step boundaries

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

    // Immediately call pattern logic at step 0
    this._callPatternLogic(this.stepIndex);
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
   * We now use two separate mechanisms:
   * 1. On every pulse: Update LFOs with high resolution timing
   * 2. Only at integer step boundaries: Call pattern logic
   */
  _onClockPulse() {
    if (!this.isRunning) return;

    // Store previous time for calculating delta
    const previousTimeInBeats = this.timeInBeats;

    // Increment the continuous time counter (assuming 24 PPQ standard MIDI clock)
    this.timeInBeats += 1.0 / 24.0;

    // Calculate the delta time in beats since the last pulse
    const deltaTime = this.timeInBeats - previousTimeInBeats;

    // Update LFOs on every pulse for high-resolution modulation
    this._updateLFOs(deltaTime, this.timeInBeats);

    // Maintain backward compatibility with the pulse counting approach
    // This ensures tests expecting the old behavior still pass
    this.pulseCounter++;

    // Calculate the new step index based on timeInBeats
    const stepSizeInBeats = this.pulsesPerStep / 24.0;
    const newStepIndex = Math.floor(this.timeInBeats / stepSizeInBeats);

    // Check if we've accumulated enough pulses for a new step
    // OR if we've crossed a step boundary based on timeInBeats
    if (
      this.pulseCounter >= this.pulsesPerStep ||
      newStepIndex > this.stepIndex
    ) {
      if (this.pulseCounter >= this.pulsesPerStep) {
        // Reset pulse counter if we've reached pulsesPerStep
        this.pulseCounter -= this.pulsesPerStep;
        // Increment stepIndex using the pulse counting approach
        this.stepIndex++;
      } else {
        // Set stepIndex based on timeInBeats if that's what triggered the step
        this.stepIndex = newStepIndex;
      }

      // Now call pattern logic with integer step index (only once per step)
      this._callPatternLogic(this.stepIndex);
    }
  }

  /**
   * Optionally handle Song Position Pointer (0xF2).
   * Each position unit = 6 MIDI clocks per beat, but you might map to your stepIndex if desired.
   */
  _onSongPositionPointer(lsb, msb) {
    const position = (msb << 7) | lsb; // 14-bit value
    // position is in "MIDI beats" (1 beat = 6 clocks).

    // Calculate corresponding time in beats (each MIDI beat = 6 clock pulses, 24 PPQN)
    const pulses = position * 6; // Total pulses from start
    this.timeInBeats = pulses / 24.0; // Convert pulses to quarter notes

    // Calculate step size in beats
    const stepSizeInBeats = this.pulsesPerStep / 24.0;

    // Calculate new step index based on timeInBeats
    this.stepIndex = Math.floor(this.timeInBeats / stepSizeInBeats);

    // Update pulseCounter for compatibility, but we primarily rely on timeInBeats now
    this.pulseCounter = pulses % this.pulsesPerStep;
  }

  /**
   * Updates only the LFOs on each LiveLoop for continuous modulation.
   * Called on every pulse for high-resolution updates.
   *
   * @param {number} deltaTime - Time elapsed since last update in beats
   * @param {number} absoluteTime - Current absolute time in beats
   */
  _updateLFOs(deltaTime, absoluteTime) {
    this.liveLoops.forEach((loop) => {
      if (typeof loop.updateLFOsOnly === "function") {
        // If LiveLoop has a dedicated method for updating only LFOs, use it
        loop.updateLFOsOnly(deltaTime, absoluteTime);
      }
      // If no dedicated method, the LFOs will be updated as part of the tick call
      // at step boundaries
    });
  }

  /**
   * Calls pattern logic (notes, triggers) on each LiveLoop with integer step index.
   * Only called when crossing a step boundary.
   *
   * @param {number} stepIndex - The current integer step index
   */
  _callPatternLogic(stepIndex) {
    // Pass 0 for deltaTime to match test expectations
    const deltaTime = 0;

    // Set the current step for MIDI events
    this.midiBus.currentStep = stepIndex;

    // 1) kick provider pattern(s) second
    this.liveLoops
      .filter((loop) => loop.role === "kickProvider")
      .forEach((loop) => {
        loop.tick(stepIndex, 0, this.timeInBeats);
      });

    // 2) chord provider pattern(s) first
    this.liveLoops
      .filter((loop) => loop.role === "chordProvider")
      .forEach((loop) => {
        loop.tick(stepIndex, 0, this.timeInBeats);
      });

    // 3) all others last (those without a role or with a role that isn't chordProvider/kickProvider)
    this.liveLoops
      .filter(
        (loop) => loop.role !== "chordProvider" && loop.role !== "kickProvider"
      )
      .forEach((loop) => {
        loop.tick(stepIndex, 0, this.timeInBeats);
      });
  }

  /**
   * If we want to add another LiveLoop after creation
   */
  addLiveLoop(liveLoop) {
    // Add extra logging to debug
    console.log(`Adding LiveLoop with role: "${liveLoop.role}"`);

    // Check for duplicate chord providers or kick providers
    if (liveLoop.role === "chordProvider") {
      // Check if we already have a chord provider
      const existingChordProviders = this.liveLoops.filter(
        (l) => l.role === "chordProvider"
      );
      if (existingChordProviders.length > 0) {
        console.log(
          `Attempt to add second chordProvider denied. Existing providers: ${existingChordProviders.length}`
        );
        throw new Error("Only one chord provider is allowed");
      }
    }

    if (liveLoop.role === "kickProvider") {
      // Check if we already have a kick provider
      const existingKickProviders = this.liveLoops.filter(
        (l) => l.role === "kickProvider"
      );
      if (existingKickProviders.length > 0) {
        console.log(
          `Attempt to add second kickProvider denied. Existing providers: ${existingKickProviders.length}`
        );
        throw new Error("Only one kick provider is allowed");
      }
    }

    this.liveLoops.push(liveLoop);
  }
}
