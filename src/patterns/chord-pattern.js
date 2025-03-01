/**
 * src/patterns/chord-pattern.js
 *
 * A pattern that generates notes based on chord information from the ChordManager.
 * Demonstrates how to use the GlobalContext's ChordManager to get harmonic information,
 * and RhythmManager to sync with rhythmic structures.
 */

import { AbstractPattern } from "./pattern-interface.js";

export class ChordPattern extends AbstractPattern {
  /**
   * @param {Object} options
   * @param {number} [options.length=16] - Pattern length in steps
   * @param {string} [options.voicingType="close"] - Chord voicing type ("close", "open", "spread")
   * @param {number} [options.octave=4] - Base octave for the chord
   * @param {number[]} [options.velocityPattern] - Optional velocity pattern to apply
   */
  constructor({
    length = 16,
    voicingType = "close",
    octave = 4,
    velocityPattern = null,
  } = {}) {
    super();

    this.patternLength = length;
    this.voicingType = voicingType;
    this.octave = octave;

    // Default velocity pattern if none provided (accent on downbeat)
    this.velocityPattern =
      velocityPattern ||
      Array(length)
        .fill(90)
        .map((v, i) => (i === 0 ? 120 : v));
  }

  /**
   * Returns chord notes for the current step based on the chord manager's information
   *
   * @param {number} stepIndex - Current step index
   * @param {Object} context - Context object including chordManager and rhythmManager
   * @returns {Array<{ note: string, velocity: number, durationStepsOrBeats: number }>} Array of note objects
   */
  getNotes(stepIndex, context) {
    // If no context or no chord manager, return empty array
    if (!context || !context.chordManager) {
      return [];
    }

    const { chordManager, rhythmManager } = context;

    // Get the chord for this step from the chord manager
    const chord = chordManager.getChord(stepIndex);
    if (!chord) return [];

    // Get current step's velocity from pattern
    const velocity = this.velocityPattern[stepIndex % this.patternLength];

    // Check if we should play the chord on this step
    // This allows for rhythmic patterns based on RhythmManager
    if (rhythmManager) {
      // Only play on beats (quarter notes)
      const intStep = Math.floor(stepIndex); // Floor the step index for rhythm checks
      if (!rhythmManager.isBeat(intStep)) {
        return [];
      }

      // Adjust velocity based on rhythmic position
      const subdivision = rhythmManager.getSubdivision(intStep);
      let velocityFactor = 1.0;

      // Emphasize downbeats, de-emphasize offbeats
      switch (subdivision) {
        case 0: // Downbeat
          velocityFactor = 1.2;
          break;
        case 1: // Other beats
          velocityFactor = 1.0;
          break;
        case 2: // Offbeats
          velocityFactor = 0.8;
          break;
        default:
          velocityFactor = 0.7;
      }

      // Apply velocity factor
      const adjustedVelocity = Math.min(
        127,
        Math.floor(velocity * velocityFactor)
      );

      // Generate chord notes from the chord data
      const notes = this._generateChordNotes(chord, adjustedVelocity);
      return notes;
    }

    // If no rhythm manager, just return the chord notes with the pattern velocity
    return this._generateChordNotes(chord, velocity);
  }

  /**
   * Returns the pattern length
   *
   * @returns {number} Pattern length in steps
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Sets the voicing type for the chord pattern
   *
   * @param {string} voicingType - "close", "open", "spread", etc.
   */
  setVoicingType(voicingType) {
    this.voicingType = voicingType;
  }

  /**
   * Internal method to generate note objects from a chord
   * Each note in the chord can have its own duration if specified in the chord object
   *
   * @private
   * @param {Object} chord - Chord object from ChordManager
   * @param {number} velocity - MIDI velocity for the notes
   * @returns {Array<{ note: string, velocity: number, durationStepsOrBeats: number }>} Array of note objects
   */
  _generateChordNotes(chord, velocity) {
    const notes = [];

    // If chord has predefined notes, use those
    if (chord.notes && chord.notes.length) {
      // Handle case where chord.notes contains objects with note and duration
      return chord.notes.map((noteItem) => {
        if (typeof noteItem === "string") {
          return {
            note: noteItem,
            velocity,
            durationStepsOrBeats: chord.duration || 1, // Use chord's global duration if available
          };
        } else {
          // Note item is an object with its own properties
          return {
            note: noteItem.note,
            velocity: noteItem.velocity || velocity,
            durationStepsOrBeats:
              noteItem.durationStepsOrBeats || chord.duration || 1,
          };
        }
      });
    }

    // Otherwise, construct notes based on chord type and root
    const { root, type } = chord;

    // Get intervals based on chord type
    const intervals = this._getIntervalsForChordType(type);

    // Get MIDI note for root
    const rootMidi = this._getNoteNumber(root, this.octave);

    // Apply the appropriate voicing based on voicingType
    let chordNotes = [];

    switch (this.voicingType) {
      case "open":
        chordNotes = this._createOpenVoicing(rootMidi, intervals);
        break;
      case "spread":
        chordNotes = this._createSpreadVoicing(rootMidi, intervals);
        break;
      case "close":
      default:
        chordNotes = this._createCloseVoicing(rootMidi, intervals);
        break;
    }

    // Get chord duration if specified, or default to 1
    const chordDuration = chord.duration || 1;

    // Handle individual note durations if provided
    const noteDurations = chord.noteDurations || {};

    // Convert MIDI note numbers back to note names and include duration
    return chordNotes.map((midiNote, index) => {
      const noteName = this._getMidiNoteName(midiNote);

      // Use note-specific duration if available, otherwise use chord duration
      const duration =
        noteDurations[noteName] || // Look for duration by note name
        noteDurations[index] || // Or by position in chord
        chordDuration; // Or fall back to chord duration

      return {
        note: noteName,
        velocity,
        durationStepsOrBeats: duration,
      };
    });
  }

