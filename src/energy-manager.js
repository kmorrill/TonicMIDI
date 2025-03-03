/**
 * src/energy-manager.js
 *
 * The EnergyManager is an optional high-level orchestrator that adjusts
 * LiveLoops in real-time to reflect changes in "energy," such as hype or tension.
 * It does not handle transport or MIDI directly—only manipulates loops' patterns,
 * LFO parameters, muting/unmuting, etc.
 *
 * ### Example Usage
 * ```js
 * import { EnergyManager } from "op-xy-live";
 *
 * // Hypothetical loops:
 * //   drumLoop, bassLoop, melodyLoop
 * // These loops might have methods like setPattern, setMuted, etc.
 *
 * // Optional chord and rhythm managers:
 * //   chordManager (for harmonic context),
 * //   rhythmManager (for subdivisions & accent patterns),
 * //   OR a globalContext holding both.
 *
 * const manager = new EnergyManager({
 *   liveLoops: [drumLoop, bassLoop, melodyLoop],
 *   chordManager,
 *   rhythmManager
 * });
 *
 * // Increase activity across loops ("full"), e.g. unmute, busier patterns
 * manager.setHypeLevel("full");
 *
 * // Increase harmonic dissonance or remove root in bass for tension
 * manager.setTensionLevel("high");
 * ```
 */
export class EnergyManager {
  /**
   * Constructs a new EnergyManager to control LiveLoops' "energy" and "tension" states.
   * You can provide references to a chord manager, rhythm manager, or global context
   * in order to propagate changes automatically (e.g., changing chords or subdivisions).
   *
   * @param {object} options
   * @param {Array}  [options.liveLoops=[]]
   *   Array of LiveLoops that this manager will orchestrate (e.g. drumLoop, bassLoop).
   * @param {object} [options.chordManager=null]
   *   A ChordManager for harmonic updates (e.g. tension = "high" -> more dissonant chords).
   * @param {object} [options.rhythmManager=null]
   *   A RhythmManager for subdividing beats (e.g. hype = "full" -> double-time).
   * @param {object} [options.globalContext=null]
   *   An optional GlobalContext reference that may hold both chordManager and rhythmManager.
   */
  constructor({
    liveLoops = [],
    chordManager = null,
    rhythmManager = null,
    globalContext = null,
  } = {}) {
    /**
     * The LiveLoops that this manager orchestrates.
     * @type {Array}
     */
    this.liveLoops = liveLoops;

    /**
     * The last-known hype level set by setHypeLevel.
     * @type {string|null}
     * @private
     */
    this.currentHypeLevel = null;

    /**
     * The last-known tension level set by setTensionLevel.
     * @type {string|null}
     * @private
     */
    this.currentTensionLevel = null;

    /**
     * A ChordManager for harmonic manipulations, if provided.
     * @type {object|null}
     * @private
     */
    this.chordManager = chordManager;

    /**
     * A RhythmManager for subdivision manipulations, if provided.
     * @type {object|null}
     * @private
     */
    this.rhythmManager = rhythmManager;

    /**
     * An optional GlobalContext that can unify chord and rhythm managers.
     * @type {object|null}
     * @private
     */
    this.globalContext = globalContext;
  }

