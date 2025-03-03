/**
 * src/live-loop.js
 *
 * A LiveLoop class manages the playback logic for a single musical part or track.
 * It holds:
 *   - A Pattern (implementing `getNotes(stepIndex, context)` and `getLength()`)
 *   - An array of LFOs for parameter modulation
 *   - An internal list of active notes, so it can schedule `noteOff` events
 *     based on duration.
 *
 * This class does NOT directly start or stop the transport; it relies on an
 * external TransportManager to call `tick()` on every step, and optionally
 * `updateLFOsOnly()` on high-resolution pulses. In typical usage, you won't
 * call these methods yourself; the TransportManager handles it.
 *
 * ### Example Usage
 * ```js
 * import { LiveLoop, ExplicitNotePattern, LFO } from "op-xy-live";
 * import { MidiBus } from "op-xy-live";  // or a shared instance
 *
 * // 1) Create a MIDI bus
 * const midiBus = new MidiBus();
 *
 * // 2) Define a simple pattern (e.g., a short 4-step melodic line)
 * const myPattern = new ExplicitNotePattern([
 *   "C4", "E4", "G4", "B4"
 * ]);
 *
 * // 3) (Optional) Create an LFO that modulates filterCutoff
 * const myLFO = new LFO({ targetParam: "filterCutoff", frequency: 0.5 });
 *
 * // 4) Create a LiveLoop that uses the pattern and LFO
 * const myLoop = new LiveLoop(midiBus, {
 *   pattern: myPattern,
 *   midiChannel: 1,
 *   lfos: [myLFO],
 *   name: "Melody"
 * });
 *
 * // 5) (Optional) Add it to a TransportManager that calls myLoop.tick() for us
 * // ...
 *
 * // 6) Change the pattern or transpose in real time:
 * myLoop.setTranspose(2); // shift up by 2 semitones
 * myLoop.setPattern(someOtherPattern, false); // queue new pattern for next cycle
 * ```
 */
export class LiveLoop {
  /**
   * @typedef {Object} LiveLoopOptions
   * @property {object} pattern
   *   A pattern implementing `getNotes(stepIndex, context)` and `getLength()`.
   *   The pattern decides which notes to play at each step.
   * @property {object[]} [lfos=[]]
   *   An array of LFO instances for parameter modulation. Each LFO can target
   *   a parameter like "filterCutoff" or "resonance" via a deviceDefinition.
   * @property {number} [midiChannel=1]
   *   Which MIDI channel this loop sends noteOn/noteOff events on (1-16).
   * @property {object} [context={}]
   *   Optional local context passed to the pattern on `getNotes()`.
   * @property {object} [globalContext=null]
   *   A shared context object (e.g. containing chordManager, rhythmManager).
   * @property {string} [name=""]
   *   A friendly name for this loop (useful for debugging or orchestration).
   * @property {boolean} [muted=false]
   *   If true, noteOn events are skipped (though noteOff still occurs).
   * @property {number} [transpose=0]
   *   Semitone transposition applied to pattern notes. Positive = pitch up.
   * @property {object} [deviceDefinition=null]
   *   A device definition for mapping LFO target parameters to MIDI CC numbers.
   * @property {object} [deviceManager=null]
   *   A device manager that can look up a `deviceDefinition` by `midiOutputId`.
   * @property {string|null} [midiOutputId=null]
   *   Identifies which MIDI output device is used. If provided with a deviceManager,
   *   then `deviceDefinition` is retrieved automatically.
   */

  /**
   * Constructs a new LiveLoop. Once created, it listens for "tick" calls from
   * a TransportManager. Each tick, it retrieves notes from its pattern,
   * sends `noteOn` events, schedules `noteOff` (based on note durations),
   * and updates LFOs to send `controlChange` events as needed.
   *
   * @param {object} midiBus
   *   The MIDI Bus for sending noteOn, noteOff, controlChange, etc.
   * @param {LiveLoopOptions} [options={}]
   *   Configuration options for the loop.
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
    /** @private */
    this.midiBus = midiBus;

