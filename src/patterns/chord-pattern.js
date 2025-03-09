// File: src/patterns/chord-pattern.js

import { BasePattern } from "./base-pattern.js";

/**
 * A chord provider pattern that cycles through a chord progression,
 * each chord occupying `chord.duration` steps in a loop.
 *
 * On each step, it finds which chord is active, possibly applies tension expansions,
 * and calls chordManager.setCurrentChord(...) with the new chord notes. It then
 * returns those notes as an array of { note, velocity, durationSteps } objects.
 *
 * If you only want to “hit” the chord at the start of its duration (once per chord),
 * you can adjust `_shouldPlayChordThisStep()` below. If you prefer to re-trigger each step,
 * keep it simpler and return the chord on all steps in that chord’s range.
 */
export class ChordPattern extends BasePattern {
  /**
   * @typedef {Object} ChordDescriptor
   * @property {string} root - e.g. "C"
   * @property {string} type - e.g. "maj", "min", etc.
   * @property {number} duration - how many steps this chord lasts
   * @property {string[]} [notes] - if you want to specify chord notes explicitly
   *
   * @param {Object} options
   * @param {ChordDescriptor[]} [options.progression=[]]
   *   The chord progression. e.g. [
   *     { root:"C", type:"maj", duration:16 },
   *     { root:"F", type:"maj", duration:16 },
   *   ]
   * @param {number} [options.length=16]
   *   A “reference” pattern length if needed by the base class. Doesn’t affect chord durations directly.
   */
  constructor({ progression = [], ...rest } = {}) {
    super(rest);

    /**
     * The chord progression array. Each chord has:
     *   { root, type, duration, [notes], ... }
     */
    this.progression = progression;

    /**
     * Compute total steps in the progression for looping.
     * e.g. if each chord has duration=16, and we have 2 chords, total=32 steps.
     * So we do stepIndex % 32 to see where in the progression we are.
     */
    this._progressionTotalSteps = progression.reduce(
      (sum, chord) => sum + (chord.duration || 16),
      0
    );
  }

  /**
   * Called each step by the LiveLoop.
   * We:
   *   1) find which chord is active
   *   2) optionally expand chord type for tension=high
   *   3) build chord notes
   *   4) set them in chordManager
   *   5) optionally decide if we re-trigger notes on all steps or just boundary
   */
  getNotes(stepIndex, context) {
    const chordManager = context?.chordManager;
    if (!chordManager) {
      console.warn(
        "[ChordPattern] No chordManager in context. Returning no notes."
      );
      return [];
    }

    // If we have tension=high or something else from energyManager, read it.
    const tension = context?.energyManager?.getTensionLevel?.() || 
                    context?.energyState?.tensionLevel || "none";

    // Identify which chord is active at this step
    const chordObj = this._findChordForStep(stepIndex);
    if (!chordObj || !chordObj.root) {
      console.warn("[ChordPattern] Invalid chord object for step", stepIndex);
      return [];
    }

    // Possibly expand chord type if tension=high
    let finalType = chordObj.type || "maj";
    if (tension === "high") {
      finalType = this._applyHighTension(finalType);
    }

    // Build chord notes
    let chordNotes;
    if (chordObj.notes && chordObj.notes.length > 0) {
      // If chordObj has explicit notes, we can use them directly
      chordNotes = chordObj.notes;
    } else {
      // Otherwise build from root + intervals
      chordNotes = this._buildChordFromRootAndType(chordObj.root, finalType);
    }

    // Set chord in chordManager
    chordManager.setCurrentChord(
      chordObj.root + "4", // or parse octaves if you prefer
      chordNotes
    );

    // Decide if we want to actually return chord notes on this step
    // e.g. only on boundary? or every step in chord’s duration?
    if (!this._shouldPlayChordThisStep(stepIndex, chordObj)) {
      return [];
    }

    // Return the chord as note objects
    const velocity = 90; // or vary as needed
    const durSteps = chordObj.duration || 1;
    return chordNotes.map((noteName) => ({
      note: noteName,
      velocity,
      durationSteps: durSteps,
    }));
  }

