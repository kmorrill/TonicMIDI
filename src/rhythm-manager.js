/**
 * src/rhythm-manager.js
 *
 * A simplified RhythmManager that tracks:
 *   - The current subdivision ("normal", "doubleTime", "halfTime", etc.).
 *   - Basic step-per-beat and step-per-bar info.
 *   - Whether there's a kick on this beat (a single boolean).
 *
 * Exactly one "kick provider" pattern sets `kickThisBeat` each step.
 * Other patterns can read it if they want to coordinate with the kick.
 *
 * Now hardened so only the authorized kick provider can set the kick.
 */

export class RhythmManager {
  /**
   * @param {Object} options
   * @param {number} [options.stepsPerBar=16]
   *   Number of sequencer steps in one bar (measure) under "normal" subdivision.
   * @param {number} [options.stepsPerBeat=4]
   *   Number of steps per quarter note under "normal" subdivision.
   * @param {string} [options.subdivision="normal"]
   *   Which subdivision is active: "normal", "doubleTime", "halfTime", etc.
   */
  constructor({
    stepsPerBar = 16,
    stepsPerBeat = 4,
    subdivision = "normal",
  } = {}) {
    /**
     * The user’s "base" steps-per-bar in normal mode.
     * @private
     */
    this._baseStepsPerBar = stepsPerBar;

    /**
     * The user’s "base" steps-per-beat in normal mode.
     * @private
     */
    this._baseStepsPerBeat = stepsPerBeat;

    /**
     * The current subdivision setting: "normal", "doubleTime", "halfTime", etc.
     */
    this.subdivision = subdivision;

    /**
     * A boolean indicating whether the kick is triggered on the current step.
     * Only the authorized "kick provider" can set this.
     * @private
     */
    this.kickThisBeat = false;

    /**
     * The ID of the single authorized kick provider.
     * @private
     */
    this._authorizedKickProvider = null;

    /**
     * Actual steps per bar/beat/offbeat, recalculated in _updateStepCounts().
     */
    this.stepsPerBar = this._baseStepsPerBar;
    this.stepsPerBeat = this._baseStepsPerBeat;
    this.stepsPerOffbeat = Math.floor(this.stepsPerBeat / 2);

    // Initialize based on the current subdivision
    this._updateStepCounts();
  }

  /**
   * Authorizes a single pattern or loop ID to set the kick.
   * @param {string|number} providerId
   */
  authorizeKickProvider(providerId) {
    this._authorizedKickProvider = providerId;
  }

  /**
   * Sets whether the kick is on for this beat/step,
   * but only if callerId matches the authorized provider.
   *
   * @param {string|number} callerId - ID of the loop/pattern attempting to set the kick
   * @param {boolean} isOn
   */
  setKickOnThisBeat(callerId, isOn) {
    if (callerId !== this._authorizedKickProvider) {
      console.warn(
        `RhythmManager: Unauthorized call to setKickOnThisBeat() by ${callerId}. Ignoring.`
      );
      return;
    }
    this.kickThisBeat = !!isOn;
  }

  /**
   * Returns true if the kick is on for this beat.
   * @returns {boolean}
   */
  isKickOnThisBeat() {
    return this.kickThisBeat;
  }

  /**
   * Checks if the given step is the downbeat (stepIndex % stepsPerBar === 0).
   * e.g. in 16-step bars, step 0,16,32,... are downbeats.
   * @param {number} stepIndex
   * @returns {boolean}
   */
  isDownbeat(stepIndex) {
    return stepIndex % this.stepsPerBar === 0;
  }

  /**
   * Checks if the given step is a quarter-note beat (stepIndex % stepsPerBeat === 0).
   * @param {number} stepIndex
   * @returns {boolean}
   */
  isBeat(stepIndex) {
    return stepIndex % this.stepsPerBeat === 0;
  }

  /**
   * Checks if the given step is an offbeat (e.g., stepIndex % stepsPerBeat === stepsPerOffbeat).
   * In default 4/4, that's stepIndex % 4 === 2 for offbeats.
   * @param {number} stepIndex
   * @returns {boolean}
   */
  isOffbeat(stepIndex) {
    return stepIndex % this.stepsPerBeat === this.stepsPerOffbeat;
  }

