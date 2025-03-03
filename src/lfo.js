/**
 * src/lfo.js
 *
 * A Low-Frequency Oscillator (LFO) generates wave values (sine, triangle, etc.)
 * at a given `frequency` and `amplitude`, optionally offset, and can map the
 * resulting wave to a MIDI CC range (e.g., 0–127).
 *
 * **Typical Usage**:
 * ```js
 * import { LFO } from "op-xy-live";
 *
 * // Create a basic LFO
 * const myLfo = new LFO({
 *   frequency: 1.5,         // cycles per second (if you treat deltaTime as seconds)
 *   amplitude: 1.0,         // wave amplitude
 *   offset: 0.0,            // shifts the output value up/down
 *   shape: "sine",          // wave shape
 *   targetParam: "filterCutoff", // if integrated with a deviceDefinition mapping
 *   minCcValue: 30,         // wave minimum maps to CC=30
 *   maxCcValue: 100,        // wave maximum maps to CC=100
 * });
 *
 * // Each update cycle (for example, each 1/60 second or each audio frame):
 * const deltaTime = 1/60;
 * const value = myLfo.update(deltaTime);
 * // 'value' is now the wave output (already mapped if targetParam is set).
 * ```
 */
export class LFO {
  /**
   * @typedef {Object} LFOOptions
   * @property {number} [frequency=1.0]
   *   The LFO frequency in cycles per unit time. If you're using real-time seconds,
   *   a frequency of `1.0` = one complete cycle per second.
   * @property {number} [amplitude=1.0]
   *   The peak deviation of the wave from zero (before offset). For example,
   *   an amplitude of 1 produces a range of -1..+1 for a sine shape.
   * @property {number} [offset=0.0]
   *   A constant value added to the wave after amplitude is applied.
   *   If `amplitude=1` and `offset=1`, the output range (for a sine) is 0..2.
   * @property {number} [phase=0.0]
   *   The initial phase of the oscillator. If `useRadians = true`, this should be
   *   in radians (0..2π). If `useRadians = false`, then `phase` is a normalized
   *   fraction of one full cycle (0..1).
   * @property {string} [shape="sine"]
   *   The waveform shape: "sine", "triangle", "square", "sawUp", "sawDown", or "random".
   * @property {boolean} [useRadians=true]
   *   Whether the oscillator's phase calculations occur in radians (0..2π) or a
   *   normalized cycle (0..1).
   * @property {string|null} [targetParam=null]
   *   If this LFO is used with a deviceDefinition or LiveLoop that interprets
   *   `targetParam`, the wave can be mapped to a specific CC parameter name, e.g.,
   *   "filterCutoff". If null, the LFO output is purely numeric.
   * @property {number} [minCcValue=0]
   *   When `targetParam` is set, the wave's minimum will map to this CC value.
   * @property {number} [maxCcValue=127]
   *   When `targetParam` is set, the wave's maximum will map to this CC value.
   */

  /**
   * Create an LFO with the specified options.
   *
   * @param {LFOOptions} [options={}]
   *   Configuration for the oscillator, such as frequency and shape.
   */
  constructor({
    frequency = 1.0,
    amplitude = 1.0,
    offset = 0.0,
    phase = 0.0,
    shape = "sine",
    useRadians = true,
    targetParam = null,
    minCcValue = 0,
    maxCcValue = 127,
  } = {}) {
    /** @private */
    this.frequency = frequency;
    /** @private */
    this.amplitude = amplitude;
    /** @private */
    this.offset = offset;
    /** @private */
    this.shape = shape;
    /** @private */
    this.useRadians = useRadians;
    /** @private */
    this.targetParam = targetParam;
    /** @private */
    this.minCcValue = minCcValue;
    /** @private */
    this.maxCcValue = maxCcValue;

    /**
     * @private
     * Current phase of the oscillator.
     * If `useRadians=true`, this is in radians [0..2π).
     * Otherwise, it's normalized to [0..1).
     */
    this.phase = phase;

    /**
     * @private
     * Tracks the previous absolute time (in whatever units) used in
     * `updateContinuousTime()`, so we can compute delta from that.
     */
    this.lastAbsoluteTime = null;
  }

  /**
   * Advance the LFO by a given time increment.
   *
   * **Typically called by your engine or loop** to move the oscillator forward in time.
   *
   * @param {number} deltaTime
   *   The time elapsed since the last LFO update. This could be in seconds (if
   *   frequency is cycles/second) or in beats (if frequency is cycles/beat).
   * @returns {number}
   *   The LFO's current output value, after updating its phase. If `targetParam`
   *   is set, the value may already be mapped into a CC range (e.g. 0..127).
   *
   * @private
   */
  update(deltaTime) {
    if (!deltaTime || deltaTime < 0) {
      // If no or invalid delta, return current wave without advancing
      return this._computeWaveValue(this.phase);
    }

    // Convert frequency * deltaTime into phase increments
    let increment = this.frequency * deltaTime;
    if (this.useRadians) {
      increment *= 2 * Math.PI;
    }

    this.phase += increment;

    // Wrap phase to 0..2π or 0..1
    if (this.useRadians) {
      this.phase %= 2 * Math.PI;
      if (this.phase < 0) this.phase += 2 * Math.PI;
    } else {
      this.phase %= 1.0;
      if (this.phase < 0) this.phase += 1.0;
    }

    return this._computeWaveValue(this.phase);
  }