  /**
   * Sets the "hype" level (e.g., "low", "medium", "full") across all managed LiveLoops.
   * Use this to dynamically scale the energy or busyness of your arrangement.
   *
   * Common behaviors might include:
   * - "low": Mute certain parts or use simpler patterns
   * - "medium": Partially active patterns
   * - "full": Unmute everything, busier rhythms, stronger LFOs, etc.
   *
   * If a globalContext or rhythmManager was provided, this method can also
   * adjust subdivisions accordingly (e.g. halfTime, normal, doubleTime).
   *
   * @param {string} level
   *   A label for the desired energy state (e.g. "low", "medium", "full").
   */
  setHypeLevel(level) {
    this.currentHypeLevel = level;
    console.log(`EnergyManager: Setting hype level to "${level}"`);

    // If we have a global context, update it
    if (this.globalContext) {
      this.globalContext.setHypeLevel(level);
    }
    // Otherwise, if we have a local RhythmManager, adjust subdivisions
    else if (this.rhythmManager) {
      switch (level) {
        case "full":
          this.rhythmManager.setSubdivision("doubleTime");
          break;
        case "medium":
          this.rhythmManager.setSubdivision("normal");
          break;
        case "low":
          this.rhythmManager.setSubdivision("halfTime");
          break;
      }
    }

    // Example pattern logic. You can customize for your own loops & patterns.
    switch (level) {
      case "full": {
        // e.g. unmute all loops, pick busier patterns, intensify LFO
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Drums") {
            loop.setMuted(false);
            // loop.setPattern(fullBusyDrumPattern, true);
          }
          if (loop.lfos && loop.lfos[0]) {
            loop.lfos[0].setFrequency(2.0);
            loop.lfos[0].setAmplitude(1.0);
          }
        });
        break;
      }

      case "medium": {
        // A moderate setting
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Pad") {
            loop.setMuted(false);
            // loop.setPattern(mediumPadPattern);
          }
        });
        break;
      }

      case "low": {
        // Simplify or mute less-critical parts
        this.liveLoops.forEach((loop) => {
          if (loop.name !== "Bass") {
            loop.setMuted(true);
          }
          // loop.setPattern(sparsePattern, false);
        });
        break;
      }

      default:
        console.warn(
          `EnergyManager: Unknown hype level "${level}". No changes made.`
        );
        break;
    }
  }

  /**
   * Sets the "tension" level (e.g. "none", "low", "mid", "high") across
   * all managed LiveLoops and optionally updates chord voicings or
   * omits fundamental notes for dissonance.
   *
   * Examples:
   * - "none": Very stable, e.g. close-voiced triads
   * - "low": Slight added color tones
   * - "mid": 7ths or 9ths for moderate tension
   * - "high": Dissonant intervals, omitted fundamentals, etc.
   *
   * @param {string} level
   *   The desired tension level ("none", "low", "mid", "high").
   */
  setTensionLevel(level) {
    this.currentTensionLevel = level;

    if (this.globalContext) {
      this.globalContext.setTensionLevel(level);
    } else if (this.chordManager) {
      this.chordManager.setTensionLevel(level);
    }

    // Example direct loop manipulations:
    switch (level) {
      case "high": {
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Chord") {
            if (
              loop.pattern &&
              typeof loop.pattern.setVoicingType === "function"
            ) {
              loop.pattern.setVoicingType("open");
            }
          }
          if (loop.name === "Bass") {
            loop.setTranspose(7);
          }
        });
        break;
      }

      case "mid": {
        this.liveLoops.forEach((loop) => {
          if (
            loop.pattern &&
            typeof loop.pattern.setVoicingType === "function"
          ) {
            loop.pattern.setVoicingType("close");
          }
          if (loop.name === "Bass") {
            loop.setTranspose(0);
          }
        });
        break;
      }

      case "low": {
        this.liveLoops.forEach((loop) => {
          if (
            loop.pattern &&
            typeof loop.pattern.setVoicingType === "function"
          ) {
            loop.pattern.setVoicingType("close");
          }
        });
        break;
      }

      case "none": {
        this.liveLoops.forEach((loop) => {
          if (
            loop.pattern &&
            typeof loop.pattern.setVoicingType === "function"
          ) {
            loop.pattern.setVoicingType("close");
          }
          if (loop.name === "Bass") {
            loop.setTranspose(0);
          }
        });
        break;
      }

      default:
        console.warn(
          `EnergyManager: Unknown tension level "${level}". No changes made.`
        );
        break;
    }
  }

  /**
   * Adds a LiveLoop instance so that it can be controlled by this EnergyManager.
   * Useful if new loops are created or loaded dynamically.
   *
   * @param {object} loop
   *   The LiveLoop instance to add.
   */
  addLiveLoop(loop) {
    this.liveLoops.push(loop);
  }

  /**
   * Removes a previously added LiveLoop from EnergyManager control.
   *
   * @param {object} loop
   *   The LiveLoop instance to remove.
   */
  removeLiveLoop(loop) {
    this.liveLoops = this.liveLoops.filter((l) => l !== loop);
  }

  /**
   * Sets a broad "arrangement style" that can be used to make coarse changes
   * to LiveLoops. This might force wide chord voicings, bigger reverb sends,
   * or drastically different patterns. The exact implementation is up to you.
   *
   * @param {string} style
   *   A label for the arrangement style (e.g. "wide", "minimal", etc.).
   */
  setArrangementStyle(style) {
    console.log(`EnergyManager: Setting arrangement style to "${style}"`);

    switch (style) {
      case "wide":
        this.liveLoops.forEach((loop) => {
          if (
            loop.pattern &&
            typeof loop.pattern.setVoicingType === "function"
          ) {
            loop.pattern.setVoicingType("spread");
          }
        });
        break;

      case "minimal":
        this.liveLoops.forEach((loop) => {
          if (
            loop.pattern &&
            typeof loop.pattern.setVoicingType === "function"
          ) {
            loop.pattern.setVoicingType("close");
          }
        });
        break;

      default:
        console.warn(`Unknown arrangement style: ${style}`);
        break;
    }
  }

  /**
   * Updates the ChordManager (either directly or via globalContext) to set
   * a new chord progression. Any loops that depend on chordManager data
   * should adapt automatically on their next cycle.
   *
   * @param {Array} progression
   *   An array of chord objects (e.g. [{ root: "C", type: "maj7" }, ...]).
   */
  setChordProgression(progression) {
    if (this.globalContext && this.globalContext.chordManager) {
      this.globalContext.chordManager.setProgression(progression);
    } else if (this.chordManager) {
      this.chordManager.setProgression(progression);
    } else {
      console.warn(
        "EnergyManager: No ChordManager available to set progression"
      );
    }
  }
}
