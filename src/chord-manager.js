/**
 * src/chord-manager.js
 *
 * A *simplified* ChordManager that tracks only the current chord
 * (root note + chord notes) for a given beat or step. Exactly one
 * pattern (the “chord provider”) is responsible for calling
 * setCurrentChord() each time the chord changes or each step.
 */

export class ChordManager {
  constructor() {
    /**
     * The current root note, e.g. "C4".
     * If no chord is set, it can be null.
     * @type {string|null}
     */
    this.rootNote = null;

    /**
     * An array of note names representing the chord tones, e.g. ["C4", "E4", "G4"].
     * @type {string[]}
     */
    this.chordNotes = [];
  }

  /**
   * Sets the current chord info for this step.
   * Typically called by the "chord provider" pattern.
   *
   * @param {string} rootNote - e.g. "C4" (if you have octaves),
   *   or "C" (if you prefer just letter names)
   * @param {string[]} [chordNotes=[]] - e.g. ["C4", "E4", "G4"] or empty if no chord
   */
  setCurrentChord(rootNote, chordNotes = []) {
    this.rootNote = rootNote;
    this.chordNotes = chordNotes;
  }

  /**
   * Returns the current root note name or null if none is set.
   * @returns {string|null}
   */
  getCurrentRootNote() {
    return this.rootNote;
  }

  /**
   * Returns an array of chord note names for the current beat.
   * @returns {string[]}
   */
  getCurrentChordNotes() {
    return this.chordNotes;
  }

  /**
   * Clears the chord data. Useful if you want to explicitly blank it out
   * at certain times. This is optional.
   */
  clearChord() {
    this.rootNote = null;
    this.chordNotes = [];
  }
}
