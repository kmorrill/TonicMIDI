/**
 * src/live-loop.js
 *
 * A LiveLoop class that:
 *  - Holds a Pattern (implements getNotes(stepIndex, context?))
 *  - Holds zero or more LFOs
 *  - On each tick, calls pattern.getNotes(...) and sends noteOn to the MIDI Bus (but no noteOff)
 *  - Updates each LFO and sends controlChange events for parameter modulation
 *  - Defers noteOff scheduling to the TransportManager
 *  - Allows immediate or enqueued updates of patterns and LFOs
 *
 * This ensures we never start/stop the transport ourselves,
 * and we do not handle note-off logic. The TransportManager
 * or external device controls that.
 *
 * Added for Energy / Tension:
 *  - A 'muted' flag to enable/disable noteOn sending (useful for layering/unlayering).
 *  - A 'transpose' (or semitone shift) to raise/lower the pitch for hype or tension changes.
 *  - Both can be changed on the fly by an EnergyManager or other orchestrator.
 */

export class LiveLoop {
  /**
   * @typedef {Object} LiveLoopOptions
   * @property {object} pattern - Must implement getNotes(stepIndex, context?) and getLength().
   * @property {Array} [lfos] - Array of LFO instances (each with update(deltaTime) => waveValue).
   * @property {number} [midiChannel=1] - Default MIDI channel for noteOn and controlChange.
   * @property {any} [context] - Optional context passed to pattern (e.g. chord data).
   *
   * @property {boolean} [muted=false] - If true, loop won't send noteOn at tick.
   * @property {number} [transpose=0]  - Semitone transposition applied after note name -> MIDI #.
   *
   * Example usage:
   *   const loop = new LiveLoop(midiBus, {
   *     pattern: somePattern,
   *     lfos: [someLfo],
   *     midiChannel: 2,
   *     context: { chord: 'Cmaj7' },
   *     muted: false,
   *     transpose: 0
   *   });
   */

  /**
   * @param {object} midiBus - The MIDI Bus for sending noteOn/controlChange.
   * @param {LiveLoopOptions} options
   */
  constructor(
    midiBus,
    {
      pattern,
      lfos = [],
      midiChannel = 1,
      context = {},
      muted = false,
      transpose = 0,
    } = {}
  ) {
    this.midiBus = midiBus;
    this.pattern = pattern;
    this.lfos = lfos;
    this.midiChannel = midiChannel;
    this.context = context;

    // For controlling hype/tension layering:
    this.muted = muted; // skip noteOn if true
    this.transpose = transpose; // semitone shift

    // For queued changes that we only want to apply at a pattern boundary
    this.changeQueue = [];
  }

  /**
   * Called by TransportManager each "tick" or time subdivision.
   * stepIndex could be a step counter or pulse counter.
   * deltaTime is time since last tick (beats or seconds), for LFO updates.
   *
   * We only send noteOn here; noteOff is deferred to TransportManager.
   */
  tick(stepIndex, deltaTime) {
    // 1) Apply any queued changes if we're at loop boundary
    this._applyQueuedChangesIfNeeded(stepIndex);

    // 2) Always get notes from the pattern for this step, even when muted
    const notes = this.pattern.getNotes(stepIndex, this.context);

    // 3) Send noteOn only if not muted
    if (!this.muted && notes && notes.length) {
      for (const noteObj of notes) {
        // Convert note name (e.g. 'C4') to a MIDI note number
        let midiNote = this._convertNoteNameToMidi(noteObj.note);

        // Apply transpose semitone shift
        midiNote += this.transpose;

        // Safety clamp in [0..127] (MIDI range) if desired
        midiNote = Math.max(0, Math.min(127, midiNote));

        this.midiBus.noteOn({
          channel: this.midiChannel,
          note: midiNote,
          velocity: noteObj.velocity ?? 100,
          // No duration scheduling here—TransportManager handles that.
        });
      }
    }

    // 3) Update each LFO and send controlChange
    for (const lfo of this.lfos) {
      const waveValue = lfo.update(deltaTime);
      // For example, map [-1..1] => [0..127]
      const ccValue = Math.max(
        0,
        Math.min(127, Math.floor((waveValue + 1) * 63.5))
      );

      // Send a CC (just an example CC number, e.g. filter cutoff = 74)
      this.midiBus.controlChange({
        channel: this.midiChannel,
        cc: 74,
        value: ccValue,
      });
    }
  }

  /**
   * Applies queued changes (pattern or LFO updates) if stepIndex is at pattern boundary.
   */
  _applyQueuedChangesIfNeeded(stepIndex) {
    if (this.changeQueue.length === 0) return;

    const length = this.pattern.getLength && this.pattern.getLength();
    if (!length || length <= 0) {
      // If pattern length is not valid, just skip for now
      return;
    }

    // If we're at the start of the loop
    if (stepIndex % length === 0) {
      // Apply all enqueued changes
      for (const change of this.changeQueue) {
        if (change.type === "setPattern") {
          this.pattern = change.pattern;
        } else if (change.type === "updateLFO") {
          // e.g. change = { type: 'updateLFO', index: 0, newProps: { frequency: 2.0 } }
          Object.assign(this.lfos[change.index], change.newProps);
        }
      }
      this.changeQueue = [];
    }
  }

  /**
   * Convert note name (e.g. "C4") to MIDI note number. Stub here,
   * but in a real system you'd use a library or a mapping.
   */
  _convertNoteNameToMidi(noteName) {
    // Placeholder: always return 60 for "C4"
    // In reality, parse the note name properly.
    return 60;
  }

  // -- Public Methods for Changing Patterns or LFOs --

  /**
   * Replace the current pattern either immediately or enqueued for next cycle.
   * @param {object} newPattern - Must implement getNotes() and getLength()
   * @param {boolean} [immediate=false] - If true, replace now; if false, wait until loop boundary
   */
  setPattern(newPattern, immediate = false) {
    if (immediate) {
      this.pattern = newPattern;
    } else {
      this.changeQueue.push({ type: "setPattern", pattern: newPattern });
    }
  }

  /**
   * Add an LFO immediately (no need to queue).
   */
  addLFO(lfo) {
    this.lfos.push(lfo);
  }

  /**
   * Update properties of an existing LFO. If immediate=false,
   * wait until the next pattern boundary before applying changes.
   * @param {number} index - which LFO to update
   * @param {object} newProps - e.g. { frequency: 2.0, amplitude: 0.5 }
   * @param {boolean} [immediate=false]
   */
  updateLFO(index, newProps, immediate = false) {
    if (immediate) {
      Object.assign(this.lfos[index], newProps);
    } else {
      this.changeQueue.push({ type: "updateLFO", index, newProps });
    }
  }

  /**
   * Set or update the context (e.g. chord info, scale, user data).
   * Typically immediate, but you could queue it if you wanted.
   */
  setContext(context) {
    this.context = context;
  }

  /**
   * Mute or unmute the loop. If muted, tick() won't send noteOn messages.
   * This is helpful for layering during hype changes.
   * @param {boolean} bool
   */
  setMuted(bool) {
    this.muted = bool;
  }

  /**
   * Set the semitone transposition. Positive = shift up, negative = shift down.
   * Will be applied in the next tick's noteOn calls.
   * @param {number} semitones
   */
  setTranspose(semitones) {
    this.transpose = semitones;
  }
}
