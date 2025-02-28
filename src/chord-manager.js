/**
 * src/chord-manager.js
 *
 * The ChordManager provides a central place for chord/harmony context.
 * It stores a chord progression and offers methods to manipulate chord qualities/dissonance
 * based on tension levels.
 */

/**
 * @typedef {Object} Chord
 * @property {string} root - Root note name (e.g., "C", "F#", "Bb")
 * @property {string} type - Chord type (e.g., "maj", "min", "7", "maj7", "min7", "dim")
 * @property {string[]} [notes] - Optional array of note names in the chord
 * @property {number} [inversion=0] - Inversion of the chord (0 = root position, 1 = first inversion, etc.)
 */

export class ChordManager {
  /**
   * @param {Object} options
   * @param {Chord[]} [options.progression=[]] - Initial chord progression
   * @param {string} [options.tensionLevel="none"] - Initial tension level
   */
  constructor({ progression = [], tensionLevel = "none" } = {}) {
    this.progression = progression;
    this.tensionLevel = tensionLevel;
    
    // Store the original progression to allow returning to it
    this.originalProgression = [...progression];
    
    // Keep track of current step for stateful operations
    this.currentStepIndex = 0;
    
    // Apply initial tension level
    if (tensionLevel !== "none") {
      this._applyTensionToProgression(tensionLevel);
    }
  }

  /**
   * Sets a new chord progression
   * 
   * @param {Chord[]} progression - Array of chord objects
   */
  setProgression(progression) {
    this.progression = [...progression];
    this.originalProgression = [...progression];
    
    // Apply current tension level to the new progression
    if (this.tensionLevel !== "none") {
      this._applyTensionToProgression(this.tensionLevel);
    }
  }

  /**
   * Sets the tension level, manipulating chord qualities and dissonance
   * 
   * @param {string} level - Tension level ("none", "low", "mid", "high")
   */
  setTensionLevel(level) {
    if (this.tensionLevel === level) return;
    
    this.tensionLevel = level;
    
    // Reset to original progression first
    this.progression = [...this.originalProgression];
    
    // Then apply the new tension level
    this._applyTensionToProgression(level);
  }

  /**
   * Returns the chord for a specific step index
   * 
   * @param {number} stepIndex - The current step index
   * @returns {Chord} The chord for the given step
   */
  getChord(stepIndex) {
    if (!this.progression.length) return null;
    
    this.currentStepIndex = stepIndex;
    
    // Calculate which chord to return based on step index
    // This implementation assumes a simple mapping where each chord occupies
    // an equal number of steps, but you can implement more complex patterns
    const progressionLength = this.progression.length;
    const stepsPerChord = 16; // Assuming 16 steps per chord, adjust as needed
    const chordIndex = Math.floor((stepIndex / stepsPerChord) % progressionLength);
    
    return this.progression[chordIndex];
  }

  /**
   * Returns the current tension level
   * 
   * @returns {string} Current tension level
   */
  getTensionLevel() {
    return this.tensionLevel;
  }

  /**
   * Internal method to apply tension transformations to the progression
   * 
   * @private
   * @param {string} level - Tension level
   */
  _applyTensionToProgression(level) {
    switch(level) {
      case "high":
        this._applyHighTension();
        break;
      case "mid":
        this._applyMidTension();
        break;
      case "low":
        this._applyLowTension();
        break;
      case "none":
      default:
        // No transformation needed, original progression is used
        break;
    }
  }

  /**
   * Applies high tension transformations to chords
   * @private
   */
  _applyHighTension() {
    // Transform each chord to create more tension
    this.progression = this.progression.map(chord => {
      const newChord = { ...chord };
      
      // Add dissonance based on chord type
      switch(chord.type) {
        case "maj":
          newChord.type = "maj7#11"; // Major with #11 tension
          break;
        case "min":
          newChord.type = "min7b5"; // Half-diminished sound
          break;
        case "7":
          newChord.type = "7#9"; // Dominant with #9 tension
          break;
        case "maj7":
          newChord.type = "maj7#5"; // Lydian augmented sound
          break;
        case "min7":
          newChord.type = "min7b9"; // Minor with flat 9
          break;
        default:
          // Add some dissonant note for other chord types
          if (newChord.notes) {
            // This is simplified; in a real implementation,
            // you'd want more sophisticated note manipulation
            newChord.notes = [...newChord.notes];
          }
      }
      
      return newChord;
    });
  }

  /**
   * Applies medium tension transformations to chords
   * @private
   */
  _applyMidTension() {
    this.progression = this.progression.map(chord => {
      const newChord = { ...chord };
      
      // Add moderate tension based on chord type
      switch(chord.type) {
        case "maj":
          newChord.type = "maj7"; // Add 7th
          break;
        case "min":
          newChord.type = "min7"; // Add 7th
          break;
        case "7":
          newChord.type = "9"; // Add 9th
          break;
        case "maj7":
          newChord.type = "maj9"; // Add 9th
          break;
        default:
          // Minimal changes for other chord types
          if (newChord.notes) {
            newChord.notes = [...newChord.notes];
          }
      }
      
      return newChord;
    });
  }

  /**
   * Applies low tension transformations to chords
   * @private
   */
  _applyLowTension() {
    this.progression = this.progression.map(chord => {
      const newChord = { ...chord };
      
      // Subtle changes for low tension
      switch(chord.type) {
        case "maj":
          newChord.type = "maj6"; // Add 6th instead of 7th
          break;
        case "min":
          newChord.type = "min6"; // Add 6th
          break;
        default:
          // Minimal changes for other chord types
          if (newChord.notes) {
            newChord.notes = [...newChord.notes];
          }
      }
      
      return newChord;
    });
  }
}