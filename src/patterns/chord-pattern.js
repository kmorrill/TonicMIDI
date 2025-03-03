/**
 * src/patterns/chord-pattern.js
 *
 * A pattern that generates chord notes at chord boundaries, using information
 * from a `ChordManager`. For example, if a chord has `duration=16`, this pattern
 * will output the chord notes when `stepIndex % 16 === 0`, and remain silent
 * on other steps. Each chord’s notes can be fetched directly from `chord.notes`
 * (if provided), or constructed on the fly based on root/type and the desired voicing.
 *
 * **Typical Usage**:
 * ```js
 * import { ChordPattern } from "op-xy-live/patterns/chord-pattern.js";
 *
 * // Suppose you have a ChordManager that provides chord objects:
 * //   { root: "C", type: "maj7", notes: ["C4", "E4", "G4", "B4"], duration: 16 }
 *
 * const chordManager = new ChordManager({
 *   progression: [
 *     { root: "C", type: "maj7", duration: 16 },
 *     { root: "F", type: "min7", duration: 16 },
 *   ],
 *   tensionLevel: "none",
 * });
 *
 * // Create a chord pattern
 * const chordPattern = new ChordPattern({
 *   length: 16,       // internal pattern reference length
 *   voicingType: "close",
 *   octave: 4,
 *   velocityPattern: null,
 * });
 *
 * // Then in your LiveLoop context:
 * const loop = new LiveLoop(midiBus, {
 *   pattern: chordPattern,
 *   context: { chordManager },
 *   midiChannel: 1,
 *   name: "Chords"
 * });
 * ```
 */
import { BasePattern } from "./base-pattern.js";

export class ChordPattern extends BasePattern {
  /**
   * Constructs a ChordPattern that looks up chords from the provided `chordManager`
   * in the pattern's context. It only triggers at the start of each chord's duration
   * (`stepIndex % chord.duration === 0`). If no `duration` is found on the chord,
   * we assume 16 steps by default.
   *
   * @param {Object} [options={}]
   * @param {number} [options.length=16]
   *   An internal reference length for pattern usage (e.g., for velocity cycling).
   * @param {string} [options.voicingType="close"]
   *   Determines how chords are constructed if `chord.notes` is not already populated.
   *   Possible values: "close", "open", "spread".
   * @param {number} [options.octave=4]
   *   The base octave for fallback chord building if `chord.notes` is missing.
   * @param {number[]} [options.velocityPattern=null]
   *   An optional array of velocities, one per step in `length`. If provided, we
   *   use `velocityPattern[stepIndex % patternLength]` when triggering a chord.
   *   If null, a default pattern is created where step 0 has velocity=120 and
   *   others=90.
   */
  constructor({
    length = 16,
    voicingType = "close",
    octave = 4,
    velocityPattern = null,
  } = {}) {
    super({
      length,
      voicingType,
      octave,
      velocityPattern,
    });

    /**
     * @private
     * Internal pattern length used for cycling velocity.
     */
    this.patternLength = length;

    /**
     * @private
     * Voicing type: "close", "open", or "spread". Affects how chord tones are
     * spaced when chord.notes is not already set.
     */
    this.voicingType = voicingType;

    /**
     * @private
     * Base octave for fallback chord building.
     */
    this.octave = octave;

    /**
     * @private
     * Velocity pattern array. If not given, defaults to an array of length `patternLength`,
     * with the first step=120 and the rest=90.
     */
    this.velocityPattern =
      velocityPattern ||
      Array(length)
        .fill(90)
        .map((v, i) => (i === 0 ? 120 : v));
  }

  /**
   * Determines which notes to output at a given step index, based on `chordManager`.
   * If the chord’s `duration` is 16 steps and `stepIndex % 16 === 0`, it triggers
   * the chord. Otherwise, it returns no notes.
   *
   * @param {number} stepIndex
   *   The current step in a sequence. Typically 0-based, incremented by a sequencer or LiveLoop.
   * @param {Object} context
   *   The context object, **must** include `chordManager` (and optionally `rhythmManager`).
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   *   An array of note objects (one per chord tone). If the chord is not triggered this step,
   *   returns an empty array.
   *
   * @private
   */
  getNotes(stepIndex, context) {
    if (!context || !context.chordManager) {
      console.warn(
        "[ChordPattern] No chordManager in context. Returning no notes."
      );
      return [];
    }

    const chord = context.chordManager.getChord(stepIndex);
    if (!chord) return [];

    // If chord.duration=16, we only trigger on multiples of 16
    const chordDuration = chord.duration || 16;
    if (stepIndex % chordDuration !== 0) {
      return [];
    }

    // Use our velocityPattern to pick a velocity at this step
    const velocity = this.velocityPattern[stepIndex % this.patternLength];

    // Build chord notes (either from chord.notes or from root/type)
    const notes = this._generateChordNotes(chord, velocity);

    return notes;
  }

