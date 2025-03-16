// File: src/patterns/syncopated-bass.js

import { BasePattern } from "./base-pattern.js";

/**
 * SyncopatedBass
 *
 * Creates a stable (non-changing) rhythmic pattern with the following user controls:
 *   - patternLength: total steps in the loop (16 or 32 typically)
 *   - genre: which base groove to seed (e.g. "funk","latin","house", etc.)
 *   - octave: the single octave in which to place notes (e.g. 2 => "C2")
 *   - density: 0..1 controlling how many “events” are kept
 *   - randomFn: optional seeded random if you want deterministic results
 *
 * On each step, we look up chord/hype/tension/beat managers to adapt pitch and velocity.
 * Some notes may last multiple steps (2..3).
 */
export class SyncopatedBass extends BasePattern {
  /**
   * @param {object} options
   * @param {number} [options.patternLength=16] - steps in the loop
   * @param {string} [options.genre="funk"] - e.g. "funk","latin","rock","house","afrobeat"
   * @param {number} [options.octave=2] - e.g. 2 => "C2"
   * @param {number} [options.density=0.5] - 0..1, how many total events remain
   * @param {Function} [options.randomFn=Math.random] - custom RNG for deterministic results
   */
  constructor({
    patternLength = 16,
    genre = "funk",
    octave = 2,
    density = 0.5,
    randomFn = Math.random,
  } = {}) {
    super({ patternLength, genre, octave, density });
    this.patternLength = patternLength;
    this.genre = genre;
    this.octave = octave;
    this.density = density;
    this.randomFn = randomFn;

    // We'll create an array where each element is either 0 or a positive integer = note duration in steps.
    // E.g. 2 => start a note that lasts 2 steps, 3 => 3 steps, 1 => single short step, 0 => rest.
    // We'll pick a base seed from the chosen genre and adapt it to patternLength, then randomize for density.
    this._patternArray = this._generatePattern();
  }

  /**
   * We define base seeds for multiple genres. Each is an array of length=16,
   * where each element is either 0 (rest) or a positive integer meaning how many steps the note extends.
   */
  _generatePattern() {
    // Example seeds. Each is length=16. They can contain 2 or 3 for occasional longer notes.
    const baseSeeds = {
      funk: [2, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 0, 1, 0, 0],
      latin: [1, 0, 2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 1, 0, 0],
      reggae: [0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0],
      hiphop: [1, 0, 1, 0, 2, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1],
      rock: [2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 2, 0],
      house: [2, 0, 2, 0, 1, 0, 0, 1, 2, 0, 2, 0, 1, 0, 0, 1],
      afrobeat: [1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0],
    };
    const seed = baseSeeds[this.genre] || baseSeeds["funk"];

    // 1) Adapt to patternLength
    let pattern = this._adaptSeedToLength(seed, this.patternLength);

    // 2) Adjust events according to density
    pattern = this._applyDensity(pattern);

    return pattern;
  }

  /**
   * If user's patternLength != 16, replicate or slice the seed to match the length.
   */
  _adaptSeedToLength(seed, length) {
    if (length === seed.length) {
      return [...seed];
    } else if (length < seed.length) {
      return seed.slice(0, length);
    } else {
      // replicate
      const result = [];
      let idx = 0;
      while (result.length < length) {
        result.push(seed[idx % seed.length]);
        idx++;
      }
      return result;
    }
  }

  /**
   * We measure how many total “events” (non-zero entries) are in the pattern,
   * compare to targetHits = density * patternLength, remove or add events at random
   * to match that approximate number. We avoid infinite loops by:
   *   1) If targetEvents >= patternLength, fill all steps with single-step events.
   *   2) For partial densities, we impose a max iteration limit when adding events.
   */
  _applyDensity(arr) {
    // If density is 1 (or effectively 1), fill every step with a 1-step note
    const targetEvents = Math.floor(this.patternLength * this.density);
    if (targetEvents >= this.patternLength) {
      return arr.map(() => 1); // fill everything, no rests
    }

    // Build a list of “event indices” => step indexes where arr[i] > 0
    const eventIndexes = [];
    let totalEvents = 0;
    let i = 0;
    while (i < arr.length) {
      const dur = arr[i];
      if (dur > 0) {
        eventIndexes.push(i);
        // skip the next dur-1 steps
        i += dur;
        totalEvents++;
      } else {
        i++;
      }
    }

    // 1) Remove random events if we have too many
    while (totalEvents > targetEvents && eventIndexes.length > 0) {
      const idxToRemove = Math.floor(this.randomFn() * eventIndexes.length);
      const step = eventIndexes[idxToRemove];
      const dur = arr[step];
      // remove the entire event
      arr[step] = 0;
      // remove it from eventIndexes
      eventIndexes.splice(idxToRemove, 1);
      totalEvents--;
    }

    // 2) If we have too few, attempt to add random events
    let attemptCount = 0;
    const maxAttempts = arr.length * 10; // escape hatch
    while (totalEvents < targetEvents) {
      attemptCount++;
      if (attemptCount > maxAttempts) {
        console.warn(
          "[SyncopatedBass] Reached attempt limit while applying density. Stopping early."
        );
        break;
      }

      const candidate = Math.floor(this.randomFn() * arr.length);
      if (arr[candidate] === 0) {
        // ensure we are not inside a multi-step note
        if (!this._occupiedByExistingEvent(arr, candidate)) {
          // place a new note
          const newDur = this.randomFn() < 0.3 ? 2 : 1; // 30% chance 2-step
          // check boundary
          if (candidate + newDur <= arr.length) {
            arr[candidate] = newDur;
            eventIndexes.push(candidate);
            totalEvents++;
          }
        }
      }
    }

    return arr;
  }

