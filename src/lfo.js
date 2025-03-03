/**
 * src/lfo.js
 *
 * A Low-Frequency Oscillator (LFO) domain object.
 * It generates a wave value (e.g., sine, triangle) over time, based on frequency, amplitude, etc.
 * Additionally, it targets a specific parameter for modulation.
 *
 * Usage:
 *   const lfo = new LFO({ frequency: 1, shape: 'sine', amplitude: 1, offset: 0, phase: 0, targetParam: 'filterCutoff', minCcValue: 30, maxCcValue: 100 });
 *   // Called each "tick" (deltaTime might be in beats or seconds, your choice).
 *   const value = lfo.update(deltaTime);
 *   // Or use absolute time for more accurate high-resolution updates:
 *   const value = lfo.updateContinuousTime(absoluteTimeInBeats);
 *   // value is typically in the range [-amplitude..+amplitude], shifted by offset, and mapped to a CC value range.
 */

export class LFO {
  /**
   * @typedef LFOOptions
   * @property {number} [frequency=1.0] - The frequency of oscillation (in cycles per unit time).
   * @property {number} [amplitude=1.0] - Peak deviation from the midpoint.
   * @property {number} [offset=0.0]    - A baseline offset added to the wave.
   * @property {number} [phase=0.0]     - Initial phase, in radians (if useRadians=true) or 0..1 if useRadians=false.
   * @property {string} [shape='sine']  - Wave shape: 'sine', 'triangle', 'square', 'sawUp', 'sawDown', 'random'.
   * @property {boolean} [useRadians=true] - Whether to compute wave cycles in radians or as normalized [0..1].
   * @property {string} [targetParam=null] - The parameter to target for modulation.
   * @property {number} [minCcValue=0] - Optional: map wave minimum to this CC value.
   * @property {number} [maxCcValue=127] - Optional: map wave maximum to this CC value.
   */

  /**
   * @param {LFOOptions} options
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
    /** @type {number} */
    this.frequency = frequency;
    /** @type {number} */
    this.amplitude = amplitude;
    /** @type {number} */
    this.offset = offset;
    /** @type {string} */
    this.shape = shape;
    /** @type {boolean} */
    this.useRadians = useRadians;
    /** @type {string} */
    this.targetParam = targetParam;
    /** @type {number} */
    this.minCcValue = minCcValue;
    /** @type {number} */
    this.maxCcValue = maxCcValue;

    /**
     * Tracks the current phase of the oscillator.
     * If useRadians = true, this is in radians [0..2π).
     * If useRadians = false, it's a normalized cycle [0..1).
     */
    this.phase = phase;