  /**
   * Returns how many steps before this pattern conceptually repeats.
   * This is used by some sequencers to align pattern boundaries, but
   * note that actual chord triggering depends primarily on each chord’s
   * `duration` property.
   *
   * @returns {number} The pattern length (defaults to 16 if unspecified).
   *
   * @private
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Allows you to change the chord voicing style on the fly. For example, from
   * "close" to "spread", so newly triggered chords will have a wider spacing.
   *
   * @param {string} voicingType
   *   One of "close", "open", or "spread".
   */
  setVoicingType(voicingType) {
    this.voicingType = voicingType;
  }

  /**
   * @private
   * Generates chord notes based on chord data. If `chord.notes` exists, we use it
   * directly. Otherwise, we try to build the chord from its root and type.
   *
   * @param {Object} chord
   *   An object which may have { root, type, notes, duration, noteDurations }.
   * @param {number} velocity
   *   The velocity to assign to each note, unless overridden by note-level velocity.
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   */
  _generateChordNotes(chord, velocity) {
    // If chordManager already generated chord.notes, just wrap them
    if (chord.notes && chord.notes.length) {
      return chord.notes.map((noteItem) => {
        if (typeof noteItem === "string") {
          return {
            note: noteItem,
            velocity,
            durationSteps: Math.floor(chord.duration || 1),
          };
        } else {
          // e.g., { note: "C4", durationSteps: 3, velocity: 80 }
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

    // Otherwise, build chord from root+type using voicing
    const { root, type } = chord;
    const intervals = this._getIntervalsForChordType(type);
    const rootMidi = this._getNoteNumber(root, this.octave);

    let chordNotes;
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

    // If chord.noteDurations exists (mapping either noteName or index to custom durations),
    // we'll assign them here. Otherwise we fall back to `chord.duration || 1`.
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
   * @private
   * Returns a list of semitone intervals for a chord type, e.g. "maj" => [0, 4, 7].
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

      // Extended
      9: [0, 4, 7, 10, 14],
      maj9: [0, 4, 7, 11, 14],
      min9: [0, 3, 7, 10, 14],

      // Tension
      "7#9": [0, 4, 7, 10, 15],
      "7b9": [0, 4, 7, 10, 13],
      "7#11": [0, 4, 7, 10, 18],
      "maj7#11": [0, 4, 7, 11, 18],
      "maj7#5": [0, 4, 8, 11],
      min7b9: [0, 3, 7, 10, 13],

      // Added tones
      maj6: [0, 4, 7, 9],
      min6: [0, 3, 7, 9],
    };

    return chordIntervals[chordType] || chordIntervals.maj;
  }

  /**
   * @private
   * Voicing helpers for "close", "open", or "spread".
   */
  _createCloseVoicing(rootMidi, intervals) {
    return intervals.map((interval) => rootMidi + interval);
  }

  /**
   * @private
   */
  _createOpenVoicing(rootMidi, intervals) {
    const voicing = [];
    intervals.forEach((interval, index) => {
      // For triads, move the 3rd up an octave
      if (intervals.length <= 3 && index === 1) {
        voicing.push(rootMidi + interval + 12);
      } else {
        voicing.push(rootMidi + interval);
      }
    });
    return voicing;
  }

  /**
   * @private
   */
  _createSpreadVoicing(rootMidi, intervals) {
    if (intervals.length <= 3) {
      // For triads, root in base octave, 3rd an octave above, 5th two octaves above
      return [
        rootMidi,
        rootMidi + intervals[1] + 12,
        rootMidi + intervals[2] + 24,
      ];
    } else {
      // For 7th chords or more, spread them out in ascending octaves
      const voicing = [rootMidi];
      intervals.slice(1).forEach((interval, idx) => {
        const octaveShift = Math.floor((idx + 1) / 2) * 12;
        voicing.push(rootMidi + interval + octaveShift);
      });
      return voicing;
    }
  }

  /**
   * @private
   * Simple utility to get a note's MIDI number from root + octave. E.g. "C4" => 60.
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
    const semitone = noteMap[name + accidental] || 0;
    return (octave + 1) * 12 + semitone;
  }

  /**
   * @private
   * Simple utility to convert a MIDI number to a note name like "C4".
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
