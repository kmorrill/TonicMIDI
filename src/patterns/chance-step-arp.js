/**
 * src/patterns/chance-step-arp.js
 *
 * A beginner-friendly ARP pattern that uses probability and simple conditional logic
 * to generate dynamic, generative arpeggiated sequences based on chord context.
 */

import { AbstractPattern } from "./pattern-interface.js";

export class ChanceStepArp extends AbstractPattern {
  /**
   * @param {Object} options
   * @param {number} [options.probabilityToAdvance=80] - % chance to move to the next note
   * @param {number} [options.restProbability=10] - % chance a step will be silent
   * @param {boolean} [options.avoidRepeats=true] - Avoid repeating the same note consecutively
   * @param {boolean} [options.rootJump=false] - If last note was root, jump to higher interval
   * @param {number} [options.velocityVariation=10] - Random velocity variation (+/-)
   * @param {number} [options.octaveRange=1] - Number of octaves to span
   * @param {number} [options.baseVelocity=100] - Default MIDI velocity
   * @param {Function} [options.randomFn=Math.random] - Function to generate random numbers
   */
  constructor({
    probabilityToAdvance = 80,
    restProbability = 10,
    avoidRepeats = true,
    rootJump = false,
    velocityVariation = 10,
    octaveRange = 1,
    baseVelocity = 100,
    randomFn = Math.random, // Default to Math.random
  } = {}) {
    super();

    this.probabilityToAdvance = probabilityToAdvance;
    this.restProbability = restProbability;
    this.avoidRepeats = avoidRepeats;
    this.rootJump = rootJump;
    this.velocityVariation = velocityVariation;
    this.octaveRange = octaveRange;
    this.baseVelocity = baseVelocity;
    this.randomFn = randomFn; // Use the provided random function

    this.patternLength = 16;
    this.currentNoteIndex = 0;
    this.lastPlayedNote = null;
  }

  /**
   * Generates notes for the current step based on probability and simple conditions
   * @param {number} stepIndex
   * @param {Object} context - Should contain chordManager
   * @returns {Array<{ note: string, velocity: number, durationSteps: number }>}
   */
  getNotes(stepIndex, context) {
    if (!context || !context.chordManager) {
      console.warn("[ChanceStepArp] No chordManager provided.");
      return [];
    }

    const chord = context.chordManager.getChord(stepIndex);
    if (!chord || !chord.notes || chord.notes.length === 0) {
      return [];
    }

    // Decide rest first
    if (this.randomFn() * 100 < this.restProbability) {
      return [];
    }

    // Decide if we should advance or repeat
    let advance = this.randomFn() * 100 < this.probabilityToAdvance;

    if (
      this.avoidRepeats &&
      this.lastPlayedNote === chord.notes[this.currentNoteIndex]
    ) {
      advance = true; // force advancement to avoid repeat
    }

    if (this.rootJump && this.lastPlayedNote === chord.notes[0]) {
      this.currentNoteIndex = chord.notes.length - 1; // Jump to highest note
    } else if (advance) {
      this.currentNoteIndex = (this.currentNoteIndex + 1) % chord.notes.length;
    }

    let note = chord.notes[this.currentNoteIndex];

    // Random octave within the range
    let octaveShift = Math.floor(this.randomFn() * this.octaveRange) * 12;
    let midiNoteNumber = this._getMidiNumber(note) + octaveShift;

    // Apply velocity variation
    let velocity = Math.min(
      127,
      Math.max(
        1,
        this.baseVelocity +
          (this.randomFn() * this.velocityVariation * 2 -
            this.velocityVariation)
      )
    );

    this.lastPlayedNote = note;

    return [
      {
        note: this._getNoteName(midiNoteNumber),
        velocity: Math.floor(velocity),
        durationSteps: 1,
      },
    ];
  }

  getLength() {
    return this.patternLength;
  }

  /**
   * Helper method to convert note name to MIDI number
   * Simplified implementation
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
    const name = noteName.slice(0, -1);
    const octave = parseInt(noteName.slice(-1), 10);
    return notes.indexOf(name) + (octave + 1) * 12;
  }

  /**
   * Helper method to convert MIDI number back to note name
   * Simplified implementation
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
