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
 *  - Keeps track of active notes with their expected end steps for future noteOff processing
 *
 * This ensures we never start/stop the transport ourselves,
 * and we do not handle note-off logic directly. The TransportManager
 * or external device controls that.
 *
 * Added for Energy / Tension:
 *  - A 'muted' flag to enable/disable noteOn sending (useful for layering/unlayering).
 *  - A 'transpose' (or semitone shift) to raise/lower the pitch for hype or tension changes.
 *  - Both can be changed on the fly by an EnergyManager or other orchestrator.
 *  - Support for GlobalContext with ChordManager and RhythmManager.
 * 
 * Added for Note Duration Management:
 *  - An 'activeNotes' array to track currently playing notes
 *  - Each note stores its endStep, calculated from stepIndex + (noteObj.durationStepsOrBeats || 1)
 *  - This enables future TransportManager improvements to handle proper noteOff timing
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
   * Example usage:
   *   const loop = new LiveLoop(midiBus, {
   *     pattern: somePattern,
   *     lfos: [someLfo],
   *     midiChannel: 2,
   *     context: { chord: 'Cmaj7' },
   *     globalContext: sharedGlobalContext,
   *     name: "Chord",
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
      globalContext = null,
      name = '',
      muted = false,
      transpose = 0,
    } = {}
  ) {
    this.midiBus = midiBus;
    this.pattern = pattern;
    this.lfos = lfos;
    this.midiChannel = midiChannel;
    this.context = context;
    this.globalContext = globalContext;
    this.name = name;

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
   * stepIndex could be a step counter or pulse counter.
   * deltaTime is time since last tick (beats or seconds), for LFO updates.
   *
   * We only send noteOn here; noteOff is deferred to TransportManager.
   * 
   * For each note, we:
   * 1. Send noteOn if the loop is not muted
   * 2. Store the note in activeNotes with calculated endStep
   *    - endStep = stepIndex + (noteObj.durationStepsOrBeats || 1)
   * 3. The TransportManager will later use activeNotes to send appropriate noteOff commands
   */
  tick(stepIndex, deltaTime) {
    // 1) Apply any queued changes if we're at loop boundary
    this._applyQueuedChangesIfNeeded(stepIndex);

    // 2) Get effective context (local context enhanced with global context if available)
    const effectiveContext = this._getEffectiveContext(stepIndex);

    // 3) Always get notes from the pattern for this step, even when muted
    const notes = this.pattern.getNotes(stepIndex, effectiveContext);

    // 4) Process notes (with or without noteOn)
    if (notes && notes.length) {
      for (const noteObj of notes) {
        // Convert note name (e.g. 'C4') to a MIDI note number
        let midiNote = this._convertNoteNameToMidi(noteObj.note);

        // Apply transpose semitone shift
        midiNote += this.transpose;

        // Safety clamp in [0..127] (MIDI range) if desired
        midiNote = Math.max(0, Math.min(127, midiNote));
        
        // Calculate endStep based on duration (default to 1 if not specified)
        const endStep = stepIndex + (noteObj.durationStepsOrBeats || 1);
        
        // Velocity (use default if not specified)
        const velocity = noteObj.velocity ?? 100;

        // 1) Send noteOn immediately if not muted
        if (!this.muted) {
          this.midiBus.noteOn({
            channel: this.midiChannel,
            note: midiNote,
            velocity: velocity,
            // No duration scheduling here—TransportManager handles that.
          });
        }
        
        // 2) Record it in activeNotes (even if muted, for future noteOff)
        this.activeNotes.push({
          note: midiNote,
          velocity: velocity,
          endStep: endStep,
          channel: this.midiChannel
        });
      }
    }

    // 5) Update each LFO and send controlChange
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
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
  }

  /**
   * Convert note name (e.g. "C4") to MIDI note number.
   * @private
   * @param {string|number} noteName - Note name with octave (e.g. "C4", "F#3") or MIDI number
   * @returns {number} MIDI note number
   */
  _convertNoteNameToMidi(noteName) {
    // Handle numeric note values (already MIDI numbers)
    if (!isNaN(noteName)) {
      return parseInt(noteName, 10);
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
