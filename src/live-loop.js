// File: src/live-loop.js
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
 *
 * // 7) Chaining Mode Example:
 * //    Provide 'cycles' to the constructor, then chain more sub-loops.
 * const chainLoop = new LiveLoop(midiBus, {
 *   pattern: patternA,
 *   midiChannel: 1,
 *   name: "ChainedMelody",
 *   cycles: 2   // how many times patternA should repeat
 * })
 * .chainLiveLoop({ pattern: patternB, cycles: 4 })
 * .chainLiveLoop({ pattern: patternC, cycles: 1 })
 * .onChainComplete(() => {
 *   console.log("All chained patterns completed!");
 * });
 * ```
 */

export class LiveLoop {
  /**
   * @typedef {Object} LiveLoopOptions
   * @property {object} pattern
   *   A pattern implementing `getNotes(stepIndex, context)` and `getLength()`.
   *   The pattern decides which notes to play at each step.
   * @property {object[]} [lfos=[]]
   *   An array of LFO instances for parameter modulation.
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
   * @property {number} [cycles=null]
   *   (Optional) If provided, enables "chain mode." This loop's pattern
   *   will repeat for `cycles` times, then end or switch to a chained pattern.
   * @property {string} [role=null]
   *   The role of the pattern. Valid roles could be:
   *   "chordProvider" for the pattern that sets the chord
   *   "kickProvider" for the pattern that sets the kick
   *   null (or some other string) for all other patterns
   */

  /**
   * Constructs a new LiveLoop. Once created, it listens for "tick" calls from
   * a TransportManager. Each tick, it retrieves notes from its pattern,
   * sends `noteOn` events, schedules `noteOff` (based on note durations),
   * and updates LFOs to send `controlChange` events as needed.
   *
   * **Chaining Mode**:
   * If you specify the `cycles` option, this LiveLoop enters "chain mode."
   * That means the current `pattern` will play for the given number of `cycles`
   * (each cycle = one full pass of `pattern.getLength()` steps), and then it
   * can automatically proceed to additional sub-loops you define with
   * `.chainLiveLoop()`. Once all chained items finish, the loop calls
   * `onChainComplete()` if defined, and then mutes itself.
   *
   * ### Basic constructor example (non-chained):
   * ```js
   * const loop = new LiveLoop(midiBus, { pattern: myPattern, midiChannel: 1 });
   * ```
   *
   * ### Chaining example:
   * ```js
   * const loop = new LiveLoop(midiBus, {
   *   pattern: patA,
   *   cycles: 2  // patA repeats 2 times
   * })
   *   .chainLiveLoop({ pattern: patB, cycles: 4 })
   *   .chainLiveLoop({ pattern: patC, cycles: 1 })
   *   .onChainComplete(() => console.log("All done"));
   * ```
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

      // Chain mode
      cycles = null,
      role = null,
    } = {}
  ) {
    /** @private */
    this.midiBus = midiBus;

    /** @type {object} */
    this.pattern = pattern;

    /** @type {object[]} */
    this.lfos = lfos;

    /** @type {number} */
    this.midiChannel = midiChannel;

    /** @type {object} */
    this.context = context;

    /** @type {object|null} */
    this.globalContext = globalContext;

    /** @type {string} */
    this.name = name;

    /** @type {boolean} */
    this.muted = muted;

    /** @type {number} */
    this.transpose = transpose;

    /** @type {string|null} */
    this.role = role;

    /** @private */
    this.changeQueue = [];

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

    /** @private */
    this.activeNotes = [];

    // Build noteName->MIDI map
    this._initNoteToMidiMap();

    // ----------------------------------------------------------------------
    // Chaining-related fields:
    /** @private */
    this._chainItems = [];
    /** @private */
    this._currentChainIndex = -1;
    /** @private */
    this._cyclesSoFar = 0;
    /** @private */
    this._onChainComplete = null;

    if (typeof cycles === "number" && cycles > 0) {
      this._chainItems.push({
        pattern: this.pattern,
        cycles,
        midiChannel: this.midiChannel,
        role,
      });
      this._currentChainIndex = 0;
    }

    // ----------------------------------------------------------------------
    // Approximate pitch tracking
    // We'll accumulate MIDI note values and count how many notes we've triggered
    /** @private */
    this._pitchAccumulator = 0;
    /** @private */
    this._pitchCount = 0;
  }

  // ----------------------------------------------------------------------
  // New Feature #1: device getter
  // ----------------------------------------------------------------------
  /**
   * Returns the device instance (from deviceManager) if we have a valid midiOutputId.
   * @returns {import('./device-definition.js').DeviceDefinition|null}
   */
  get device() {
    if (!this.deviceManager || !this.midiOutputId) {
      return null;
    }
    return this.deviceManager.getDeviceForOutput(this.midiOutputId);
  }

  // ----------------------------------------------------------------------
  // New Feature #2: setParam
  // ----------------------------------------------------------------------
  /**
   * Sends a CC for the given paramName if the device supports it.
   * @param {string} paramName
   * @param {number} value - 0..127
   */
  setParam(paramName, value) {
    const dev = this.device; // from the new getter
    if (!dev) return;

    const ccNum = dev.getCC(paramName);
    if (ccNum !== null) {
      this.midiBus.controlChange({
        channel: this.midiChannel,
        cc: ccNum,
        value,
      });
    }
  }

  // ----------------------------------------------------------------------
  // New Feature #3: getPatternName
  // ----------------------------------------------------------------------
  /**
   * Returns either the pattern.options.name (if defined) or the pattern's constructor name.
   * @returns {string}
   */
  getPatternName() {
    if (!this.pattern) return "No Pattern";
    if (this.pattern.options && this.pattern.options.name) {
      return this.pattern.options.name;
    }
    return this.pattern.constructor.name;
  }

  // ----------------------------------------------------------------------
  // New Feature #4: Approximate Pitch Tracking
  // ----------------------------------------------------------------------
  /**
   * Returns the average MIDI note of all noteOn events triggered so far.
   * If none have been triggered, returns null.
   * @returns {number|null}
   */
  getApproximatePitch() {
    if (this._pitchCount === 0) return null;
    return this._pitchAccumulator / this._pitchCount;
  }

  // ----------------------------------------------------------------------
  // Chaining API Methods
  // ----------------------------------------------------------------------
  /**
   * chainLiveLoop(params) - Add another sub-loop to the chain.
   *
   * Use this to chain multiple patterns one after another, each repeating
   * for its specified `cycles` count. For example:
   *
   * ```js
   * const chainLoop = new LiveLoop(midiBus, { pattern: patA, cycles: 2 })
   *   .chainLiveLoop({ pattern: patB, cycles: 4 })
   *   .chainLiveLoop({ pattern: patC, cycles: 8 })
   *   .onChainComplete(() => console.log("All done"));
   * ```
   *
   * @param {object} params
   * @param {object} params.pattern  The pattern for this chained segment
   * @param {number} [params.cycles=1] How many times to repeat the pattern
   * @param {number} [params.midiChannel] Optional override of MIDI channel
   * @param {string} [params.role=null] The role of the pattern
   * @returns {LiveLoop} this
   */
  chainLiveLoop(params = {}) {
    // If we haven't started chain mode yet (i.e. no cycles in constructor),
    // create an initial chain item from the current pattern:
    if (this._chainItems.length === 0) {
      this._chainItems.push({
        pattern: this.pattern,
        cycles: 1,
        midiChannel: this.midiChannel,
        role: null,
      });
      this._currentChainIndex = 0;
      this._cyclesSoFar = 0;
    }

    this._chainItems.push({
      pattern: params.pattern,
      cycles: typeof params.cycles === "number" ? params.cycles : 1,
      midiChannel: params.midiChannel ?? this.midiChannel,
      role: params.role,
    });
    return this;
  }

  /**
   * onChainComplete(callback) - Called once the final chain item finishes.
   * If no chain is used, this never fires.
   *
   * Example:
   * ```js
   * new LiveLoop(midiBus, { pattern: patA, cycles: 2 })
   *   .chainLiveLoop({ pattern: patB, cycles: 4 })
   *   .onChainComplete(() => {
   *     console.log("All patterns in the chain have finished!");
   *   });
   * ```
   *
   * @param {function} callback - A function to run when the chain is fully complete
   * @returns {LiveLoop} this
   */
  onChainComplete(callback) {
    this._onChainComplete = callback;
    return this;
  }

  // ----------------------------------------------------------------------
  // Core Playback & Tick
  // ----------------------------------------------------------------------
  /**
   * Advances the loop by one step:
   *   1) Applies queued changes if at pattern boundary
   *   2) Gets notes from the pattern
   *   3) Sends noteOn (unless muted) and schedules noteOff
   *   4) Checks for notes that need noteOff
   *   5) Updates LFOs
   *   6) If in chain mode, checks if we finished a pattern cycle
   *
   * Normally called by TransportManager once per "step."
   *
   * @param {number} stepIndex - which step in the bar or pattern
   * @param {number} deltaTime - time since last step (beats)
   * @param {number} [absoluteTime=null] - optional total time (beats)
   *
   * @private
   */
  tick(stepIndex, deltaTime, absoluteTime = null) {
    // 1) Possibly apply queued changes at pattern boundary
    this._applyQueuedChangesIfNeeded(stepIndex);

    // 2) Merge contexts
    const effectiveContext = this._getEffectiveContext(stepIndex);

    // 3) Get new notes from pattern
    const notes = this.pattern
      ? this.pattern.getNotes(stepIndex, effectiveContext)
      : [];

    // 4) Start new notes (noteOn)
    if (notes && notes.length) {
      for (const noteObj of notes) {
        let midiNote = this._convertNoteNameToMidi(noteObj.note);
        midiNote += this.transpose; // semitone shift
        midiNote = Math.max(0, Math.min(127, midiNote)); // clamp

        const duration = noteObj.durationSteps ?? 1;
        const endStep = stepIndex + duration;
        const velocity = noteObj.velocity ?? 100;

        // If a note is re-triggered, noteOff the old one first
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

        // Store in activeNotes
        this.activeNotes.push({
          note: midiNote,
          velocity,
          endStep,
          channel: this.midiChannel,
        });

        // 5) Update pitch tracking
        this._pitchAccumulator += midiNote;
        this._pitchCount += 1;
      }
    }

    // 6) Turn off notes that ended
    const stillActive = [];
    for (const noteObj of this.activeNotes) {
      if (stepIndex >= noteObj.endStep) {
        this.midiBus.noteOff({ channel: noteObj.channel, note: noteObj.note });
      } else {
        stillActive.push(noteObj);
      }
    }
    this.activeNotes = stillActive;

    // 7) Update LFOs
    this._updateLFOs(deltaTime, absoluteTime);

    // 8) If in chain mode, check if we just finished a pattern cycle
    if (this._chainItems.length > 0 && this._currentChainIndex >= 0) {
      const currentItem = this._chainItems[this._currentChainIndex];
      const length =
        currentItem.pattern.getLength && currentItem.pattern.getLength();
      if (length && stepIndex === length - 1) {
        // We completed one cycle of the current pattern
        this._cyclesSoFar++;
        if (this._cyclesSoFar >= currentItem.cycles) {
          this._moveToNextChainItem();
        }
      }
    }
  }

  /**
   * If called at a higher resolution (e.g. every audio callback),
   * updates LFOs alone. Optional feature for smoother parameter automation.
   *
   * @param {number} deltaTime - time in beats since last call
   * @param {number} [absoluteTime=null]
   */
  updateLFOsOnly(deltaTime, absoluteTime = null) {
    this._updateLFOs(deltaTime, absoluteTime);
  }

  // ----------------------------------------------------------------------
  // Chaining Internals
  // ----------------------------------------------------------------------
  /**
   * Moves from the current chain item to the next. If there is no next,
   * calls onChainComplete() and mutes the loop.
   * @private
   */
  _moveToNextChainItem() {
    this._currentChainIndex++;
    this._cyclesSoFar = 0;

    if (this._currentChainIndex >= this._chainItems.length) {
      // done
      if (this._onChainComplete) {
        this._onChainComplete();
      }
      this.setMuted(true);
      return;
    }

    const nextItem = this._chainItems[this._currentChainIndex];
    this.pattern = nextItem.pattern;
    this.midiChannel = nextItem.midiChannel;
  }

  // ----------------------------------------------------------------------
  // Standard Methods
  // ----------------------------------------------------------------------
  /**
   * Immediately replaces the current pattern or queues the change to occur
   * at the next pattern boundary (start of pattern).
   * @param {object} newPattern
   * @param {boolean} [immediate=false]
   */
  setPattern(newPattern, immediate = false) {
    if (immediate) {
      this.pattern = newPattern;
    } else {
      this.changeQueue.push({ type: "setPattern", pattern: newPattern });
    }
  }

  /**
   * Add an LFO immediately.
   * @param {object} lfo
   */
  addLFO(lfo) {
    this.lfos.push(lfo);
  }

  /**
   * Update properties of an existing LFO (immediately or queued).
   * @param {number} index
   * @param {object} newProps
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
   * Sets or updates the local context. The pattern receives this context each
   * step in `getNotes(stepIndex, context)`.
   * @param {object} context
   * @param {boolean} [immediate=true]
   */
  setContext(context, immediate = true) {
    if (immediate) {
      this.context = context;
    } else {
      this.changeQueue.push({ type: "setContext", context });
    }
  }

  /**
   * Sets or updates the global context reference.
   * @param {object} globalContext
   */
  setGlobalContext(globalContext) {
    this.globalContext = globalContext;
  }

  /**
   * Mutes or unmutes the loop.
   * @param {boolean} bool
   */
  setMuted(bool) {
    this.muted = bool;
  }

  /**
   * Sets semitone transposition.
   * @param {number} semitones
   */
  setTranspose(semitones) {
    this.transpose = semitones;
  }

  /**
   * Assign a descriptive name.
   * @param {string} name
   */
  setName(name) {
    this.name = name;
  }

  // ----------------------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------------------
  /**
   * Applies queued changes if at the start of a pattern cycle
   * @private
   */
  _applyQueuedChangesIfNeeded(stepIndex) {
    if (!this.changeQueue.length) return;
    let length;

    if (this._chainItems.length > 0 && this._currentChainIndex >= 0) {
      const currentItem = this._chainItems[this._currentChainIndex];
      length = currentItem.pattern.getLength();
    } else {
      length = this.pattern?.getLength?.();
    }

    if (!length || length <= 0) return;

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
   * Merges local + global context for pattern usage
   * @private
   * @param {number} stepIndex
   * @returns {object}
   */
  _getEffectiveContext(stepIndex) {
    const effectiveContext = { ...this.context };
    if (this.globalContext) {
      if (this.globalContext.chordManager) {
        effectiveContext.chordManager = this.globalContext.chordManager;
      }
      if (this.globalContext.rhythmManager) {
        effectiveContext.rhythmManager = this.globalContext.rhythmManager;
      }
      if (this.globalContext.getEnergyState) {
        effectiveContext.energyState = this.globalContext.getEnergyState();
      }
    }

    // Also directly add deviceDefinition for convenience
    // (provided we have deviceManager + midiOutputId or a direct deviceDefinition)
    if (this.deviceDefinition) {
      effectiveContext.deviceDefinition = this.deviceDefinition;
    }

    return effectiveContext;
  }

  /**
   * Perform LFO updates, sending CC messages if deviceDefinition is available.
   * @private
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
      let ccNum = 74; // fallback CC if no deviceDefinition

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
   * Build a note name -> semitone map
   * @private
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
   * Convert a note name (e.g. "C4") or numeric note to MIDI number (0..127).
   * @private
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
    const [, note, octave] = match;
    const semitone = this._noteToSemitone[note];
    if (semitone === undefined) {
      console.warn(`LiveLoop: Unknown note: ${note}, defaulting to C.`);
      return 60;
    }
    return (parseInt(octave, 10) + 1) * 12 + semitone;
  }
}
