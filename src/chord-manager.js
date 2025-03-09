/**
 * src/chord-manager.js
 *
 * Revised so ONLY the authorized provider can set chords.
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

    /**
     * Tracks the ID (string or number) of the one pattern/loop
     * that is allowed to set chords.
     * @private
     */
    this._authorizedProvider = null;
  }

  /**
   * Called typically by TransportManager or some setup code
   * to designate which pattern/loop is allowed to set chords.
   *
   * @param {string|number} providerId
   */
  authorizeProvider(providerId) {
    this._authorizedProvider = providerId;
  }

  /**
   * Sets the current chord info for this step IF callerId
   * matches the authorized provider.
   *
   * @param {string|number} callerId - The ID of the pattern/loop calling this.
   * @param {string} rootNote - e.g. "C4" (if you have octaves),
   *   or "C" (if you prefer just letter names).
   * @param {string[]} [chordNotes=[]] - e.g. ["C4", "E4", "G4"] or empty if no chord.
   */
  setCurrentChord(callerId, rootNote, chordNotes = []) {
    if (callerId !== this._authorizedProvider) {
      console.warn(
        `ChordManager: Unauthorized provider (${callerId}) tried to set chord. Ignoring.`
      );
      return;
    }

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
   * Clears the chord data (only the authorized provider can do so).
   */
  clearChord(callerId) {
    if (callerId !== this._authorizedProvider) {
      console.warn(
        `ChordManager: Unauthorized provider (${callerId}) tried to clear chord. Ignoring.`
      );
      return;
    }
    this.rootNote = null;
    this.chordNotes = [];
  }
}
