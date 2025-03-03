/**
 * src/live-loop.js
 *
 * A LiveLoop class that:
 *  - Holds a Pattern (implements getNotes(stepIndex, context?))
 *  - Holds zero or more LFOs
 *  - On each tick, calls pattern.getNotes(...) and sends noteOn to the MIDI Bus
 *  - Updates each LFO and sends controlChange events for parameter modulation
 *  - Handles noteOff scheduling for active notes based on their duration
 *  - Allows immediate or enqueued updates of patterns and LFOs
 *  - Keeps track of active notes with their expected end steps for noteOff processing
 *
 * This ensures we never start/stop the transport ourselves,
 * and the note-off logic is handled internally based on the step index.
 *
 * Added for Energy / Tension:
 *  - A 'muted' flag to enable/disable noteOn sending (useful for layering/unlayering).
 *  - A 'transpose' (or semitone shift) to raise/lower the pitch for hype or tension changes.
 *  - Both can be changed on the fly by an EnergyManager or other orchestrator.
 *  - Support for GlobalContext with ChordManager and RhythmManager.
 *
 * Added for Note Duration Management:
 *  - An 'activeNotes' array to track currently playing notes
 *  - Each note stores its endStep, calculated from stepIndex + (noteObj.durationSteps || 1)
 *  - At each tick, checks for expired notes (stepIndex >= endStep) and sends noteOff
 *  - Using strictly integer step durations for reliability
 */