  /**
   * Returns semitone intervals for a given chord type
   *
   * @private
   * @param {string} chordType - The chord type (e.g., "maj", "min", "7", etc.)
   * @returns {number[]} Array of semitone intervals from the root
   */
  _getIntervalsForChordType(chordType) {
    // Define intervals for common chord types
    const chordIntervals = {
      // Triads
      maj: [0, 4, 7],
      min: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8],
      sus4: [0, 5, 7],
      sus2: [0, 2, 7],

      // Seventh chords
      maj7: [0, 4, 7, 11],
      min7: [0, 3, 7, 10],
      7: [0, 4, 7, 10],
      dim7: [0, 3, 6, 9],
      min7b5: [0, 3, 6, 10],
      aug7: [0, 4, 8, 10],

      // Extended chords
      9: [0, 4, 7, 10, 14],
      maj9: [0, 4, 7, 11, 14],
      min9: [0, 3, 7, 10, 14],

      // Tension chords
      "7#9": [0, 4, 7, 10, 15],
      "7b9": [0, 4, 7, 10, 13],
      "7#11": [0, 4, 7, 10, 18],
      "maj7#11": [0, 4, 7, 11, 18],
      "maj7#5": [0, 4, 8, 11],
      min7b9: [0, 3, 7, 10, 13],

      // Added tone chords
      maj6: [0, 4, 7, 9],
      min6: [0, 3, 7, 9],
    };

    // Return the intervals for the requested chord type or a major triad as fallback
    return chordIntervals[chordType] || chordIntervals["maj"];
  }

  /**
   * Creates a close voicing (notes packed tightly together)
   *
   * @private
   * @param {number} rootMidi - MIDI note number for root
   * @param {number[]} intervals - Semitone intervals for the chord
   * @returns {number[]} Array of MIDI note numbers for the chord
   */
  _createCloseVoicing(rootMidi, intervals) {
    return intervals.map((interval) => rootMidi + interval);
  }

  /**
   * Creates an open voicing (some notes spread to higher octaves)
   *
   * @private
   * @param {number} rootMidi - MIDI note number for root
   * @param {number[]} intervals - Semitone intervals for the chord
   * @returns {number[]} Array of MIDI note numbers for the chord
   */
  _createOpenVoicing(rootMidi, intervals) {
    // Simple algorithm: move 3rd up an octave in triads, or distribute extensions
    const voicing = [];
    intervals.forEach((interval, index) => {
      if (intervals.length <= 3 && index === 1) {
        // Move 3rd up an octave in triads
        voicing.push(rootMidi + interval + 12);
      } else if (index >= 3) {
        // Move extensions up an octave
        voicing.push(rootMidi + interval);
      } else {
        voicing.push(rootMidi + interval);
      }
    });

    return voicing;
  }

  /**
   * Creates a spread voicing (notes spread across multiple octaves)
   *
   * @private
   * @param {number} rootMidi - MIDI note number for root
   * @param {number[]} intervals - Semitone intervals for the chord
   * @returns {number[]} Array of MIDI note numbers for the chord
   */
  _createSpreadVoicing(rootMidi, intervals) {
    if (intervals.length <= 3) {
      // For triads, spread each note by an octave
      return [
        rootMidi,
        rootMidi + intervals[1] + 12,
        rootMidi + intervals[2] + 24,
      ];
    } else {
      // For 7th chords and extensions, distribute across octaves
      const voicing = [rootMidi];

      intervals.slice(1).forEach((interval, idx) => {
        // Add octave shifts based on position
        const octaveShift = Math.floor((idx + 1) / 2) * 12;
        voicing.push(rootMidi + interval + octaveShift);
      });

      return voicing;
    }
  }

  /**
   * Converts a note name and octave to MIDI note number
   * This is a simplified conversion for demonstration
   *
   * @private
   * @param {string} noteName - Note name (e.g., "C", "F#", "Bb")
   * @param {number} octave - Octave number
   * @returns {number} MIDI note number
   */
  _getNoteNumber(noteName, octave) {
    // This is a simplified version - a real implementation would have
    // proper handling of all note names, accidentals, etc.
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

    // Extract the note name (could be one or two characters)
    const noteBase = noteName.charAt(0).toUpperCase();
    const hasAccidental = noteName.length > 1;
    const accidental = hasAccidental ? noteName.substring(1) : "";

    const fullNoteName = noteBase + accidental;
    const noteValue = noteMap[fullNoteName] || 0;

    return (octave + 1) * 12 + noteValue;
  }

  /**
   * Converts a MIDI note number to note name and octave
   * This is a simplified conversion for demonstration
   *
   * @private
   * @param {number} midiNote - MIDI note number
   * @returns {string} Note name with octave (e.g., "C4", "F#3")
   */
  _getMidiNoteName(midiNote) {
    const noteNames = [
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
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;

    return noteNames[noteIndex] + octave;
  }
}
