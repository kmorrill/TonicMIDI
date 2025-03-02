/**
 * src/patterns/chord-pattern.js
 *
 * A pattern that generates notes based on chord information from the ChordManager.
 * In this version, it only triggers once at the start of each chord's duration
 * (i.e. stepIndex % chord.duration === 0).
 *
 * Note: You may still want to give each chord a "duration" property in your chord
 * objects. If not present, we'll assume 16 steps by default.
 *
 * Regarding "gatePct" (seen elsewhere in your code):
 *   The ARP pattern might be trying to specify that notes only play for some fraction
 *   of their nominal duration, i.e. staccato vs. legato. You could integrate that
 *   concept here by adjusting 'durationSteps', but we haven't done so yet.
 */

import { AbstractPattern } from "./pattern-interface.js";

export class ChordPattern extends AbstractPattern {
  /**
   * @param {Object} options
   * @param {number} [options.length=16] - Pattern length in steps (for internal reference)
   * @param {string} [options.voicingType="close"] - Chord voicing type ("close", "open", "spread")
   * @param {number} [options.octave=4] - Base octave for fallback chord building
   * @param {number[]} [options.velocityPattern] - Optional velocity pattern for each step
   *
   * Note: Even though we only trigger once, we can still read from velocityPattern
   * to vary velocity from chord to chord (e.g., step 0 vs. step 16 vs. step 32).
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

    // Default velocity pattern if none is provided (accent on the first step)
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
   * @param {Object} context - Context object including chordManager (and optionally rhythmManager)
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>} Array of note objects
   */
  getNotes(stepIndex, context) {
    if (!context || !context.chordManager) {
      console.warn(
        "[ChordPattern] No chordManager in context. Returning no notes."
      );
      return [];
    }

    const chordManager = context.chordManager;
    const chord = chordManager.getChord(stepIndex);
    if (!chord) return [];

    // Only trigger once at the start of the chord's duration:
    // e.g., if chord.duration=16, only return notes when stepIndex % 16===0
    const chordDuration = chord.duration || 16;
    if (stepIndex % chordDuration !== 0) {
      // Not the chord boundary, so no notes this step
      return [];
    }

    // Use velocity pattern to differentiate each chord (optional)
    const velocity = this.velocityPattern[stepIndex % this.patternLength];

    // Generate chord notes from chord data
    const notes = this._generateChordNotes(chord, velocity);

    console.log(
      `[ChordPattern] Triggering chord at step=${stepIndex}`,
      chord,
      "notes:",
      notes
    );
    return notes;
  }

  /**
   * Returns the pattern length in steps
   * (Used by the LiveLoop to know how many steps before repeating.)
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Set the voicing type ("close", "open", "spread", etc.)
   */
  setVoicingType(voicingType) {
    this.voicingType = voicingType;
  }

  /**
   * Internal method to generate note objects from a chord
   *
   * @private
   * @param {Object} chord - The chord object (root, type, notes[], duration, etc.)
   * @param {number} velocity - MIDI velocity for the notes
   */
  _generateChordNotes(chord, velocity) {
    // If chord.notes is already populated by the ChordManager, just use that
    if (chord.notes && chord.notes.length) {
      return chord.notes.map((noteItem) => {
        if (typeof noteItem === "string") {
          // Use chord.duration as fallback for each note's duration
          return {
            note: noteItem,
            velocity,
            durationSteps: Math.floor(chord.duration || 1),
          };
        } else {
          // If chord.notes[] had objects like { note: "C4", durationSteps: 3, ... }
          const duration =
            noteItem.durationSteps ??
            noteItem.durationStepsOrBeats ??
            chord.duration ??
            1;
          return {
            note: noteItem.note,
            velocity: noteItem.velocity || velocity,
            durationSteps: Math.floor(duration),
          };
        }
      });
    }

    // Otherwise, construct chord notes manually (if needed).
    // Typically your ChordManager might already fill chord.notes,
    // so you might not even reach this code.
    const { root, type } = chord;
    const intervals = this._getIntervalsForChordType(type);

    const rootMidi = this._getNoteNumber(root, this.octave);

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

    const noteDurations = chord.noteDurations || {};
    const chordDuration = chord.duration || 1;

    return chordNotes.map((midiNote, index) => {
      const noteName = this._getMidiNoteName(midiNote);
      const specificDuration =
        noteDurations[noteName] || noteDurations[index] || chordDuration;

      return {
        note: noteName,
        velocity,
        durationSteps: Math.floor(specificDuration),
      };
    });
  }

  /**
   * Returns semitone intervals for a given chord type
   * @private
   */
  _getIntervalsForChordType(chordType) {
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

    return chordIntervals[chordType] || chordIntervals.maj;
  }

  // -- helper voicing methods (same as before) --

  _createCloseVoicing(rootMidi, intervals) {
    return intervals.map((interval) => rootMidi + interval);
  }

  _createOpenVoicing(rootMidi, intervals) {
    const voicing = [];
    intervals.forEach((interval, index) => {
      if (intervals.length <= 3 && index === 1) {
        // move 3rd up an octave
        voicing.push(rootMidi + interval + 12);
      } else if (index >= 3) {
        voicing.push(rootMidi + interval);
      } else {
        voicing.push(rootMidi + interval);
      }
    });
    return voicing;
  }

  _createSpreadVoicing(rootMidi, intervals) {
    if (intervals.length <= 3) {
      return [
        rootMidi,
        rootMidi + intervals[1] + 12,
        rootMidi + intervals[2] + 24,
      ];
    } else {
      const voicing = [rootMidi];
      intervals.slice(1).forEach((interval, idx) => {
        const octaveShift = Math.floor((idx + 1) / 2) * 12;
        voicing.push(rootMidi + interval + octaveShift);
      });
      return voicing;
    }
  }

  /**
   * Converts note name + octave to MIDI note number.
   * Simplified for demonstration.
   */
  _getNoteNumber(noteName, octave) {
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
    const name = noteName.charAt(0).toUpperCase();
    const accidental = noteName.slice(1); // might be # or b
    const fullNoteName = name + accidental;
    const semitone = noteMap[fullNoteName] || 0;
    return (octave + 1) * 12 + semitone;
  }

  /**
   * Converts a MIDI note number to note name.
   * Simplified for demonstration.
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
    const noteIndex = midiNote % 12;
    const noteOctave = Math.floor(midiNote / 12) - 1;
    return noteNames[noteIndex] + noteOctave;
  }
}