    /**
     * The pattern that determines which notes to play at each step.
     * Must implement `getNotes(stepIndex, context)` and `getLength()`.
     * @type {object}
     */
    this.pattern = pattern;

    /**
     * Array of LFO objects for continuous parameter modulation.
     * @type {object[]}
     */
    this.lfos = lfos;

    /**
     * MIDI channel to use for noteOn/noteOff messages (1-16).
     * @type {number}
     */
    this.midiChannel = midiChannel;

    /**
     * Local context passed to the pattern (e.g. chord info, scale).
     * @type {object}
     */
    this.context = context;

    /**
     * GlobalContext that may include chordManager, rhythmManager, etc.
     * @type {object|null}
     */
    this.globalContext = globalContext;

    /**
     * An optional name for logging, debugging, or orchestration identification.
     * @type {string}
     */
    this.name = name;

    /**
     * Whether this loop is currently muted. If true, noteOn events are skipped.
     * @type {boolean}
     */
    this.muted = muted;

    /**
     * A semitone shift for all notes from this pattern (positive = pitch up).
     * @type {number}
     */
    this.transpose = transpose;

    /** @private */
    this.changeQueue = [];

    /**
     * Array of active notes that are currently sounding. Used to know when to send noteOff.
     * Each item has { note, velocity, endStep, channel }.
     * @type {Array}
     */
    this.activeNotes = [];

    /** @private */
    this.deviceManager = deviceManager;

    /** @private */
    this.midiOutputId = midiOutputId;

    // If deviceManager + midiOutputId are provided, get a deviceDefinition
    if (this.deviceManager && this.midiOutputId) {
      this.deviceDefinition =
        this.deviceManager.getDeviceForOutput(this.midiOutputId) || null;
    } else {
      this.deviceDefinition = deviceDefinition;
    }

