// File: src/patterns/drum-pattern.js
import { BasePattern } from "./base-pattern.js";

/**
 * DrumPattern is a Pattern class that automatically generates "low", "medium",
 * and "high" intensity versions of a specified drum pattern. By default, it
 * uses the "medium" version, but it can adapt to "low" or "high" when
 * orchestrated by an EnergyManager (or via a manual method call).
 *
 * ### Example Usage
 * ```js
 * import { DrumPattern } from "op-xy-live/patterns/drum-pattern.js";
 *
 * // The pattern is an object where each key is a "drum part" (e.g. "kick", "snare"),
 * // and each value is an array of 0/1 indicating hits. Each array should have
 * // 'patternLength' steps. (1 = hit, 0 = no hit)
 * const mediumDrums = {
 *   kick:  [1,0,0,0,1,0,0,0, 1,0,0,0,1,0,0,0],
 *   snare: [0,0,0,1,0,0,0,1, 0,0,0,1,0,0,0,1],
 *   hat:   [1,1,0,1,1,1,0,1, 1,1,0,1,1,1,0,1]
 * };
 *
 * // drumMap optionally translates part names to MIDI note names (or any note naming system).
 * // If not provided, the code will fall back to "C3" for unspecified drums.
 * const drumMap = {
 *   kick: "C2",
 *   snare: "D2",
 *   hat: "F#2"
 * };
 *
 * // Create a DrumPattern that has "low", "medium", and "high" variants
 * // automatically derived from 'mediumDrums'.
 * const drumPattern = new DrumPattern({
 *   mediumPattern: mediumDrums,
 *   drumMap,
 *   patternLength: 16
 * });
 *
 * // In a LiveLoop:
 * const loop = new LiveLoop(midiBus, {
 *   pattern: drumPattern,
 *   context: { energyManager, rhythmManager },
 *   name: "Drums"
 * });
 * ```
 */
export class DrumPattern extends BasePattern {
  /**
   * Creates a new DrumPattern with automatic "low", "medium", and "high" variants
   * derived from a single "medium" pattern. The "medium" pattern is used as the
   * baseline; the "low" variant has fewer hits, and the "high" variant has additional hits.
   *
   * @param {Object} options
   * @param {Record<string, number[]>} options.mediumPattern
   *   An object whose keys are drum part names (e.g. "kick", "snare") and
   *   whose values are arrays of length `patternLength`. Each array element is
   *   either 0 (no hit) or 1 (hit). This serves as the baseline "medium" pattern.
   * @param {Record<string, string>} [options.drumMap={}]
   *   A map from drum part names (e.g. "kick", "snare") to note names (e.g. "C3").
   *   When a hit occurs on a given part, the corresponding note will be used.
   *   Defaults to an empty object, which means unspecified parts fall back to "C3".
   * @param {number} [options.patternLength=16]
   *   The total number of steps in each of the pattern arrays. Must match the length
   *   of the arrays in `mediumPattern`.
   */
  constructor({ mediumPattern, drumMap = {}, patternLength = 16 } = {}) {
    super({
      mediumPattern,
      drumMap,
      patternLength,
    });

    /** @private */
    this.drumMap = drumMap;

    /** @private */
    this.patternLength = patternLength;

    /** @private */
    this.currentHype = "medium"; // The default intensity/hype level

    // Generate "low" & "high" from the provided medium pattern
    const { low, medium, high } = this._inferLowAndHighPatterns(mediumPattern);
    /**
     * @private
     * patterns.low, patterns.medium, patterns.high
     */
    this.patterns = { low, medium, high };
  }

  /**
   * Internal method that creates "low" and "high" intensity patterns by
   * removing or adding hits to the provided "medium" pattern. You can refine
   * this logic if you want a different approach to building these variants.
   *
   * @private
   * @param {Record<string, number[]>} mediumPattern
   *   Baseline pattern keyed by drum part name.
   * @returns {Object} An object containing `low`, `medium`, and `high` variants.
   */
  _inferLowAndHighPatterns(mediumPattern) {
    const lowPattern = {};
    const highPattern = {};

    for (const drumName in mediumPattern) {
      const medArray = mediumPattern[drumName];

      // "Low" pattern tries to keep strong beats (multiple of 4) if originally a hit,
      // and occasionally keeps others.
      const lowArray = medArray.map((val, idx) => {
        // Keep if it's a strong beat & originally a hit
        if (idx % 4 === 0 && val === 1) return 1;
        // Else keep rarely
        if (val === 1 && Math.random() < 0.3) return 1;
        return 0;
      });

      // "High" pattern keeps the medium hits and occasionally adds extras on empty steps.
      const highArray = medArray.map((val, idx) => {
        if (val === 1) return 1;
        // Offbeat expansions
        if (idx % 2 !== 0 && Math.random() < 0.4) return 1;
        return 0;
      });

      lowPattern[drumName] = lowArray;
      highPattern[drumName] = highArray;
    }

    return {
      low: lowPattern,
      medium: mediumPattern,
      high: highPattern,
    };
  }

  /**
   * Called on each step by the LiveLoop. Determines which variant ("low","medium","high")
   * to use based on hype level from `energyManager` or from `context.energyState`.
   * Then returns note objects for any hits on this step. Also, if we see a "kick" drum
   * hit, we set `rhythmManager.setKickOnThisBeat(true)`.
   *
   * @param {number} stepIndex
   * @param {Object} [context]
   *   Typically includes { energyManager, rhythmManager }, or possibly { energyState }.
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   */
  getNotes(stepIndex, context) {
    // 1) Possibly override hype level from energyManager or from context.energyState
    if (context) {
      // if there's an energyManager with getHypeLevel() method, use it
      if (
        context.energyManager &&
        typeof context.energyManager.getHypeLevel === "function"
      ) {
        const managerHype = context.energyManager.getHypeLevel();
        if (["low", "medium", "high"].includes(managerHype)) {
          this.currentHype = managerHype;
        }
      }
      // fallback to older pattern: context.energyState?.hypeLevel
      else if (context.energyState?.hypeLevel) {
        this.currentHype = context.energyState.hypeLevel;
      }
    }

    // 2) Retrieve the correct variant (low, medium, or high)
    const patternSet = this.patterns[this.currentHype] || this.patterns.medium;

    // 3) Within the bar, figure out which step we're on
    const stepInBar = stepIndex % this.patternLength;

    // 4) If we have a rhythmManager, assume no kick this beat by default
    if (context && context.rhythmManager) {
      context.rhythmManager.setKickOnThisBeat(false);
    }

    // 5) Collect hits for this step
    const hits = [];
    for (const drumName in patternSet) {
      const drumArray = patternSet[drumName];
      if (!drumArray || !Array.isArray(drumArray)) continue;

      // If there's a '1' at stepInBar, that means a hit
      if (drumArray[stepInBar] === 1) {
        const note = this.drumMap[drumName] || "C3";
        hits.push({
          note,
          velocity: 100,
          durationSteps: 1,
        });

        // If this part is "kick", set the rhythmManager's kick flag
        if (drumName === "kick" && context && context.rhythmManager) {
          context.rhythmManager.setKickOnThisBeat(true);
        }
      }
    }

    return hits;
  }

  /**
   * Returns the total number of steps in this pattern’s loop. Usually 16.
   * @returns {number}
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Allows manual override of hype level if you’re not using context.energyManager.
   * @param {string} level - "low", "medium", or "high"
   */
  setHypeLevel(level) {
    if (["low", "medium", "high"].includes(level)) {
      this.currentHype = level;
    }
  }
}
