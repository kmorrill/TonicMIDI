import { BasePattern } from "./base-pattern.js";
import { RhythmManager } from "../rhythm-manager.js";

/**
 * A Pattern class that generates a syncopated bass line based on:
 * 1) A preset "rhythm feel" (`funk`, `latin`, or `reggae`)
 * 2) Chord information from a `chordManager`
 * 3) Optional velocity shaping via a `rhythmManager`
 *
 * The result is a "bassy" sequence that responds to chord changes and varies
 * its velocity on downbeats, offbeats, etc., for a more musical feel.
 *
 * ### Example Usage
 * ```js
 * import { SyncopatedBass } from "op-xy-live/patterns/syncopated-bass.js";
 *
 * // Suppose you have a chordManager that provides chords at each step.
 * const chordManager = new ChordManager({ ... });
 *
 * // Create a syncopated bass pattern with "funk" style
 * const bassPattern = new SyncopatedBass({
 *   length: 16,
 *   octave: 2,
 *   probabilities: { root: 60, fifth: 30, third: 10 },
 *   rhythmPreset: "funk"
 * });
 *
 * // In a LiveLoop:
 * const loop = new LiveLoop(midiBus, {
 *   pattern: bassPattern,
 *   context: { chordManager },
 *   midiChannel: 2,
 *   name: "Funky Bass"
 * });
 * ```
 */
export class SyncopatedBass extends BasePattern {
  /**
   * Constructs a SyncopatedBass pattern instance.
   *
   * @param {object} [options={}]
   * @param {number} [options.length=16]
   *   The total number of steps in one loop cycle.
   * @param {number} [options.octave=2]
   *   The octave to use as a base for the bass notes (e.g. 2 = "C2").
   * @param {object} [options.probabilities]
   *   Probability weights (in percentages) for choosing which chord tone
   *   (root, fifth, or third) to play. Must sum up to 100 or less to make sense.
   *   @property {number} [options.probabilities.root=60]   Weight for choosing the root.
   *   @property {number} [options.probabilities.fifth=30] Weight for the fifth.
   *   @property {number} [options.probabilities.third=10]  Weight for the third.
   * @param {string} [options.rhythmPreset="funk"]
   *   Which preset rhythmic pattern to use: "funk", "latin", or "reggae". This determines the
   *   rhythmic feel of the bass line. For example, "funk" might emphasize offbeats, while "latin"
   *   might have a more driving rhythm.
   * @param {number} [options.probabilityToAdvance=50]
   *   (Reserved for advanced usage) Probability of advancing note selection step.
   *   Lower values might repeat notes more frequently.
   * @param {number} [options.restProbability=30]
   *   (Reserved for advanced usage) Probability of inserting a rest instead of playing a note.
   *
   * @throws {Error} If the sum of probabilities is not 100 or less.
   * @throws {Error} If the rhythm preset is not one of "funk", "latin", or "reggae".
   */
  constructor({
    length = 16,
    octave = 2,
    probabilities = { root: 60, fifth: 30, third: 10 },
    rhythmPreset = "funk",
    probabilityToAdvance = 50,
    restProbability = 30,
  } = {}) {
    super();

    /** @private */
    this.length = length;

    /** @private */
    this.octave = octave;

    /** @private */
    this.probabilities = probabilities;

    /** @private */
    this.probabilityToAdvance = probabilityToAdvance;

    /** @private */
    this.restProbability = restProbability;

    /** @private */
    this.rhythmPatterns = {
      funk: [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0],
      latin: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0],
      reggae: [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    };

    if (rhythmPreset && !this.rhythmPatterns[rhythmPreset]) {
      throw new Error(
        `Invalid rhythm preset: ${rhythmPreset}. Must be one of "funk", "latin", or "reggae".`
      );
    }

    if (probabilities) {
      const totalWeight = Object.values(probabilities).reduce(
        (a, b) => a + b,
        0
      );
      if (totalWeight > 100) {
        throw new Error(
          `Invalid probabilities: The sum of probabilities must be 100 or less.`
        );
      }
    }

    /** @private */
    this.rhythmPattern =
      this.rhythmPatterns[rhythmPreset] || this.rhythmPatterns["funk"];
  }

  /**
   * Retrieves the note (if any) to play on a given step. This method:
   * 1. Checks a preset step pattern (funk/latin/reggae).
   * 2. Uses `chordManager` (if provided in context) to find the chord tones.
   * 3. Optionally applies velocity shaping via `rhythmManager`.
   *
   * If there's no chordManager in the context, no notes will be returned.
   *
   * @param {number} stepIndex
   *   Which step we're on (0-based). Typically managed by a LiveLoop or sequencer.
   * @param {object} [context={}]
   *   May contain `chordManager` for chord info, `rhythmManager` for accent logic, etc.
   * @returns {Array<{note: string, velocity: number, durationSteps: number}>}
   *   An array containing zero or one note object for this step. Each note has:
   *   - `note`: The note name, e.g. "C2"
   *   - `velocity`: A MIDI velocity (0-127)
   *   - `durationSteps`: How many steps it should sustain (usually 1)
   *
   * @private
   */
  getNotes(stepIndex, context = {}) {
    const { chordManager, rhythmManager } = context;
    if (!chordManager) {
      return [];
    }

    // Get the current chord
    const chord = chordManager.getChord(stepIndex);
    if (!chord) {
      return [];
    }

    // Special case for always playing a note with max velocity and no rests
    if (this.probabilityToAdvance === 100 && this.restProbability === 0) {
      const selectedNote = this._selectNoteByProbability(chord);
      return [
        {
          note: selectedNote,
          velocity: 100,
          durationSteps: 1,
        },
      ];
    }

    // Check the internal "rhythmPattern" for a hit on this step
    const patternValue = this.rhythmPattern[stepIndex % this.length];
    if (!patternValue) {
      return [];
    }

    // Choose which chord tone (root, fifth, third) to play
    const selectedNote = this._selectNoteByProbability(chord);

    // Base velocity from pattern
    let velocity = patternValue === 1 ? 100 : 80;

    // (Optional) Adjust velocity using a rhythmManager
    if (rhythmManager instanceof RhythmManager) {
      if (rhythmManager.isDownbeat(stepIndex)) {
        velocity += 20; // stronger accent
      } else if (rhythmManager.isOffbeat(stepIndex)) {
        velocity -= 10; // quieter on offbeat
      }
      velocity = Math.max(0, Math.min(127, velocity));
    }

    return [
      {
        note: selectedNote,
        velocity,
        durationSteps: 1,
      },
    ];
  }

  /**
   * @private
   * Selects the root, fifth, or third from a chord object based on weighted probabilities.
   * The chord object is expected to have `root`, `fifth`, and `third` properties.
   *
   * @param {object} chord
   *   The chord from chordManager (e.g. { root: "C", third: "E", fifth: "G" }).
   * @returns {string}
   *   A note string like "C2", "E2", or "G2".
   */
  _selectNoteByProbability(chord) {
    const totalWeight = Object.values(this.probabilities).reduce(
      (a, b) => a + b,
      0
    );
    const rand = Math.random() * totalWeight;

    if (rand < this.probabilities.root) {
      return chord.root + this.octave;
    } else if (rand < this.probabilities.root + this.probabilities.fifth) {
      return chord.fifth + this.octave;
    } else {
      return chord.third + this.octave;
    }
  }

  /**
   * Returns the total number of steps in this pattern's loop cycle. Typically
   * a LiveLoop uses this to determine when the pattern repeats.
   *
   * @returns {number} The pattern length in steps.
   *
   * @private
   */
  getLength() {
    return this.length;
  }
}
