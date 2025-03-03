import { AbstractPattern } from "./pattern-interface.js";

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
 * ```
 */
export class DrumPattern extends AbstractPattern {
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
    super();

    /** @private */
    this.drumMap = drumMap;

    /** @private */
    this.patternLength = patternLength;

    /** @private */
    this.currentHype = "medium"; // The default "energy" or "intensity" level

    // Generate "low" & "high" from the provided medium pattern
    const { low, medium, high } = this._inferLowAndHighPatterns(mediumPattern);
    /** @private */
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

      // "Low" pattern tries to keep strong beats and occasionally keeps others.
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
   * **Pattern Interface Method (public)**
   * Called on each step to retrieve an array of note objects (if any) that
   * should be played at this step. Typically, the LiveLoop calls this on your
   * behalf—most users won't call this manually.
   *
   * If `context.energyState?.hypeLevel` is provided, that overrides the internal
   * `currentHype` to switch between "low", "medium", or "high" variants. Otherwise,
   * `currentHype` stays what it was previously.
   *
   * @param {number} stepIndex
   *   The current step index (0-based), as provided by a LiveLoop or TransportManager.
   * @param {Object} [context]
   *   A context object that might include `energyState`, e.g. `{ hypeLevel: "high" }`.
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   *   An array of note objects. Each note object includes `note` (e.g. "C3"),
   *   `velocity` (constant 100 here), and `durationSteps` (always 1 for a single-step hit).
   *
   * @private
   */
  getNotes(stepIndex, context) {
    // Optionally override hype level from context
    if (context && context.energyState?.hypeLevel) {
      this.currentHype = context.energyState.hypeLevel;
    }

    const patternSet = this.patterns[this.currentHype];
    if (!patternSet) return [];

    const stepInBar = stepIndex % this.patternLength;
    const hits = [];

    for (const drumName in patternSet) {
      const drumArray = patternSet[drumName];
      if (!drumArray || !Array.isArray(drumArray)) continue;

      // If we have a '1' at the current step, it's a hit.
      if (drumArray[stepInBar] === 1) {
        const note = this.drumMap[drumName] || "C3";
        hits.push({
          note,
          velocity: 100,
          durationSteps: 1,
        });
      }
    }

    return hits;
  }

  /**
   * **Pattern Interface Method (public)**
   * Returns the total number of steps this pattern spans before repeating.
   *
   * @returns {number}
   *   The pattern length. Defaults to 16 if none was specified.
   *
   * @private
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Manually override the hype level for this drum pattern. Typically, you won't
   * call this directly. An EnergyManager can automatically adjust the pattern's
   * hype level by including `hypeLevel` in the context (see `getNotes` above).
   *
   * @private
   * @param {string} level - "low", "medium", or "high"
   */
  setHypeLevel(level) {
    if (["low", "medium", "high"].includes(level)) {
      this.currentHype = level;
    }
  }
}