export class LiveLoop {
  /**
   * @typedef {Object} LiveLoopOptions
   * @property {object} pattern - Must implement getNotes(stepIndex, context?) and getLength().
   * @property {Array} [lfos] - Array of LFO instances (each with update(deltaTime) => waveValue).
   * @property {number} [midiChannel=1] - Default MIDI channel for noteOn and controlChange.
   * @property {any} [context] - Optional context passed to pattern (e.g. chord data).
   * @property {object} [globalContext] - Optional GlobalContext with chordManager, rhythmManager.
   * @property {string} [name] - Optional name for the loop (useful for EnergyManager targeting).
   *
   * @property {boolean} [muted=false] - If true, loop won't send noteOn at tick.
   * @property {number} [transpose=0]  - Semitone transposition applied after note name -> MIDI #.
   *
   * @property {Array} [activeNotes=[]] - Internally managed array of currently playing notes with their end steps.
   *                                     Each note object contains: {note, velocity, endStep, channel}
   *
   * @property {object} [deviceDefinition] - The device definition for this loop, used to map LFO target parameters to CC numbers.
   *
   * Example usage:
   *   const loop = new LiveLoop(midiBus, {
   *     pattern: somePattern,
   *     lfos: [someLfo],
   *     midiChannel: 2,
   *     context: { chord: 'Cmaj7' },
   *     globalContext: sharedGlobalContext,
   *     name: "Chord",
   *     muted: false,
   *     transpose: 0,
   *     deviceDefinition: someDeviceDefinition
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
      globalContext = null,
      name = "",
      muted = false,
      transpose = 0,
      deviceDefinition = null,
      deviceManager = null,
      midiOutputId = null,
    } = {}
  ) {
    this.midiBus = midiBus;
    this.pattern = pattern;
    this.lfos = lfos;
    this.midiChannel = midiChannel;
    this.context = context;
    this.globalContext = globalContext;
    this.name = name;
    this.deviceDefinition = deviceDefinition;
    this.deviceManager = deviceManager;
    this.midiOutputId = midiOutputId;

    // If we have a deviceManager + outputId, get the device definition
    if (this.deviceManager && this.midiOutputId) {
      this.deviceDefinition =
        this.deviceManager.getDeviceForOutput(this.midiOutputId) || null;
    }

    // For controlling hype/tension layering:
    this.muted = muted; // skip noteOn if true
    this.transpose = transpose; // semitone shift

    // For queued changes that we only want to apply at a pattern boundary
    this.changeQueue = [];

    // For tracking active notes (note, velocity, endStep, channel)
    this.activeNotes = [];

    // For note name to MIDI number conversion
    this._initNoteToMidiMap();
  }

  /**
   * Called by TransportManager each "tick" or time subdivision.
   * With the updated TransportManager, this is only called at integer step boundaries.
   *
   * On each tick, we:
   * 1. Apply any queued changes if at loop boundary
   * 2. Get notes from the pattern for this step
   * 3. Process new notes:
   *    - Send noteOn if the loop is not muted
   *    - Store the note in activeNotes with calculated endStep
   *      (endStep = stepIndex + (noteObj.durationStepsOrBeats || 1))
   * 4. Check activeNotes for expired notes and send noteOff for any where endStep <= stepIndex
   * 5. Update LFOs and send controlChange events
   *
   * @param {number} stepIndex - Current step index in the sequence (always an integer)
   * @param {number} deltaTime - Time elapsed since last update in beats
   * @param {number|null} absoluteTime - Optional absolute time position in beats
   */
  tick(stepIndex, deltaTime, absoluteTime = null) {
    // 1) Apply any queued changes if we're at loop boundary
    this._applyQueuedChangesIfNeeded(stepIndex);

    // 2) Get effective context (local context enhanced with global context if available)
    const effectiveContext = this._getEffectiveContext(stepIndex);

    // 3) Always get notes from the pattern for this step, even when muted
    const notes = this.pattern.getNotes(stepIndex, effectiveContext);

    // 4) Process notes (with or without noteOn)
    if (notes && notes.length) {
      console.log(`[ChordLoop] step=${stepIndex} -> notes=`, notes); // Added for quick debugging
      for (const noteObj of notes) {
        // Convert note name (e.g. 'C4') to a MIDI note number
        let midiNote = this._convertNoteNameToMidi(noteObj.note);

        // Apply transpose semitone shift
        midiNote += this.transpose;

        // Safety clamp in [0..127] (MIDI range) if desired
        midiNote = Math.max(0, Math.min(127, midiNote));

        // Calculate endStep based on duration (default to 1 if not specified)
        // Handle either new or old duration property name for backward compatibility
        const duration =
          noteObj.durationSteps ?? noteObj.durationStepsOrBeats ?? 1;
        // Ensure integer step durations
        const endStep = stepIndex + Math.floor(duration);

        // Velocity (use default if not specified)
        const velocity = noteObj.velocity ?? 100;

        // Check if this note is already active (same channel & note)
        const existingNoteIndex = this.activeNotes.findIndex(
          (n) => n.channel === this.midiChannel && n.note === midiNote
        );

        if (existingNoteIndex >= 0) {
          // We found an already-active note with the same pitch + channel
          const existingNoteObj = this.activeNotes[existingNoteIndex];

          // Always send noteOff when the same note is retriggered
          this.midiBus.noteOff({
            channel: existingNoteObj.channel,
            note: existingNoteObj.note,
          });
          // Remove it from activeNotes
          this.activeNotes.splice(existingNoteIndex, 1);
        }

        // If we reach here, either it's not active or it just ended. So do a new noteOn:
        if (!this.muted) {
          this.midiBus.noteOn({
            channel: this.midiChannel,
            note: midiNote,
            velocity: velocity,
          });
        }

        // Record in activeNotes so we know to turn it off later
        this.activeNotes.push({
          note: midiNote,
          velocity: velocity,
          endStep: endStep,
          channel: this.midiChannel,
        });
      }
    }

    // 5) Check for notes that need to be turned off
    const stillActive = [];
    for (let noteObj of this.activeNotes) {
      if (stepIndex >= noteObj.endStep) {
        // Time to noteOff when we reach or pass the end step
        this.midiBus.noteOff({
          channel: noteObj.channel,
          note: noteObj.note,
        });
      } else {
        stillActive.push(noteObj);
      }
    }
    this.activeNotes = stillActive;

    // 6) Update LFOs (also happens on every pulse through updateLFOsOnly)
    this._updateLFOs(deltaTime, absoluteTime);
  }

  /**
   * Called by TransportManager on every pulse for high-resolution LFO updates.
   * This separates the LFO updates from the note pattern logic.
   *
   * @param {number} deltaTime - Time elapsed since last update in beats
   * @param {number|null} absoluteTime - Optional absolute time position in beats
   */
  updateLFOsOnly(deltaTime, absoluteTime = null) {
    this._updateLFOs(deltaTime, absoluteTime);
  }