    // Build noteName->MIDI map
    this._initNoteToMidiMap();
  }

  /**
   * **Internal method (called by TransportManager).**
   * Advances the loop by one step:
   *  1) Applies queued changes if at pattern boundary
   *  2) Calls the pattern for new notes
   *  3) Sends noteOn (unless muted) and schedules noteOff
   *  4) Checks for notes that need noteOff this step
   *  5) Updates LFOs
   *
   * @private
   * @param {number} stepIndex - Current integer step index
   * @param {number} deltaTime - Time since last step (in beats)
   * @param {number|null} absoluteTime - Absolute time in beats (for LFO usage)
   */
  tick(stepIndex, deltaTime, absoluteTime = null) {
    // 1) Handle pattern changes if we just hit the pattern boundary
    this._applyQueuedChangesIfNeeded(stepIndex);

    // 2) Combine local context with global context
    const effectiveContext = this._getEffectiveContext(stepIndex);

    // 3) Get new notes from pattern
    const notes = this.pattern.getNotes(stepIndex, effectiveContext);

    // 4) Start new notes with noteOn, store them in activeNotes
    if (notes && notes.length) {
      for (const noteObj of notes) {
        let midiNote = this._convertNoteNameToMidi(noteObj.note);
        midiNote += this.transpose; // apply semitone shift
        // Clamp to [0..127] just to be safe
        midiNote = Math.max(0, Math.min(127, midiNote));

        const duration =
          noteObj.durationSteps ?? noteObj.durationStepsOrBeats ?? 1;
        const endStep = stepIndex + Math.floor(duration);
        const velocity = noteObj.velocity ?? 100;

        // If note is retriggered, stop the old instance
        const existingIdx = this.activeNotes.findIndex(
          (n) => n.channel === this.midiChannel && n.note === midiNote
        );
        if (existingIdx >= 0) {
          const existing = this.activeNotes[existingIdx];
          this.midiBus.noteOff({
            channel: existing.channel,
            note: existing.note,
          });
          this.activeNotes.splice(existingIdx, 1);
        }

        // Send noteOn unless muted
        if (!this.muted) {
          this.midiBus.noteOn({
            channel: this.midiChannel,
            note: midiNote,
            velocity,
          });
        }

        this.activeNotes.push({
          note: midiNote,
          velocity,
          endStep,
          channel: this.midiChannel,
        });
      }
    }

    // 5) Turn off any notes that have reached their end
    const stillActive = [];
    for (const noteObj of this.activeNotes) {
      if (stepIndex >= noteObj.endStep) {
        this.midiBus.noteOff({
          channel: noteObj.channel,
          note: noteObj.note,
        });
      } else {
        stillActive.push(noteObj);
      }
    }
    this.activeNotes = stillActive;

    // 6) High-level LFO update (if not done at finer resolution)
    this._updateLFOs(deltaTime, absoluteTime);
  }

  /**
   * **Internal method (called by TransportManager).**
   * Updates LFOs at every clock pulse (higher resolution than 1 step).
   * This is optional but can provide smoother parameter modulation.
   *
   * @private
   * @param {number} deltaTime - Elapsed time (beats) since last call
   * @param {number|null} absoluteTime - Absolute time in beats
   */
  updateLFOsOnly(deltaTime, absoluteTime = null) {
    this._updateLFOs(deltaTime, absoluteTime);
  }

  /**
   * Immediately replaces the current pattern or queues the change to occur
   * at the next pattern boundary (start of pattern).
   *
   * @param {object} newPattern
   *   The new pattern, which must implement `getNotes()` and `getLength()`.
   * @param {boolean} [immediate=false]
   *   If true, replace the pattern right away; if false, wait until the next
   *   time `stepIndex` modulo pattern length = 0.
   */
  setPattern(newPattern, immediate = false) {
    if (immediate) {
      this.pattern = newPattern;
    } else {
      this.changeQueue.push({ type: "setPattern", pattern: newPattern });
    }
  }

  /**
   * Add an LFO immediately (no enqueuing needed).
   *
   * @param {object} lfo
   *   An LFO instance (e.g. new LFO({ ... }))
   */
  addLFO(lfo) {
    this.lfos.push(lfo);
  }

  /**
   * Update properties of an existing LFO. If `immediate=false`, the change
   * will be applied at the next pattern boundary, so you don't abruptly
   * alter its state mid-cycle.
   *
   * @param {number} index
   *   The index of the LFO in the `lfos` array.
   * @param {object} newProps
   *   An object of updated properties, e.g. `{ frequency: 2.0 }`.
   * @param {boolean} [immediate=false]
   *   If true, apply changes now; otherwise, queue them.
   */
  updateLFO(index, newProps, immediate = false) {
    if (immediate) {
      Object.assign(this.lfos[index], newProps);
    } else {
      this.changeQueue.push({ type: "updateLFO", index, newProps });
    }
  }

  /**
   * Sets or updates the local context. The pattern receives this context each
   * step in `getNotes(stepIndex, context)`, so you can store chord data,
   * user-defined flags, or anything else to influence note generation.
   *
   * @param {object} context
   *   The new local context.
   * @param {boolean} [immediate=true]
   *   If true, apply immediately. If false, wait until the pattern boundary.
   */
  setContext(context, immediate = true) {
    if (immediate) {
      this.context = context;
    } else {
      this.changeQueue.push({ type: "setContext", context });
    }
  }

  /**
   * Sets or updates the global context reference. Useful if your system
   * has a shared context with chordManager or rhythmManager that you
   * want to attach after constructing the loop.
   *
   * @param {object} globalContext
   *   The new global context object.
   */
  setGlobalContext(globalContext) {
    this.globalContext = globalContext;
  }

  /**
   * Mutes or unmutes the loop. If muted, it won't send any `noteOn` events,
   * although it will still handle durations and eventually send `noteOff`.
   *
   * @param {boolean} bool
   *   If true, liveLoop is muted.
   */
  setMuted(bool) {
    this.muted = bool;
  }

  /**
   * Applies a semitone transposition to all played notes. Typically used by
   * an EnergyManager or tension mechanism to create pitch shifts. E.g. setTranspose(7)
   * might raise all notes by a perfect fifth for tension.
   *
   * @param {number} semitones
   *   Positive to shift up, negative to shift down.
   */
  setTranspose(semitones) {
    this.transpose = semitones;
  }

  /**
   * Assign a descriptive or friendly name (e.g. "Bass", "Melody", "Drums").
   * This can be helpful for orchestration or debugging logs.
   *
   * @param {string} name
   *   The new name for this loop.
   */
  setName(name) {
    this.name = name;
  }

  /**
   * @private
   * Applies queued changes if we're at the start of a pattern cycle
   * (`stepIndex % pattern.getLength() === 0`). The changes may include
   * setting a new pattern or updating an LFO.
   */
  _applyQueuedChangesIfNeeded(stepIndex) {
    if (!this.changeQueue.length) return;

    const length = this.pattern.getLength && this.pattern.getLength();
    if (!length || length <= 0) {
      // If pattern length is invalid, skip
      return;
    }

    if (stepIndex % length === 0) {
      for (const change of this.changeQueue) {
        if (change.type === "setPattern") {
          this.pattern = change.pattern;
        } else if (change.type === "updateLFO") {
          Object.assign(this.lfos[change.index], change.newProps);
        } else if (change.type === "setContext") {
          this.context = change.context;
        }
      }
      this.changeQueue = [];
    }
  }

  /**
   * @private
   * Merges local context with any chord/rhythm data from globalContext
   * to produce the final context object passed to the pattern.
   */
  _getEffectiveContext(stepIndex) {
    const effectiveContext = { ...this.context };

    if (this.globalContext) {
      // chord/rhythm managers
      if (this.globalContext.chordManager) {
        effectiveContext.chordManager = this.globalContext.chordManager;
      }
      if (this.globalContext.rhythmManager) {
        effectiveContext.rhythmManager = this.globalContext.rhythmManager;
      }
      // energy state
      if (this.globalContext.getEnergyState) {
        effectiveContext.energyState = this.globalContext.getEnergyState();
      }
      // extra fields
      if (this.globalContext.additionalContext) {
        Object.assign(effectiveContext, this.globalContext.additionalContext);
      }
    }

    return effectiveContext;
  }

  /**
   * @private
   * Performs LFO updates each tick or pulse. Sends controlChange messages
   * if needed, using deviceDefinition or a default CC number.
   */
  _updateLFOs(deltaTime, absoluteTime) {
    for (const lfo of this.lfos) {
      let waveValue;
      if (
        absoluteTime !== null &&
        typeof lfo.updateContinuousTime === "function"
      ) {
        waveValue = lfo.updateContinuousTime(absoluteTime);
      } else {
        waveValue = lfo.update(deltaTime);
      }

      const ccValue = Math.max(0, Math.min(127, Math.floor(waveValue)));
      let ccNum = 74; // fallback CC

      // If LFO targets a param recognized by the deviceDefinition
      if (lfo.targetParam && this.deviceDefinition) {
        const mapped = this.deviceDefinition.getCC(lfo.targetParam);
        if (mapped !== null && mapped !== undefined) {
          ccNum = mapped;
        }
      }

      this.midiBus.controlChange({
        channel: this.midiChannel,
        cc: ccNum,
        value: ccValue,
      });
    }
  }

  /**
   * @private
   * Initializes a note name -> semitone map, used by `_convertNoteNameToMidi()`.
   */
  _initNoteToMidiMap() {
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
   * @private
   * Converts a note name like "C4" or "F#3" to a MIDI note number (0-127).
   * If already a number, returns it directly. Defaults to 60 (C4) if invalid.
   */
  _convertNoteNameToMidi(noteName) {
    if (typeof noteName === "number") {
      return noteName;
    }
    if (typeof noteName !== "string") {
      console.warn(
        "LiveLoop: Unexpected noteName:",
        noteName,
        "- defaulting to 60."
      );
      return 60;
    }

    const match = noteName.match(/^([A-G][b#]?)(\d+)$/i);
    if (!match) {
      console.warn(
        `LiveLoop: Invalid note name: ${noteName}, defaulting to C4 (60).`
      );
      return 60;
    }

    const [_, note, octave] = match;
    const semitone = this._noteToSemitone[note];
    if (semitone === undefined) {
      console.warn(`LiveLoop: Unknown note: ${note}, defaulting to C.`);
      return 60;
    }

    return (parseInt(octave, 10) + 1) * 12 + semitone;
  }
}