  /**
   * Update the LFO based on an absolute time, rather than an incremental delta.
   * This is **advanced usage** for scenarios where you want more precise control
   * in a timeline. The phase is derived from the difference between this call's
   * `absoluteTime` and the previous one.
   *
   * @param {number} absoluteTime
   *   The current time in the same units you treat `frequency` with (e.g. seconds).
   * @returns {number}
   *   The updated wave output (same range/logic as `update()`).
   *
   * @private
   */
  updateContinuousTime(absoluteTime) {
    if (absoluteTime == null) {
      // If no time given, just return the current wave without advancing
      return this._computeWaveValue(this.phase);
    }

    // If this is the first call, store time and return current wave
    if (this.lastAbsoluteTime === null) {
      this.lastAbsoluteTime = absoluteTime;
      return this._computeWaveValue(this.phase);
    }

    // Use difference between now and last time for increment
    const deltaTime = absoluteTime - this.lastAbsoluteTime;
    this.lastAbsoluteTime = absoluteTime;

    return this.update(deltaTime);
  }

  /**
   * Reset the oscillator's phase (and clears any memory of absolute time).
   *
   * @param {number} [phase=0]
   *   If `useRadians=true`, a value in [0..2π).
   *   If `useRadians=false`, a value in [0..1).
   */
  reset(phase = 0) {
    this.phase = phase;
    this.lastAbsoluteTime = null;
  }

  /**
   * @private
   * Computes the waveform's raw value for the given phase, applies amplitude and offset,
   * and if `targetParam` is set, maps it into the `minCcValue..maxCcValue` range.
   *
   * @param {number} phase
   * @returns {number} The final wave output, e.g. in -1..+1 or mapped to 0..127.
   */
  _computeWaveValue(phase) {
    let raw = 0;
    const normalizedPhase = this.useRadians ? phase / (2 * Math.PI) : phase;

    switch (this.shape) {
      case "sine":
        raw = Math.sin(this.useRadians ? phase : phase * 2 * Math.PI);
        break;

      case "triangle": {
        // E.g. piecewise linear from -1..1
        const p = normalizedPhase; // 0..1
        raw = 2 * Math.abs(2 * (p - Math.floor(p + 0.5))) - 1;
        break;
      }

      case "square": {
        // -1 or +1
        const p = normalizedPhase;
        raw = p < 0.5 ? 1 : -1;
        break;
      }

      case "sawUp": {
        // -1 to +1 ascending
        raw = 2 * normalizedPhase - 1;
        break;
      }

      case "sawDown": {
        // +1 to -1 descending
        raw = 1 - 2 * normalizedPhase;
        break;
      }

      case "random":
        // Note: re-generates random each time we ask for a value
        raw = Math.random() * 2 - 1; // -1..+1
        break;

      default:
        raw = 0;
        break;
    }

    // Apply amplitude and offset
    let value = raw * this.amplitude + this.offset;

    // If we have a targetParam, map wave [-amp..+amp] into [minCcValue..maxCcValue]
    if (this.targetParam) {
      value =
        this.minCcValue +
        ((value + this.amplitude) * (this.maxCcValue - this.minCcValue)) /
          (2 * this.amplitude);
    }

    return value;
  }

  // --------------------------------------------------------------------------
  // PUBLIC GETTERS/SETTERS (for dynamic changes to LFO parameters in real time)
  // --------------------------------------------------------------------------

  /**
   * @param {number} freq - New LFO frequency (cycles per time unit).
   * @private
   */
  setFrequency(freq) {
    this.frequency = freq;
  }

  /**
   * @returns {number} The current LFO frequency.
   * @private
   */
  getFrequency() {
    return this.frequency;
  }

  /**
   * @param {number} amp - New LFO amplitude.
   * @private
   */
  setAmplitude(amp) {
    this.amplitude = amp;
  }

  /**
   * @returns {number} The current LFO amplitude.
   * @private
   */
  getAmplitude() {
    return this.amplitude;
  }

  /**
   * @param {number} off - New DC offset for the LFO wave.
   * @private
   */
  setOffset(off) {
    this.offset = off;
  }

  /**
   * @returns {number} The current LFO offset.
   * @private
   */
  getOffset() {
    return this.offset;
  }

  /**
   * @param {string} shape - New wave shape ("sine", "triangle", "square", etc.).
   * @private
   */
  setShape(shape) {
    this.shape = shape;
  }

  /**
   * @returns {string} The current wave shape.
   * @private
   */
  getShape() {
    return this.shape;
  }

  /**
   * @param {number} p - New phase (useRadians ? 0..2π : 0..1).
   * @private
   */
  setPhase(p) {
    this.phase = p;
  }

  /**
   * @returns {number} The current oscillator phase.
   * @private
   */
  getPhase() {
    return this.phase;
  }

  /**
   * @param {boolean} bool - True if phase calculations are in radians, false if normalized 0..1.
   * @private
   */
  setUseRadians(bool) {
    this.useRadians = bool;
  }

  /**
   * @returns {boolean} Whether the LFO uses radians for phase.
   * @private
   */
  getUseRadians() {
    return this.useRadians;
  }

  /**
   * @param {string|null} param - If set, wave output maps to CC range for that param name.
   * @private
   */
  setTargetParam(param) {
    this.targetParam = param;
  }

  /**
   * @returns {string|null} The parameter targeted by this LFO.
   * @private
   */
  getTargetParam() {
    return this.targetParam;
  }

  /**
   * @param {number} value - New minimum CC value for wave's lower bound.
   * @private
   */
  setMinCcValue(value) {
    this.minCcValue = value;
  }

  /**
   * @returns {number} The min CC value used when targetParam is set.
   * @private
   */
  getMinCcValue() {
    return this.minCcValue;
  }

  /**
   * @param {number} value - New maximum CC value for wave's upper bound.
   * @private
   */
  setMaxCcValue(value) {
    this.maxCcValue = value;
  }

  /**
   * @returns {number} The max CC value used when targetParam is set.
   * @private
   */
  getMaxCcValue() {
    return this.maxCcValue;
  }
}