  /**
   * Check if 'candidateIndex' is inside an event with a longer duration
   * that started earlier. If so, we can't place a new event here.
   */
  _occupiedByExistingEvent(arr, candidateIndex) {
    // scan backwards to see if a previous step started a multi-step note that extends over candidateIndex
    for (let i = candidateIndex - 1; i >= 0; i--) {
      if (arr[i] > 0) {
        const end = i + arr[i] - 1;
        if (candidateIndex <= end) {
          return true; // candidate is within that note
        } else {
          return false; // we passed its region
        }
      }
    }
    return false;
  }

  /**
   * Pattern length in steps
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Called each step by LiveLoop. We look up whether this step is the start of a note,
   * adapt pitch/velocity from chordManager + energyManager, then return the note if any.
   */
  getNotes(stepIndex, context = {}) {
    const chordManager = context.chordManager;
    const energyManager = context.energyManager;
    const rhythmManager = context.rhythmManager;

    // If no chord, do nothing
    if (!chordManager) return [];
    const chordNotes = chordManager.getCurrentChordNotes() || [];
    if (!chordNotes.length) return [];

    // Check if this step starts a note
    const stepPos = stepIndex % this.patternLength;
    const dur = this._patternArray[stepPos];
    if (dur <= 0) {
      return [];
    }

    // 1) Choose a chord note
    const tension = energyManager?.getTensionLevel?.() || "none";
    let midiVal = this._chooseChordNote(chordNotes, tension);

    // 2) Velocity from hype + downbeat/offbeat
    const hype = energyManager?.getHypeLevel?.() || "low";
    let velocity = this._computeVelocity(hype, stepIndex, rhythmManager);

    // Return a single note that lasts `dur` steps
    return [
      {
        note: this._toNoteName(midiVal),
        velocity,
        durationSteps: dur,
      },
    ];
  }

  /**
   * Weighted approach to pick root/third/fifth or 7th if tension≥mid.
   * Possibly approach ±1 semitone if tension=high. Then enforce `this.octave`.
   */
  _chooseChordNote(chordNotes, tension) {
    // Weighted approach: root=50%, third=30%, fifth=20%
    let picked = chordNotes[0];
    const r = this.randomFn() * 100;
    if (r < 50 && chordNotes[0]) {
      picked = chordNotes[0]; // root
    } else if (r < 80 && chordNotes[1]) {
      picked = chordNotes[1]; // third
    } else if (r < 95 && chordNotes[2]) {
      picked = chordNotes[2]; // fifth
    } else if (chordNotes[3] && (tension === "mid" || tension === "high")) {
      picked = chordNotes[3]; // 7th or extension
    }

    let midiVal = this._noteNameToMidi(picked);

    // If tension=high => 30% approach ±1 semitone
    if (tension === "high" && this.randomFn() < 0.3) {
      midiVal += this.randomFn() < 0.5 ? -1 : +1;
    }

    // Force to user-chosen octave
    const pitchClass = midiVal % 12;
    midiVal = pitchClass + 12 * (this.octave + 1);

    return midiVal;
  }

  /**
   * Example velocity shaping: hype=medium => +10, hype=high => +20.
   * Downbeat => +10, offbeat => -10.
   */
  _computeVelocity(hype, stepIndex, rhythmManager) {
    let vel = 90;
    switch (hype) {
      case "medium":
        vel += 10;
        break;
      case "high":
        vel += 20;
        break;
    }
    if (rhythmManager) {
      if (rhythmManager.isDownbeat(stepIndex)) vel += 10;
      else if (rhythmManager.isOffbeat(stepIndex)) vel -= 10;
    }
    return Math.max(1, Math.min(127, vel));
  }

  /**
   * Minimal note name -> MIDI parse. E.g. "C4" => 60
   */
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
    const pitch = map[m[1]] ?? 0;
    const octave = parseInt(m[2], 10);
    return (octave + 1) * 12 + pitch;
  }

  /**
   * Minimal MIDI -> note name. E.g. 60 => "C4".
   */
  _toNoteName(midiVal) {
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
