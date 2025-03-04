/**
 * contour-melody-pattern.js
 *
 * A pattern that follows a user-defined melodic contour relative to each chord,
 * optionally adding "spice" or approach notes. Throws an error if no chord is available
 * via chordManager.
 *
 * Usage Example:
 *   const pattern = new ContourMelodyPattern({
 *     contour: [0, 1, 2, 1],
 *     spiceProbability: 15,
 *     length: 16,
 *   });
 */

import { BasePattern } from "./base-pattern.js";

/**
 * @typedef {Object} ContourMelodyOptions
 * @property {number[]} [contour=[0]]
 *   An array of integers representing "chord-tone index offsets" or steps in chord-tone space.
 *   Example: [0, 1, 2, 1, -1]. Index 0 = chord root. Index 1 = next chord tone, etc.
 *   If chord.notes = ["C4", "E4", "G4", "B4"], index 1 might be "E4".
 *   Negative indices move backward in chord.notes (e.g., -1 picks the chord tone before the current one).
 *   We wrap or clamp if we go out of range.
 * @property {number} [length=16]
 *   The number of steps before the pattern conceptually loops.
 * @property {boolean} [allowRests=false]
 *   If true, you can randomly skip steps or rest. Implementation is optional.
 * @property {number} [restProbability=0]
 *   Probability in percent (0..100) of generating a rest on any given step (only if allowRests=true).
 * @property {number} [spiceProbability=0]
 *   Probability in percent (0..100) that we deviate from the pure chord tone
 *   to an approach/dissonance note. Higher tension might also increase this.
 * @property {function} [randomFn=Math.random]
 *   A custom random function for deterministic output in tests.
 */

export class ContourMelodyPattern extends BasePattern {
  /**
   * Creates a new ContourMelodyPattern.
   *
   * @param {ContourMelodyOptions} [options={}] Configuration for the melodic contour pattern.
   */
  constructor({
    contour = [0],
    length = 16,
    allowRests = false,
    restProbability = 0,
    spiceProbability = 0,
    randomFn = Math.random,
  } = {}) {
    super({
      contour,
      length,
      allowRests,
      restProbability,
      spiceProbability,
    });

    /**
     * The user-provided contour array, describing chord-tone index offsets.
     * @private
     * @type {number[]}
     */
    this.contour = contour;

    /**
     * Pattern length in steps. The pattern cycles through the contour every step, or can do more complex logic.
     * @private
     * @type {number}
     */
    this.patternLength = length;

    /**
     * Whether to allow rests (skip notes) on random steps.
     * @private
     * @type {boolean}
     */
    this.allowRests = allowRests;

    /**
     * Probability (0..100) of generating a rest on a given step (if allowRests=true).
     * @private
     * @type {number}
     */
    this.restProbability = restProbability;

    /**
     * Probability (0..100) that we apply a "spice" approach or dissonant note.
     * @private
     * @type {number}
     */
    this.spiceProbability = spiceProbability;

    /**
     * A custom random function for optional deterministic usage.
     * @private
     */
    this._randomFn = randomFn;

    /**
     * @private
     * Tracks which index in the contour array we’re on.
     */
    this._currentContourIndex = 0;

    // Validate inputs
    if (!Array.isArray(this.contour) || !this.contour.length) {
      throw new Error(
        "[ContourMelodyPattern] 'contour' must be a non-empty array of integers."
      );
    }
  }

  /**
   * Called each step by the LiveLoop. We must have a chord from chordManager, or we throw an error.
   * If we have a rhythmManager, we can do additional logic like skipping offbeats.
   * If tension is high, we might increase spice probability, etc.
   *
   * @param {number} stepIndex
   * @param {object} context  Typically includes { chordManager, rhythmManager, energyState, ... }
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   */
  getNotes(stepIndex, context = {}) {
    const { chordManager, rhythmManager, energyState } = context;
    if (!chordManager) {
      throw new Error(
        "[ContourMelodyPattern] No chordManager found in context. Cannot harmonize."
      );
    }

    // 1. Retrieve the chord for the current step
    const chord = chordManager.getChord(stepIndex);
    if (!chord || !Array.isArray(chord.notes) || chord.notes.length === 0) {
      throw new Error(
        "[ContourMelodyPattern] No chord or empty chord.notes. Cannot harmonize."
      );
    }

    // 2. Possibly skip step if we have a rhythmManager and decide it's not a beat (custom logic)
    if (rhythmManager && !rhythmManager.isBeat(stepIndex)) {
      // Example: skip non-beats or do something else
      // return [];
      // Or keep it commented if you want every step triggered:
    }

    // 3. Maybe rest
    if (this.allowRests && this._randomFn() * 100 < this.restProbability) {
      return [];
    }

    // 4. Possibly adjust spiceProbability based on tension
    let actualSpiceProb = this.spiceProbability;
    if (energyState && typeof energyState.tensionLevel === "string") {
      switch (energyState.tensionLevel) {
        case "low":
          actualSpiceProb *= 0.5;
          break;
        case "mid":
          actualSpiceProb *= 1.0; // no change
          break;
        case "high":
          actualSpiceProb *= 2.0; // double the chance
          break;
        // "none" or unknown => do nothing
      }
      // clamp to max 100
      actualSpiceProb = Math.min(100, actualSpiceProb);
    }

    // 5. Determine the next chord tone from the contour
    const offset = this.contour[this._currentContourIndex];
    const chordTone = this._getChordTone(chord.notes, offset);

    // Move to the next contour index (wrap around)
    this._currentContourIndex =
      (this._currentContourIndex + 1) % this.contour.length;

    // 6. Possibly add “spice” note or approach note
    let finalNoteName = chordTone; // by default, we use the chord tone
    if (this._randomFn() * 100 < actualSpiceProb) {
      // Insert an approach note or dissonance:
      finalNoteName = this._applySpice(chordTone, chord, energyState);
    }

    // 7. Velocity logic (optional). For example, accent downbeat
    let velocity = 100;
    if (rhythmManager && rhythmManager.isDownbeat(stepIndex)) {
      velocity = 120;
    }

    // 8. Return our single note
    return [
      {
        note: finalNoteName,
        velocity,
        durationSteps: 1,
      },
    ];
  }