  /**
   * Finds the chord in progression for the given stepIndex, looping the progression.
   *
   * @private
   * @param {number} stepIndex
   * @returns {ChordDescriptor} e.g. { root:"C", type:"maj", duration:16, ... }
   */
  _findChordForStep(stepIndex) {
    if (!this.progression.length) return null;

    // If we have total steps = e.g. 32, we do stepIndex % 32 => modStep
    // If the stepIndex is greater than or equal to the total progression steps,
    // then stay on the last chord but don't play any new notes
    if (this._progressionTotalSteps > 0 && stepIndex >= this._progressionTotalSteps) {
      // We're beyond the end of the progression, return the last chord
      return this.progression[this.progression.length - 1];
    }

    // Otherwise, find which chord is active for this step
    const modStep = (this._progressionTotalSteps > 0) 
                    ? stepIndex % this._progressionTotalSteps 
                    : 0;

    let cumulative = 0;
    for (const chord of this.progression) {
      const chordDur = chord.duration || 16;
      if (modStep >= cumulative && modStep < cumulative + chordDur) {
        return chord;
      }
      cumulative += chordDur;
    }

    // Fallback if something strange
    return this.progression[this.progression.length - 1];
  }

  /**
   * Example logic: only play chord notes once at the boundary (modStep===cumulative).
   * If you want to re-trigger every step in chord’s range, return true all the time.
   *
   * @private
   */
  _shouldPlayChordThisStep(stepIndex, chordObj) {
    // This function decides whether to play the chord at the current step.
    // We only want to play a chord at the exact step where it begins in the progression.
    
    // Don't play any notes beyond the total progression length
    if (this._progressionTotalSteps > 0 && stepIndex >= this._progressionTotalSteps) {
      return false;
    }
    
    // Get which step we are within the total progression
    const modStep = (this._progressionTotalSteps > 0) 
                    ? stepIndex % this._progressionTotalSteps 
                    : 0;
    
    // Calculate chord boundaries and check if we're exactly at the start of this chord
    let startStep = 0;
    for (const chord of this.progression) {
      const chordDur = chord.duration || 16;
      
      // If we're at the exact start step for a chord
      if (modStep === startStep) {
        // Only play if this is the active chord (redundant check but keeping for safety)
        return chord === chordObj;
      }
      
      startStep += chordDur;
    }
    
    // Not at any chord boundary, don't play
    return false;
  }

  /**
   * Apply tension expansions for "high" tension. Example:
   *  - "maj" => "maj7#11"
   *  - "min" => "min7b5"
   *
   * @private
   * @param {string} type
   * @returns {string} expanded chord type
   */
  _applyHighTension(type) {
    if (type === "maj") return "maj7#11";
    // add more if needed
    return type;
  }

  /**
   * Builds chord notes from root e.g. "C" + chordType e.g. "maj7#11".
   *
   * @private
   */
  _buildChordFromRootAndType(root, chordType) {
    const intervals = this._getIntervalsForChordType(chordType);
    const rootMidi = this._rootToMidi(root);
    return intervals.map((i) => this._midiToNoteName(rootMidi + i));
  }

  /**
   * Returns an array of semitone offsets for chord types. For tension expansions, include e.g. "maj7#11": [0,4,7,11,18].
   * @private
   */
  _getIntervalsForChordType(chordType) {
    const chordIntervals = {
      maj: [0, 4, 7],
      "maj7#11": [0, 4, 7, 11, 18],
      "7": [0, 4, 7, 10], // Dominant 7th chord: 1-3-5-b7
      // add more as needed
    };
    return chordIntervals[chordType] || [0, 4, 7];
  }

  /**
   * Converts root letter -> a MIDI base note. E.g. "C" => 60, "D" => 62, etc.
   * Extend if you want accidentals or full parsing.
   * @private
   */
  _rootToMidi(rootLetter) {
    // minimal
    const map = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
    return map[rootLetter] ?? 60;
  }

  /**
   * Simple MIDI => note name. You can do a more full approach if needed.
   * @private
   */
  _midiToNoteName(midiVal) {
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
    const noteIndex = midiVal % 12;
    const octave = Math.floor(midiVal / 12) - 1;
    return notes[noteIndex] + octave;
  }
}