    /**
     * Tracks the last absolute time value used in updateContinuousTime
     * Only used when tracking absolute time rather than delta time
     */
    this.lastAbsoluteTime = null;
  }

  /**
   * Update the LFO with a given time increment, returning the current wave value.
   * @param {number} deltaTime - The elapsed time since last update.
   *   Could be in seconds (if frequency is in Hz) or in beats (if frequency is cycles/beat).
   * @returns {number} - The LFO output, typically in the range [-amplitude..+amplitude] + offset, mapped to a CC value range.
   */
  update(deltaTime) {
    if (!deltaTime || deltaTime < 0) {
      // If no time elapsed or invalid input, return current value without advancing
      return this._computeWaveValue(this.phase);
    }

    // Increment phase
    // If frequency=1 & deltaTime=0.25 => 0.25 cycles
    // If useRadians, multiply by 2π for a full cycle.
    let increment = this.frequency * deltaTime;
    if (this.useRadians) {
      increment *= 2 * Math.PI; // convert cycles -> radians
    }

    this.phase += increment;

    // Wrap phase
    if (this.useRadians) {
      // keep phase in [0..2π)
      this.phase %= 2 * Math.PI;
      if (this.phase < 0) {
        this.phase += 2 * Math.PI;
      }
    } else {
      // keep phase in [0..1)
      this.phase %= 1.0;
      if (this.phase < 0) {
        this.phase += 1.0;
      }
    }

    return this._computeWaveValue(this.phase);
  }

  /**
   * Update the LFO using absolute time value, for more accurate high-resolution updates.
   * The phase is set based on the absolute time rather than incrementally.
   *
   * @param {number} absoluteTime - The absolute time in beats or seconds
   * @returns {number} - The LFO output, typically in the range [-amplitude..+amplitude] + offset, mapped to a CC value range
   */
  updateContinuousTime(absoluteTime) {
    if (absoluteTime === undefined || absoluteTime === null) {
      return this._computeWaveValue(this.phase);
    }

    // If this is the first call, treat it as a reset point
    if (this.lastAbsoluteTime === null) {
      this.lastAbsoluteTime = absoluteTime;
      return this._computeWaveValue(this.phase);
    }

    // Calculate the delta time between the current and last absolute time
    const deltaTime = absoluteTime - this.lastAbsoluteTime;

    // Store the current time for the next call
    this.lastAbsoluteTime = absoluteTime;

    // Use the regular update with the calculated delta
    return this.update(deltaTime);
  }

  /**
   * Helper function to compute the wave value for the current phase
   * based on the selected shape, and map it to a CC value range if targetParam is set.
   * @param {number} phase
   * @returns {number}
   */
  _computeWaveValue(phase) {
    let raw = 0;

    switch (this.shape) {
      case "sine":
        // if useRadians, phase is in [0..2π)
        // if not, phase is in [0..1), multiply by 2π
        raw = Math.sin(this.useRadians ? phase : phase * 2 * Math.PI);
        break;

      case "triangle":
        // Triangle wave: range -1..1
        // Method: scaled arcsin(sin(x)) or a piecewise linear approach
        {
          const p = this.useRadians ? phase / (2 * Math.PI) : phase; // normalize to [0..1)
          raw = 2 * Math.abs(2 * (p - Math.floor(p + 0.5))) - 1;
        }
        break;

      case "square":
        // Square wave: either -1 or +1
        // Phase < π => +1, else -1 (if useRadians)
        {
          const p = this.useRadians ? phase / (2 * Math.PI) : phase; // normalize
          raw = p < 0.5 ? 1 : -1;
        }
        break;

      case "sawUp":
        // Sawtooth wave: -1 -> +1 ascending over cycle
        {
          const p = this.useRadians ? phase / (2 * Math.PI) : phase; // in [0..1)
          raw = 2 * p - 1; // range -1..+1
        }
        break;

      case "sawDown":
        // Inverted saw: +1 -> -1 descending
        {
          const p = this.useRadians ? phase / (2 * Math.PI) : phase;
          raw = 1 - 2 * p; // range +1..-1
        }
        break;

      case "random":
        // "Sample & hold" approach or continuous random
        // For simplicity, let's do continuous random each time we get the value
        raw = Math.random() * 2 - 1; // range -1..+1
        break;

      default:
        // fallback
        raw = 0;
        break;
    }

    // Scale by amplitude, then offset
    let value = raw * this.amplitude + this.offset;

    // Map to CC value range if targetParam is set
    if (this.targetParam) {
      value =
        this.minCcValue +
        ((value + this.amplitude) * (this.maxCcValue - this.minCcValue)) /
          (2 * this.amplitude);
    }

    return value;
  }

  /**
   * Reset phase to a given value. Default = 0
   * @param {number} [phase=0] - can be 0..2π if useRadians=true, or 0..1 if not
   */
  reset(phase = 0) {
    this.phase = phase;
    this.lastAbsoluteTime = null; // Also reset the absolute time tracking
  }

  // --- Getters & Setters ---

  setFrequency(freq) {
    this.frequency = freq;
  }
  getFrequency() {
    return this.frequency;
  }

  setAmplitude(amp) {
    this.amplitude = amp;
  }
  getAmplitude() {
    return this.amplitude;
  }

  setOffset(off) {
    this.offset = off;
  }
  getOffset() {
    return this.offset;
  }

  setShape(shape) {
    this.shape = shape;
  }
  getShape() {
    return this.shape;
  }

  setPhase(p) {
    this.phase = p;
  }
  getPhase() {
    return this.phase;
  }

  setUseRadians(bool) {
    this.useRadians = bool;
  }
  getUseRadians() {
    return this.useRadians;
  }

  setTargetParam(param) {
    this.targetParam = param;
  }
  getTargetParam() {
    return this.targetParam;
  }

  setMinCcValue(value) {
    this.minCcValue = value;
  }
  getMinCcValue() {
    return this.minCcValue;
  }

  setMaxCcValue(value) {
    this.maxCcValue = value;
  }
  getMaxCcValue() {
    return this.maxCcValue;
  }
}
