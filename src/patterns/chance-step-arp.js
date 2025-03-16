import { BasePattern } from "./base-pattern.js";

export class ChanceStepArp extends BasePattern {
  /**
   * @typedef {Object} ChanceStepArpOptions
   * @property {number} [patternLength=16]
   *   How many steps before the pattern loops. Commonly 16 if you want a 1-bar pattern (with 16 sub-steps).
   * @property {number} [advanceProbability=0.7]
   *   Base chance (0..1) that we move forward to the *next* chord tone on each step
   *   (as opposed to repeating the same one).
   * @property {number} [restProbability=0.1]
   *   Base chance (0..1) that we insert a rest (no note) on a given step.
   * @property {number} [baseVelocity=90]
   *   A central velocity for notes. We can scale this if hype is high or if it’s a downbeat, etc.
   * @property {number} [tensionApproachProb=0.2]
   *   A baseline probability (0..1) that we add a semitone “approach note” if tension is mid/high.
   * @property {Function} [randomFn=Math.random]
   *   Optional custom random generator for deterministic usage or seeded RNG.
   */

  /**
   * Creates a ChanceStepArp that cycles chord tones with “chance-based” steps.
   *
   * @param {ChanceStepArpOptions} [options={}]
   */
  constructor({
    patternLength = 16,
    advanceProbability = 0.7,
    restProbability = 0.1,
    baseVelocity = 90,
    tensionApproachProb = 0.2,
    randomFn = Math.random,
  } = {}) {
    super({ ...arguments[0] }); // store in this.options if you like

    this.patternLength = patternLength;
    this.advanceProbability = advanceProbability;
    this.restProbability = restProbability;
    this.baseVelocity = baseVelocity;
    this.tensionApproachProb = tensionApproachProb;
    this.randomFn = randomFn;

    // Internal state for tracking which chord-tone index we’re on
    this._currentToneIndex = 0;
    this._lastNotePlayed = null;
  }

  getLength() {
    return this.patternLength;
  }

  /**
   * Called every step by the LiveLoop.
   * We'll read chord data from chordManager, tension/hype from energyManager,
   * and (optionally) accent/beat from rhythmManager.
   *
   * @param {number} stepIndex
   * @param {object} context
   *   Typically includes { chordManager, energyManager, rhythmManager, ... }
   * @returns {Array<{note:string|number, velocity:number, durationSteps:number}>}
   */
  getNotes(stepIndex, context = {}) {
    const { chordManager, energyManager, rhythmManager } = context;

    // 1) If no chordManager or no chord is present, skip
    if (!chordManager) return [];
    const chordNotes = chordManager.getCurrentChordNotes() || [];
    if (!chordNotes.length) return [];

    // 2) Possibly skip if restProbability or if we only play on main beats, etc.
    let doRest = this.randomFn() < this.restProbability;
    // (Optionally adapt restProbability if tension=none => more rests, tension=high => fewer rests)
    if (energyManager) {
      const tension = energyManager.getTensionLevel?.() || "none";
      if (tension === "high") {
        doRest = this.randomFn() < this.restProbability * 0.5; // fewer rests
      }
    }
    if (doRest) return [];

    // 3) Possibly skip if we only want to place notes on quarter beats:
    if (rhythmManager && !rhythmManager.isBeat(stepIndex)) {
      // Or if you want “ARP every 8th,” etc.:
      // if (stepIndex % 2 !== 0) return [];
      // For now, we won't skip, but you *could* incorporate such logic
    }

    // 4) Decide whether to move to next chord tone
    let doAdvance = this.randomFn() < this.advanceProbability;
    // If we want to avoid repeating the same note, or if tension is high => more frequent moves
    if (energyManager) {
      const hype = energyManager.getHypeLevel?.() || "low";
      if (hype === "high" && this.randomFn() < 0.3) {
        doAdvance = true; // forcibly advance sometimes
      }
    }
    if (doAdvance) {
      this._currentToneIndex = (this._currentToneIndex + 1) % chordNotes.length;
    }

    // 5) Pick the chord note
    let chosenNoteName = chordNotes[this._currentToneIndex];
    this._lastNotePlayed = chosenNoteName;

    // 6) Possibly do tension approach note
    // If tension >= “mid” => chance to do a ±1 semitone from chord tone
    if (energyManager) {
      const tension = energyManager.getTensionLevel?.() || "none";
      let tFactor = 1.0;
      switch (tension) {
        case "low":
          tFactor = 0.5;
          break;
        case "mid":
          tFactor = 1.5;
          break;
        case "high":
          tFactor = 2.5;
          break;
      }
      const actualProb = this.tensionApproachProb * tFactor;
      if (this.randomFn() < actualProb) {
        // approach => ±1 semitone
        chosenNoteName = this._applyApproach(chosenNoteName);
      }
    }

    // 7) Decide velocity
    let velocity = this.baseVelocity;
    if (rhythmManager) {
      // if downbeat => bump velocity
      if (rhythmManager.isDownbeat(stepIndex)) velocity += 15;
      else if (rhythmManager.isOffbeat(stepIndex)) velocity -= 10;
    }
    // If hype=high => scale velocity
    if (energyManager) {
      const hype = energyManager.getHypeLevel?.() || "low";
      if (hype === "medium") velocity += 10;
      if (hype === "high") velocity += 20;
      velocity = Math.min(127, velocity);
    }

    // Return a single note
    return [
      {
        note: chosenNoteName,
        velocity,
        durationSteps: 1,
      },
    ];
  }

  /**
   * Utility to do ±1 semitone approach note around the chord tone.
   * @private
   * @param {string} noteName e.g. "C4"
   * @returns {string} possibly transposed note
   */
  _applyApproach(noteName) {
    const midiVal = this._noteNameToMidi(noteName);
    const delta = this.randomFn() < 0.5 ? -1 : +1;
    return this._midiToNoteName(midiVal + delta);
  }

  // Basic noteName->midi and midi->noteName, as in your other patterns:
  _noteNameToMidi(noteName) {
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
    const m = noteName.match(/^([A-G][b#]?)(\d+)$/);
    if (!m) return 60; // fallback
    const semitone = map[m[1]] ?? 0;
    const octave = parseInt(m[2], 10);
    return (octave + 1) * 12 + semitone;
  }
  
  _midiToNoteName(midiVal) {
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
    const val = Math.max(0, Math.min(127, midiVal));
    const pitchClass = val % 12;
    const octave = Math.floor(val / 12) - 1;
    return names[pitchClass] + octave;
  }
}
