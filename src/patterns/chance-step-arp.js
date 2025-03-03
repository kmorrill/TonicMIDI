/**
 * src/patterns/chance-step-arp.js
 *
 * A beginner-friendly, probability-based arpeggiator pattern. On each step, it
 * decides whether to advance to a new chord tone, repeat the current tone, or
 * play no note at all (rest). This creates a somewhat generative, "chancy" ARP line,
 * driven by the chord data from a `chordManager`.
 *
 * **Key Concepts**:
 * - You can specify the probability of advancing to the next note (`probabilityToAdvance`)
 *   or resting (`restProbability`).
 * - You can avoid repeating the same note (`avoidRepeats`).
 * - You can shift up to a higher note if the last note was the root (`rootJump`).
 * - Velocity can be varied by `velocityVariation`.
 * - You can also randomize which octave a note appears in within `octaveRange`.
 */

import { BasePattern } from "./base-pattern.js";

export class ChanceStepArp extends BasePattern {
  /**
   * Create a ChanceStepArp pattern with a set of probabilistic rules.
   *
   * @param {object} [options={}]
   * @param {number} [options.probabilityToAdvance=80]
   *   Percent chance (0..100) that the pattern will move to the next chord note
   *   rather than repeating the current one. (If `avoidRepeats` is true and the
   *   current note matches the last note, we force an advance anyway.)
   * @param {number} [options.restProbability=10]
   *   Percent chance (0..100) that the pattern will produce a rest (no note) at a step.
   * @param {boolean} [options.avoidRepeats=true]
   *   If true, do not allow the same chord note to play consecutively. Forces an advance
   *   if the next note would match the lastPlayedNote.
   * @param {boolean} [options.rootJump=false]
   *   If true, and the last note played was the chord's root note, jump directly to the
   *   highest chord note on the next step (instead of going to the next note in sequence).
   * @param {number} [options.velocityVariation=10]
   *   Range of random velocity variation (+/-). If baseVelocity=100, then actual velocity
   *   can fluctuate between 90..110 (clamped to 1..127).
   * @param {number} [options.octaveRange=1]
   *   How many octaves above the chord note we can randomly shift. E.g., if it's 2,
   *   we can shift chord notes by 0, 12, or 24 semitones.
   * @param {number} [options.baseVelocity=100]
   *   A baseline velocity for the notes before randomization.
   * @param {Function} [options.randomFn=Math.random]
   *   A custom random function if you want deterministic results (e.g., for tests).
   */
  constructor({
    probabilityToAdvance = 80,
    restProbability = 10,
    avoidRepeats = true,
    rootJump = false,
    velocityVariation = 10,
    octaveRange = 1,
    baseVelocity = 100,
    randomFn = Math.random,
  } = {}) {
    // Pass all constructor params to the BasePattern's `options`.
    super({
      probabilityToAdvance,
      restProbability,
      avoidRepeats,
      rootJump,
      velocityVariation,
      octaveRange,
      baseVelocity,
      randomFn,
    });

    // Store them as direct fields (private or otherwise) for internal use.
    this.probabilityToAdvance = probabilityToAdvance;

    /** @private */
    this.restProbability = restProbability;

    /** @private */
    this.avoidRepeats = avoidRepeats;

    /** @private */
    this.rootJump = rootJump;

    /** @private */
    this.velocityVariation = velocityVariation;

    /** @private */
    this.octaveRange = octaveRange;

    /** @private */
    this.baseVelocity = baseVelocity;

    /** @private */
    this.randomFn = randomFn;

    /** @private */
    this.patternLength = 16; // Arbitrary pattern length (for potential looping logic)

    /** @private */
    this.currentNoteIndex = 0;

    /** @private */
    this.lastPlayedNote = null;
  }

  /**
   * Decide which note to play on a given step, using the chord from `chordManager`.
   *
   * **Flow**:
   * 1. Check `chordManager.getChord(stepIndex)` for chord data (must have `chord.notes`).
   * 2. Possibly rest (based on `restProbability`).
   * 3. Decide whether to advance to the next note or repeat (based on `probabilityToAdvance`),
   *    but also force an advance if `avoidRepeats` is true and the last note is the same.
   * 4. If `rootJump` is enabled and last note was chord.notes[0] (root), jump to chord.notes[chordLength - 1].
   * 5. Randomly shift the selected chord note up to `octaveRange` octaves above.
   * 6. Add a random velocity variation (`velocityVariation`).
   *
   * @param {number} stepIndex
   *   The current step index. Typically increments every "tick" from a LiveLoop or sequencer.
   * @param {object} context
   *   The pattern context. **Must** contain a `chordManager` with `getChord()` returning an object
   *   like `{ notes: ["C4", "E4", "G4", "Bb4"] }`. If none is provided, returns empty array.
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   *   An array containing zero or one note object. May be empty if we decide to rest or if chord is empty.
   *
   * @private
   */
  getNotes(stepIndex, context) {
    if (!context || !context.chordManager) {
      console.warn("[ChanceStepArp] No chordManager provided.");
      return [];
    }

    const chord = context.chordManager.getChord(stepIndex);
    if (!chord || !Array.isArray(chord.notes) || chord.notes.length === 0) {
      return [];
    }

    // 1) Possibly rest
    if (this.randomFn() * 100 < this.restProbability) {
      return [];
    }

    // 2) Decide whether to advance
    let advance = this.randomFn() * 100 < this.probabilityToAdvance;

    // Force an advance if we want to avoid repeats and last note is the same
    if (
      this.avoidRepeats &&
      this.lastPlayedNote === chord.notes[this.currentNoteIndex]
    ) {
      advance = true;
    }

    // 3) If rootJump is true and lastPlayedNote was chord root, jump to highest chord note
    if (this.rootJump && this.lastPlayedNote === chord.notes[0]) {
      this.currentNoteIndex = chord.notes.length - 1;
    }
    // otherwise, if we decided to advance
    else if (advance) {
      this.currentNoteIndex = (this.currentNoteIndex + 1) % chord.notes.length;
    }

    // 4) Select the note
    const selectedNoteName = chord.notes[this.currentNoteIndex];

    // 5) Random octave shift
    const octaveShift = Math.floor(this.randomFn() * this.octaveRange) * 12;
    const midiNoteNumber = this._getMidiNumber(selectedNoteName) + octaveShift;

    // 6) Random velocity variation
    const rawVelocity =
      this.baseVelocity +
      (this.randomFn() * this.velocityVariation * 2 - this.velocityVariation);
    const velocity = Math.max(1, Math.min(127, Math.floor(rawVelocity)));

    this.lastPlayedNote = selectedNoteName;

    return [
      {
        note: this._getNoteName(midiNoteNumber),
        velocity,
        durationSteps: 1,
      },
    ];
  }

  /**
   * The total pattern length, used for modulo wrapping in some sequencers.
   * This ARP pattern uses a fixed length of 16 steps if you want a looping context.
   *
   * @returns {number}
   *   Always 16. You can modify if you want a different conceptual step length.
   *
   * @private
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * @private
   * Convert a note name like "C4" to a MIDI note number. Simplified method.
   */
  _getMidiNumber(noteName) {
    const notes = [
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
    // last char is octave, everything else is note name
    const name = noteName.slice(0, -1);
    const octave = parseInt(noteName.slice(-1), 10);
    return notes.indexOf(name) + (octave + 1) * 12;
  }

  /**
   * @private
   * Convert a MIDI note number back to a note name like "C4". Simplified method.
   */
  _getNoteName(midiNumber) {
    const notes = [
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
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    return notes[noteIndex] + octave;
  }
}
