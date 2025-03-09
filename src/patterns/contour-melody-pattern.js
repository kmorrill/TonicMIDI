/**
 * src/patterns/contour-melody-pattern.js
 *
 * A pattern that follows a user-defined melodic contour relative to each chord,
 * optionally adding "spice" or approach notes. Throws an error if no chord is
 * available via chordManager.getCurrentChordNotes().
 *
 * Usage Example:
 *   const pattern = new ContourMelodyPattern({
 *     contour: [0, 1, 2, 1],
 *     spiceProbability: 15,
 *     length: 16,
 *   });
 *
 *   // Then in a LiveLoop context:
 *   const loop = new LiveLoop(midiBus, {
 *     pattern,
 *     context: { chordManager, energyManager, rhythmManager },
 *   });
 */

import { BasePattern } from "./base-pattern.js";

/**
 * @typedef {Object} ContourMelodyOptions
 * @property {number[]} [contour=[0]]
 *   An array of integers representing "chord-tone index offsets" or steps in chord-tone space.
 *   Example: [0, 1, 2, 1, -1].
 *   Index 0 = chord root (the 0th note in chordManager.getCurrentChordNotes()).
 *   Index 1 = next chord tone, etc.
 *   Negative offsets step backward in the chord tones array.
 * @property {number} [length=16]
 *   The number of steps before the pattern conceptually loops.
 * @property {boolean} [allowRests=false]
 *   If true, you can randomly skip steps or rest.
 * @property {number} [restProbability=0]
 *   Probability (0..100) of generating a rest on a given step (only if allowRests=true).
 * @property {number} [spiceProbability=0]
 *   Probability (0..100) that we deviate from the pure chord tone to an approach/dissonance note.
 *   Higher tension might also increase this.
 * @property {function} [randomFn=Math.random]
 *   A custom random function for deterministic usage in tests.
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
     * An array describing chord-tone index offsets, e.g. [0, 1, 2, -1].
     * @private
     * @type {number[]}
     */
    this.contour = contour;

    /**
     * Pattern length in steps. The pattern cycles through the contour every step,
     * or you can do custom logic in getNotes to change how often you move the contour index.
     * @private
     * @type {number}
     */
    this.patternLength = length;

    /**
     * If true, we might rest on some steps (skip playing) based on `restProbability`.
     * @private
     * @type {boolean}
     */
    this.allowRests = allowRests;

    /**
     * Probability (0..100) of resting on a step if `allowRests = true`.
     * @private
     * @type {number}
     */
    this.restProbability = restProbability;

    /**
     * Probability (0..100) of adding a “spice” approach note (dissonance).
     * @private
     * @type {number}
     */
    this.spiceProbability = spiceProbability;

    /**
     * Custom random function, allowing deterministic tests or a seeded RNG.
     * @private
     */
    this._randomFn = randomFn;

    /**
     * Tracks which index in the contour array we’re on.
     * @private
     * @type {number}
     */
    this._currentContourIndex = 0;

    // Validate inputs
    if (!Array.isArray(this.contour) || this.contour.length === 0) {
      throw new Error(
        "[ContourMelodyPattern] 'contour' must be a non-empty array of integers."
      );
    }
  }

  /**
   * Called each step by the LiveLoop. We read the current chord from chordManager
   * (just root + chord notes). If there’s no chord, we can throw an error or return [].
   * Then we pick the next chord tone according to `this.contour`, possibly apply spice,
   * and return a single note.
   *
   * @param {number} stepIndex
   * @param {object} context - Typically includes { chordManager, energyManager, rhythmManager, ... }
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   */
  getNotes(stepIndex, context = {}) {
    const { chordManager, rhythmManager, energyManager } = context;
    if (!chordManager) {
      // Must have chordManager to harmonize
      throw new Error(
        "[ContourMelodyPattern] No chordManager in context. Cannot harmonize."
      );
    }

    // 1) Retrieve chord info from chordManager
    const rootNote = chordManager.getCurrentRootNote();
    const chordNotes = chordManager.getCurrentChordNotes();

    if (!rootNote || !Array.isArray(chordNotes) || chordNotes.length === 0) {
      // No chord is set right now. You can return [] or throw an error.
      throw new Error(
        "[ContourMelodyPattern] No chord or chord notes available. Cannot harmonize."
      );
    }

    // 2) Optionally skip offbeats or do other logic with rhythmManager
    if (rhythmManager) {
      // E.g., skip if not a beat:
      // if (!rhythmManager.isBeat(stepIndex)) {
      //   return [];
      // }
    }

    // 3) Possibly rest
    if (this.allowRests && this._randomFn() * 100 < this.restProbability) {
      return [];
    }

    // 4) Possibly adjust spiceProbability based on tension level
    let actualSpiceProb = this.spiceProbability;
    if (energyManager && typeof energyManager.getTensionLevel === "function") {
      const tensionLevel = energyManager.getTensionLevel();
      switch (tensionLevel) {
        case "low":
          actualSpiceProb *= 0.5; // reduce chance of spice
          break;
        case "high":
          actualSpiceProb *= 2.0; // double chance
          break;
        case "mid":
        default:
          // no change
          break;
      }
      actualSpiceProb = Math.min(actualSpiceProb, 100);
    }

    // 5) Pick a chord tone from the contour
    const offset = this.contour[this._currentContourIndex];
    const chordTone = this._getChordTone(chordNotes, offset);

    // Move to next contour index
    this._currentContourIndex =
      (this._currentContourIndex + 1) % this.contour.length;

    // 6) Possibly add spice
    let finalNote = chordTone;
    if (this._randomFn() * 100 < actualSpiceProb) {
      finalNote = this._applySpice(chordTone);
    }

    // 7) Decide velocity
    let velocity = 100;
    if (rhythmManager && rhythmManager.isDownbeat(stepIndex)) {
      velocity = 120; // accent on downbeat
    }

    // 8) Return a single note
    return [
      {
        note: finalNote,
        velocity,
        durationSteps: 1,
      },
    ];
  }

  /**
   * Return the pattern length in steps. Typically the LiveLoop uses this to loop the pattern,
   * though the chord changes come from chordManager (already updated by the chord provider).
   *
   * @returns {number}
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Resets internal state if needed. For instance, resets _currentContourIndex to 0.
   */
  reset() {
    this._currentContourIndex = 0;
  }

  /**
   * Picks the chord tone from chordNotes, given an offset in “chord tone space.”
   * e.g. offset=0 => chordNotes[0], offset=1 => chordNotes[1], offset=-1 => chordNotes[last].
   * If we go out of range, we wrap around mod chordNotes.length.
   *
   * @private
   * @param {string[]} chordNotes
   * @param {number} offset
   * @returns {string} e.g. "E4" if chordNotes = ["C4","E4","G4","B4"] and offset=1
   */
  _getChordTone(chordNotes, offset) {
    const N = chordNotes.length;
    // wrap offset mod N
    let newIndex = offset >= 0 ? offset : N + offset;
    newIndex = ((newIndex % N) + N) % N;
    return chordNotes[newIndex];
  }

  /**
   * Applies a “spice” approach note or dissonance. Example: ±1 semitone or +3 semitones.
   *
   * @private
   * @param {string} chordTone - e.g. "E4"
   * @returns {string} Possibly a transposed note name, e.g. "F4"
   */
  _applySpice(chordTone) {
    const spiceModes = ["semitoneBelow", "semitoneAbove", "sharp9"];
    const choice = spiceModes[Math.floor(this._randomFn() * spiceModes.length)];

    switch (choice) {
      case "semitoneBelow":
        return this._transposeSemitones(chordTone, -1);
      case "semitoneAbove":
        return this._transposeSemitones(chordTone, +1);
      case "sharp9":
        // e.g. +3 semitones from chordTone
        return this._transposeSemitones(chordTone, +3);
      default:
        return chordTone;
    }
  }

  /**
   * Transpose a note name (like "C4") by `n` semitones.
   * Negative = down, positive = up.
   *
   * @private
   * @param {string} noteName
   * @param {number} semitones
   * @returns {string} new note name
   */
  _transposeSemitones(noteName, semitones) {
    const midiVal = this._noteNameToMidi(noteName);
    return this._midiToNoteName(midiVal + semitones);
  }

  /**
   * Simple function to convert "C4" -> 60, "A#3" -> 46, etc.
   *
   * @private
   * @param {string} noteName
   * @returns {number}
   */
  _noteNameToMidi(noteName) {
    if (typeof noteName !== "string") {
      return 60; // fallback
    }
    const map = {
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
    const match = noteName.match(/^([A-G][b#]?)(\d+)$/i);
    if (!match) return 60; // fallback if parse fails
    const [_, pitch, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const semitone = map[pitch] ?? 0;
    return (octave + 1) * 12 + semitone;
  }

  /**
   * Convert MIDI -> note name, e.g. 60 -> "C4".
   *
   * @private
   * @param {number} midiVal
   * @returns {string}
   */
  _midiToNoteName(midiVal) {
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
    const clamped = Math.max(0, Math.min(127, midiVal));
    const note = noteNames[clamped % 12];
    const octave = Math.floor(clamped / 12) - 1;
    return note + octave;
  }

  /**
   * For debugging or serialization.
   * @returns {Object}
   */
  toConfig() {
    return {
      patternType: this.constructor.name,
      options: {
        contour: this.contour,
        length: this.patternLength,
        allowRests: this.allowRests,
        restProbability: this.restProbability,
        spiceProbability: this.spiceProbability,
      },
      currentContourIndex: this._currentContourIndex,
    };
  }
}
