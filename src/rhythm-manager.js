/**
 * src/rhythm-manager.js
 *
 * The RhythmManager provides information about rhythmic structure and beats.
 * It can identify downbeats, offbeats, and other subdivision points in the step sequence.
 * Patterns can query this manager to create rhythmic elements that are in sync with each other.
 */

export class RhythmManager {
  /**
   * @param {Object} options
   * @param {number} [options.stepsPerBar=16] - Number of steps in one bar/measure
   * @param {number} [options.stepsPerBeat=4] - Number of steps in one beat (quarter note)
   * @param {string} [options.subdivision="normal"] - Current rhythmic subdivision ("normal", "doubleTime", "halfTime", etc.)
   */
  constructor({ stepsPerBar = 16, stepsPerBeat = 4, subdivision = "normal" } = {}) {
    this.stepsPerBar = stepsPerBar;
    this.stepsPerBeat = stepsPerBeat;
    this.subdivision = subdivision;
    
    // Calculate steps per offbeat based on time signature (assumed 4/4 for simplicity)
    this.stepsPerOffbeat = Math.floor(this.stepsPerBeat / 2);
    
    // For more complex rhythm patterns, could store accent patterns, etc.
    this._updateStepCounts();
  }

  /**
   * Checks if the given step is a downbeat (first beat of a bar)
   * 
   * @param {number} stepIndex - The current step index
   * @returns {boolean} True if the step is a downbeat
   */
  isDownbeat(stepIndex) {
    return stepIndex % this.stepsPerBar === 0;
  }

  /**
   * Checks if the given step is a beat (quarter note in 4/4)
   * 
   * @param {number} stepIndex - The current step index
   * @returns {boolean} True if the step is a beat
   */
  isBeat(stepIndex) {
    return stepIndex % this.stepsPerBeat === 0;
  }

  /**
   * Checks if the given step is an offbeat (eighth note between beats in 4/4)
   * 
   * @param {number} stepIndex - The current step index
   * @returns {boolean} True if the step is an offbeat
   */
  isOffbeat(stepIndex) {
    return stepIndex % this.stepsPerBeat === this.stepsPerOffbeat;
  }

  /**
   * Gets the current subdivision of the step
   * 
   * @param {number} stepIndex - The current step index
   * @returns {number} 0 for downbeat, 1 for other beats, 2 for offbeats, 3 for other subdivisions
   */
  getSubdivision(stepIndex) {
    if (this.isDownbeat(stepIndex)) return 0;
    if (this.isBeat(stepIndex)) return 1;
    if (this.isOffbeat(stepIndex)) return 2;
    return 3; // Other subdivision
  }

  /**
   * Returns the current beat number within the bar (1-based)
   * 
   * @param {number} stepIndex - The current step index
   * @returns {number} Beat number (1, 2, 3, 4 in 4/4 time)
   */
  getBeatNumber(stepIndex) {
    return Math.floor((stepIndex % this.stepsPerBar) / this.stepsPerBeat) + 1;
  }

  /**
   * Changes the subdivision setting, affecting the rhythm feel
   * 
   * @param {string} subdivision - "normal", "doubleTime", "halfTime", etc.
   */
  setSubdivision(subdivision) {
    if (this.subdivision === subdivision) return;
    
    this.subdivision = subdivision;
    this._updateStepCounts();
  }

  /**
   * Updates step counts based on the current subdivision setting
   * @private
   */
  _updateStepCounts() {
    const originalStepsPerBar = 16; // Default 16 steps per bar in "normal" mode
    const originalStepsPerBeat = 4;  // Default 4 steps per beat in "normal" mode
    
    switch(this.subdivision) {
      case "doubleTime":
        // Double-time feel - twice as many events in the same time
        this.stepsPerBar = originalStepsPerBar / 2;
        this.stepsPerBeat = originalStepsPerBeat / 2;
        break;
      case "halfTime":
        // Half-time feel - half as many events, more space
        this.stepsPerBar = originalStepsPerBar * 2;
        this.stepsPerBeat = originalStepsPerBeat * 2; 
        break;
      case "triplet":
        // Triplet feel - 3 subdivisions per beat instead of 2
        this.stepsPerBar = Math.floor(originalStepsPerBar * (2/3));
        this.stepsPerBeat = Math.floor(originalStepsPerBeat * (2/3));
        break;
      case "normal":
      default:
        // Reset to normal timing
        this.stepsPerBar = originalStepsPerBar;
        this.stepsPerBeat = originalStepsPerBeat;
        break;
    }
    
    // Update dependent values
    this.stepsPerOffbeat = Math.floor(this.stepsPerBeat / 2);
  }
  
  /**
   * Generates an accent pattern for the current rhythmic feel
   * This could be used by drum patterns to emphasize certain beats
   * 
   * @returns {number[]} Array of accent values (0-127) for each step in a bar
   */
  getAccentPattern() {
    const accentPattern = new Array(this.stepsPerBar).fill(0);
    
    // Set accents based on subdivision type
    switch(this.subdivision) {
      case "normal":
        // Standard 4/4 accent pattern: strong on 1, medium on 3, weak on 2 & 4
        for (let i = 0; i < this.stepsPerBar; i += this.stepsPerBeat) {
          if (i === 0) {
            accentPattern[i] = 120; // Downbeat (beat 1) - strong accent
          } else if (i === this.stepsPerBeat * 2) {
            accentPattern[i] = 100; // Beat 3 - medium accent
          } else {
            accentPattern[i] = 90;  // Beats 2 & 4 - lighter accent
          }
          
          // Add light accents on offbeats
          if (i + this.stepsPerOffbeat < this.stepsPerBar) {
            accentPattern[i + this.stepsPerOffbeat] = 70;
          }
        }
        break;
        
      case "doubleTime":
        // Faster feel with more regular accents
        for (let i = 0; i < this.stepsPerBar; i++) {
          if (i % this.stepsPerBeat === 0) {
            accentPattern[i] = 110; // Every beat gets a strong accent
          } else if (i % (this.stepsPerBeat/2) === 0) {
            accentPattern[i] = 90;  // "and" of each beat gets medium accent
          } else {
            accentPattern[i] = 70;  // Other subdivisions get light accents
          }
        }
        break;
        
      case "halfTime":
        // Slower feel with stronger downbeats and less frequent accents
        for (let i = 0; i < this.stepsPerBar; i++) {
          if (i === 0) {
            accentPattern[i] = 127; // Very strong downbeat
          } else if (i % this.stepsPerBar === this.stepsPerBar/2) {
            accentPattern[i] = 110; // Medium accent on beat 3
          } else if (i % this.stepsPerBeat === 0) {
            accentPattern[i] = 90;  // Light accent on other beats
          } else if (i % (this.stepsPerBeat/2) === 0) {
            accentPattern[i] = 70;  // Very light accent on offbeats
          }
        }
        break;
    }
    
    return accentPattern;
  }
}