  /**
   * Helper method to update LFOs and send CC messages.
   * Used by both tick() and updateLFOsOnly().
   *
   * @private
   * @param {number} deltaTime - Time elapsed since last update in beats
   * @param {number|null} absoluteTime - Optional absolute time position in beats
   */
  _updateLFOs(deltaTime, absoluteTime = null) {
    // Update each LFO and send controlChange
    for (const lfo of this.lfos) {
      let waveValue;

      // Check if we're using absolute time-based updates or delta time
      if (
        absoluteTime !== null &&
        typeof lfo.updateContinuousTime === "function"
      ) {
        // Use the high-resolution continuous time approach
        waveValue = lfo.updateContinuousTime(absoluteTime);
      } else {
        // Fallback to the standard delta-time based approach
        waveValue = lfo.update(deltaTime);
      }

      // For example, map [-1..1] => [0..127]
      const ccValue = Math.floor(waveValue);

      // Determine CC number based on device definition or use default (for tests)
      let ccNum = 74; // Default CC number for tests

      // Look up the CC number for this LFO's target parameter if device definition exists
      if (lfo.targetParam && this.deviceDefinition) {
        const deviceCcNum = this.deviceDefinition.getCC(lfo.targetParam);
        if (deviceCcNum !== null && deviceCcNum !== undefined) {
          ccNum = deviceCcNum;
        }
      }

      // Send a CC message
      this.midiBus.controlChange({
        channel: this.midiChannel,
        cc: ccNum,
        value: ccValue,
      });
    }
  }

  /**
   * Combines local context with global context to create an effective context for patterns
   *
   * @private
   * @param {number} stepIndex - Current step index
   * @returns {Object} Combined context object
   */
  _getEffectiveContext(stepIndex) {
    // Start with local context
    const effectiveContext = { ...this.context };

    // If we have a global context, merge its managers
    if (this.globalContext) {
      // Add managers directly for easier access
      if (this.globalContext.chordManager) {
        effectiveContext.chordManager = this.globalContext.chordManager;
      }

      if (this.globalContext.rhythmManager) {
        effectiveContext.rhythmManager = this.globalContext.rhythmManager;
      }

      // Add current energy state if available
      if (this.globalContext.getEnergyState) {
        effectiveContext.energyState = this.globalContext.getEnergyState();
      }

      // Merge any additional context from global context
      if (this.globalContext.additionalContext) {
        Object.assign(effectiveContext, this.globalContext.additionalContext);
      }
    }

    return effectiveContext;
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
        } else if (change.type === "setContext") {
          this.context = change.context;
        }
      }
      this.changeQueue = [];
    }
  }

  /**
   * Initialize the note name to MIDI number mapping.
   * @private
   */
  _initNoteToMidiMap() {
    // Maps note names to semitone values
    this._noteToSemitone = {
      C: 0,
      "C#": 1,
      Db: 1,
      D: 2,
      "D#": 3,
      Eb: 3,
      E: 4,
      F: 5,
      "F#": 6,
      Gb: 6,
      G: 7,
      "G#": 8,
      Ab: 8,
      A: 9,
      "A#": 10,
      Bb: 10,
      B: 11,
    };
  }

  /**
   * Convert note name (e.g. "C4") to MIDI note number.
   * @private
   * @param {string|number} noteName - Note name with octave (e.g. "C4", "F#3") or MIDI number
   * @returns {number} MIDI note number
   */
  _convertNoteNameToMidi(noteName) {
    if (typeof noteName === "number") {
      // We already have a MIDI number
      return noteName;
    }
    if (typeof noteName !== "string") {
      console.warn(
        "Unexpected noteName:",
        noteName,
        "— defaulting to MIDI 60."
      );
      return 60;
    }
    // Parse note name and octave
    const match = noteName.match(/^([A-G][b#]?)(\d+)$/i);

    if (!match) {
      console.warn(`Invalid note name: ${noteName}. Defaulting to C4 (60).`);
      return 60;
    }

    const [_, note, octave] = match;
    const semitone = this._noteToSemitone[note];

    if (semitone === undefined) {
      console.warn(`Unknown note: ${note}. Defaulting to C.`);
      return 60;
    }

    // Calculate MIDI note number: (octave+1)*12 + semitone
    return (parseInt(octave, 10) + 1) * 12 + semitone;
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
   * Set or update the local context (e.g. chord info, scale, user data).
   * @param {object} context - New context to set
   * @param {boolean} [immediate=true] - If true, apply immediately; if false, queue for next loop
   */
  setContext(context, immediate = true) {
    if (immediate) {
      this.context = context;
    } else {
      this.changeQueue.push({ type: "setContext", context });
    }
  }

  /**
   * Set or update the global context.
   * @param {object} globalContext - New global context to use
   */
  setGlobalContext(globalContext) {
    this.globalContext = globalContext;
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

  /**
   * Set the name of this loop, useful for targeting by EnergyManager.
   * @param {string} name - The name for this loop
   */
  setName(name) {
    this.name = name;
  }
}