  /**
   * Returns a small integer describing the position in the subdivision:
   *   0 => downbeat
   *   1 => any other beat
   *   2 => offbeat
   *   3 => everything else
   * @param {number} stepIndex
   * @returns {number} 0..3
   */
  getSubdivision(stepIndex) {
    if (this.isDownbeat(stepIndex)) return 0;
    if (this.isBeat(stepIndex)) return 1;
    if (this.isOffbeat(stepIndex)) return 2;
    return 3;
  }

  /**
   * Returns the beat number (1-based) within the bar.
   * For example, if stepsPerBeat=4, stepsPerBar=16,
   * stepIndex=0..3 => beat#1, stepIndex=4..7 => beat#2, etc.
   * @param {number} stepIndex
   * @returns {number}
   */
  getBeatNumber(stepIndex) {
    return Math.floor((stepIndex % this.stepsPerBar) / this.stepsPerBeat) + 1;
  }

  /**
   * Allows external code (EnergyManager, etc.) to set the subdivision:
   * "normal", "doubleTime", or "halfTime". Then we recalc stepsPerBar/Beat.
   *
   * @param {string} subdivision
   */
  setSubdivision(subdivision) {
    if (this.subdivision === subdivision) {
      // No change
      return;
    }
    this.subdivision = subdivision;
    this._updateStepCounts();
  }

  /**
   * Internal method to recompute stepsPerBar, stepsPerBeat, stepsPerOffbeat
   * based on the chosen subdivision.
   * @private
   */
  _updateStepCounts() {
    switch (this.subdivision) {
      case "doubleTime":
        // If base is 16 steps, doubleTime => 32 steps
        this.stepsPerBar = this._baseStepsPerBar * 2; // e.g. 16 -> 32
        this.stepsPerBeat = this._baseStepsPerBeat * 2; // e.g. 4 -> 8
        break;

      case "halfTime":
        // If base is 16 steps, halfTime => 8 steps
        this.stepsPerBar = Math.floor(this._baseStepsPerBar / 2); // e.g. 16 -> 8
        this.stepsPerBeat = Math.floor(this._baseStepsPerBeat / 2); // e.g. 4 -> 2
        break;

      case "normal":
      default:
        // Reset to the base
        this.stepsPerBar = this._baseStepsPerBar; // 16
        this.stepsPerBeat = this._baseStepsPerBeat; // 4
        break;
    }
    this.stepsPerOffbeat = Math.floor(this.stepsPerBeat / 2);
  }

  /**
   * OPTIONAL: Returns an array of accent velocities for each step in the bar,
   * if you want to program dynamic accent patterns.
   * @returns {number[]} An array of length stepsPerBar with accent values
   */
  getAccentPattern() {
    const accentPattern = new Array(this.stepsPerBar).fill(0);

    // Simple example for "normal", "doubleTime", and "halfTime"
    switch (this.subdivision) {
      case "normal":
        // Standard 4/4 approach
        for (let i = 0; i < this.stepsPerBar; i++) {
          if (i % this.stepsPerBeat === 0) {
            if (i === 0) accentPattern[i] = 120; // strong downbeat
            else if (i === this.stepsPerBeat * 2) accentPattern[i] = 100; // mid
            else accentPattern[i] = 90;
          } else if (i % (this.stepsPerBeat / 2) === 0) {
            accentPattern[i] = 70; // offbeat
          }
        }
        break;

      case "doubleTime":
        // Twice as many steps in the bar
        for (let i = 0; i < this.stepsPerBar; i++) {
          // e.g., step multiple of stepsPerBeat => strong accent
          if (i % this.stepsPerBeat === 0) {
            accentPattern[i] = 110;
          } else if (i % (this.stepsPerBeat / 2) === 0) {
            accentPattern[i] = 80;
          }
        }
        break;

      case "halfTime":
        // Half as many steps => a slower feel
        for (let i = 0; i < this.stepsPerBar; i++) {
          if (i === 0) {
            accentPattern[i] = 127; // super strong downbeat
          } else if (i === Math.floor(this.stepsPerBar / 2)) {
            accentPattern[i] = 110; // mid-bar accent
          } else if (i % this.stepsPerBeat === 0) {
            accentPattern[i] = 90;
          } else if (i % (this.stepsPerBeat / 2) === 0) {
            accentPattern[i] = 70;
          }
        }
        break;
    }

    return accentPattern;
  }
}
