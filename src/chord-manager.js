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
    } else {
      // If tension=none, we still want to ensure chord.notes is populated
      this._applyNoTension();
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
    } else {
      this._applyNoTension();
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
    const chordIndex = Math.floor(
      (stepIndex / stepsPerChord) % progressionLength
    );

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
    switch (level) {
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
        // If tension=none, ensure we at least populate chord notes
        this._applyNoTension();
        break;
    }
  }

  /**
   * If tension=none, we won't alter chord types. Just populate notes from root+type.
   *
   * @private
   */
  _applyNoTension() {
    this.progression = this.progression.map((chord) => {
      const newChord = { ...chord };
      this._populateChordNotes(newChord);
      return newChord;
    });
  }

  /**
   * Applies high tension transformations to chords
   * @private
   */
  _applyHighTension() {
    // Transform each chord to create more tension
    this.progression = this.progression.map((chord) => {
      const newChord = { ...chord };

      // Add dissonance based on chord type
      switch (chord.type) {
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
          // If chord type is something else, we keep it or lightly modify
          // For now, just keep the same type
          break;
      }

      // Now generate chord.notes
      this._populateChordNotes(newChord);

      return newChord;
    });
  }

  /**
   * Applies medium tension transformations to chords
   * @private
   */
  _applyMidTension() {
    this.progression = this.progression.map((chord) => {
      const newChord = { ...chord };

      // Add moderate tension based on chord type
      switch (chord.type) {
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
          break;
      }

      // Now generate chord.notes
      this._populateChordNotes(newChord);

      return newChord;
    });
  }

  /**
   * Applies low tension transformations to chords
   * @private
   */
  _applyLowTension() {
    this.progression = this.progression.map((chord) => {
      const newChord = { ...chord };

      // Subtle changes for low tension
      switch (chord.type) {
        case "maj":
          newChord.type = "maj6"; // Add 6th instead of 7th
          break;
        case "min":
          newChord.type = "min6"; // Add 6th
          break;
        default:
          // Minimal changes for other chord types
          break;
      }

      // Now generate chord.notes
      this._populateChordNotes(newChord);

      return newChord;
    });
  }

  /**
   * Auto-populate the chord's `notes` array based on root and type.
   * This is a simple example; expand as needed for more chord types.
   * @private
   * @param {Chord} chord
   */
  _populateChordNotes(chord) {
    // A minimal chord-type -> intervals (from root) map
    // Expand or refine these intervals for your musical needs
    const chordIntervals = {
      maj: [0, 4, 7],
      min: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8],
      sus4: [0, 5, 7],
      sus2: [0, 2, 7],
      maj7: [0, 4, 7, 11],
      7: [0, 4, 7, 10],
      min7: [0, 3, 7, 10],
      min7b5: [0, 3, 6, 10],
      dim7: [0, 3, 6, 9],
      "maj7#11": [0, 4, 7, 11, 18], // #11 is +6 from 11 => 17, plus root => 18
      "7#9": [0, 4, 7, 10, 15],
      "maj7#5": [0, 4, 8, 11],
      min7b9: [0, 3, 7, 10, 13],
      maj6: [0, 4, 7, 9],
      min6: [0, 3, 7, 9],
      9: [0, 4, 7, 10, 14],
      maj9: [0, 4, 7, 11, 14],
      // fallback
    };

    const intervals = chordIntervals[chord.type] || [0, 4, 7];
    // Use a default octave for chord generation, or track it in the chord object if you prefer
    const defaultOctave = 4;

    chord.notes = intervals.map((interval) => {
      return this._midiToName(
        this._rootPlusInterval(chord.root, defaultOctave, interval)
      );
    });
  }

  /**
   * Converts the root note + interval in semitones to a MIDI note number.
   * @private
   */
  _rootPlusInterval(rootNote, octave, semitoneOffset) {
    const noteMap = {
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
    const rootSemitone = noteMap[rootNote] || 0;
    const rootMidi = (octave + 1) * 12 + rootSemitone;
    return rootMidi + semitoneOffset;
  }

  /**
   * Converts a MIDI note number to note name + octave, e.g. 60 -> "C4".
   * @private
   */
  _midiToName(midi) {
    const names = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const note = names[midi % 12] || "C";
    const oct = Math.floor(midi / 12) - 1;
    return note + oct;
  }
}