  /**
   * The pattern length in steps for looping or boundary logic.
   * @returns {number}
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Pick a chord tone from chord.notes, given an offset in “chord tone space.”
   * E.g. offset=0 => chord.notes[0], offset=1 => chord.notes[1], offset=-1 => chord.notes[last].
   * If the chord doesn’t have enough notes, we wrap or clamp.
   * @private
   * @param {string[]} chordNotes
   * @param {number} offset
   * @returns {string}
   */
  _getChordTone(chordNotes, offset) {
    // If offset is positive, move forward offset steps from the root (chordNotes[0]).
    // If offset is negative, move backwards from the root or from the last chord tone.
    // One approach: start from chordNotes[0], then add offset, wrap around.
    // Another approach: chordTones are [0..N-1], so index = (offset mod N).
    const N = chordNotes.length;

    // Let’s define “baseIndex=0 means chord root,” then we add offset and wrap
    // so index is always 0..N-1.
    let newIndex = offset >= 0 ? offset : N + offset;
    // For bigger offsets, we modulo
    newIndex = ((newIndex % N) + N) % N;

    return chordNotes[newIndex];
  }

  /**
   * Applies a “spice” approach note or dissonance to the chosen chord tone.
   * This can shift the note by 1 semitone up/down, or pick an upper extension if available.
   * You can expand this for more complex logic.
   * @private
   * @param {string} chordTone
   * @param {Object} chord - The chord object with .notes, .root, etc.
   * @param {Object} [energyState]
   * @returns {string} Possibly a new note name that’s dissonant or an approach to chordTone.
   */
  _applySpice(chordTone, chord, energyState) {
    // Example: pick ±1 semitone from the chord tone
    // or pick the highest chord note +1 semitone for tension
    // Or pick chord’s 7th or 9th if it exists
    const spiceModes = ["semitoneBelow", "semitoneAbove", "sharp9"];
    const choice = spiceModes[Math.floor(this._randomFn() * spiceModes.length)];

    switch (choice) {
      case "semitoneBelow":
        return this._transposeNote(chordTone, -1);
      case "semitoneAbove":
        return this._transposeNote(chordTone, +1);
      case "sharp9":
        // This is a bigger jump, e.g. +3 semitones from chordTone. Could be dissonant.
        return this._transposeNote(chordTone, +3);
      default:
        return chordTone;
    }
  }

  /**
   * Transposes a note name like "C4" by a certain number of semitones. Negative = down, positive = up.
   * @private
   * @param {string} noteName
   * @param {number} semitones
   * @returns {string} The transposed note name
   */
  _transposeNote(noteName, semitones) {
    const midiVal = this._toMidi(noteName);
    return this._fromMidi(midiVal + semitones);
  }

  /**
   * Converts a note name (e.g., "C4") to a MIDI integer 0..127.
   * This is a simplified utility consistent with other pattern examples.
   * @private
   */
  _toMidi(noteName) {
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
    if (typeof noteName !== "string") {
      return 60; // fallback
    }
    const match = noteName.match(/^([A-G][b#]?)(\d+)$/i);
    if (!match) return 60;
    const [_, pitch, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const semitone = noteMap[pitch] ?? 0;
    return (octave + 1) * 12 + semitone;
  }

  /**
   * Converts a MIDI note number back to string (e.g., 60 -> "C4").
   * @private
   */
  _fromMidi(midiVal) {
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
    const note = names[midiVal % 12] || "C";
    const octave = Math.floor(midiVal / 12) - 1;
    return note + octave;
  }

  /**
   * Optional: If we want to reset the pattern’s internal index or other state.
   * Called, for example, when the transport restarts or user wants a fresh cycle.
   */
  reset() {
    this._currentContourIndex = 0;
  }

  /**
   * Returns a config object describing this pattern’s settings (for debugging or serialization).
   * @returns {Object}
   */
  toConfig() {
    return {
      patternType: this.constructor.name,
      options: { ...this.options },
      currentContourIndex: this._currentContourIndex,
    };
  }
}
