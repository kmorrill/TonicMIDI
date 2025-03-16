// File: src/patterns/syncopated-bass.js

import { BasePattern } from "./base-pattern.js";

/**
 * SyncopatedBass
 *
 * Creates a stable (non-changing) rhythmic pattern with the following user controls:
 *   - patternLength: total steps in the loop (16 or 32 typically)
 *   - genre: which base groove to seed (e.g. "funk","latin","house", etc.)
 *   - octave: the single octave in which to place notes (e.g. 2 => "C2")
 *   - density: 0..1 controlling how many total “events” are kept
 *   - randomFn: optional seeded random if you want deterministic results
 *
 * On each step, we look up chord/hype/tension/beat managers to adapt pitch and velocity.
 * Some notes may last multiple steps (2..3).
 *
 * We'll preserve multi-step durations from the seed. The "density" logic removes or adds
 * entire events (i.e., entire multi-step segments), without forcing them to become single-step hits.
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

    // We'll create an array (patternArray) of length=patternLength, each element
    // either 0 or a positive integer meaning how many steps that note extends from here.
    // Example: "2" at index=0 => means from step 0..1 is one note event.
    // Indices 1..1 are not used by that note. Then index 2 might be 0 => rest, etc.
    this._patternArray = this._generatePattern();
  }

  /**
   * We define base seeds for multiple genres. Each is length=16, each element is either
   * 0 (rest) or a positive integer meaning that many steps of a single note event.
   */
  _generatePattern() {
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

    // 2) Apply density by removing or adding entire events, preserving durations
    pattern = this._applyDensity(pattern);

    return pattern;
  }

  /**
   * If user's patternLength != 16, replicate or slice the seed to match the length.
   * We keep the multi-step structure. For example, if patternLength=8, we take the first 8 steps.
   * If patternLength=32, we replicate the seed 2 times, etc.
   */
  _adaptSeedToLength(seed, length) {
    if (length === seed.length) {
      return [...seed];
    } else if (length < seed.length) {
      return seed.slice(0, length);
    } else {
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
   * Removes or adds entire events to match an approximate target event count.
   * We do *not* forcibly break a "2" into two "1"s, nor do we unify single-step hits
   * into multi-step hits. We simply remove or replicate entire events if needed.
   *
   * Steps:
   * 1) Identify the start indexes of each event. (An event starts at index i if pattern[i] > 0.)
   * 2) Count how many events we have. Compare to target = density * patternLength (rounded).
   * 3) If too many events, remove random ones until we reach target (cannot go below 1 or above length).
   * 4) If too few events, add random new events (with random durations 1..2 or something) until we approximate target.
   */
  _applyDensity(array) {
    // If density is 1 or near 1 => we want no rests. We also need to ensure we do not forcibly
    // destroy existing multi-step events. We'll likely fill every gap with a new event if there's space.
    let targetEvents = Math.floor(this.patternLength * this.density);

    if (targetEvents <= 0) {
      // If extremely low density => no events
      return new Array(this.patternLength).fill(0);
    }
    if (targetEvents >= this.patternLength) {
      // If density=1 => we have to fill all steps with notes, but we keep the multi-step structure
      // for existing events. Then fill the gaps with new single or multi-step hits if needed.
      return this._fillAllSteps(array);
    }

    // Identify existing events
    let events = this._scanEvents(array); // => [ {start, dur}, ... ]

    // If we have too many events, remove random ones
    while (events.length > targetEvents && events.length > 0) {
      const idxToRemove = Math.floor(this.randomFn() * events.length);
      const ev = events[idxToRemove];
      // remove it from array
      for (let s = ev.start; s < ev.start + ev.dur && s < array.length; s++) {
        array[s] = 0;
      }
      // remove from list
      events.splice(idxToRemove, 1);
    }

    // If we have too few, add random events (with random durations 1..2 or 1..3?).
    // We do a max loop to avoid infinite attempts
    const maxAttempts = array.length * 10;
    let attempts = 0;
    while (events.length < targetEvents && attempts < maxAttempts) {
      attempts++;
      // pick a random free spot
      const spot = Math.floor(this.randomFn() * array.length);
      // check if that is inside an existing event
      if (this._occupiedByExisting(array, spot)) continue;

      const newDur = this.randomFn() < 0.3 ? 2 : 1; // 30% chance for 2-step
      // check boundary
      if (spot + newDur > array.length) continue;

      // check if any overlap with existing event
      let overlap = false;
      for (let i = 0; i < newDur; i++) {
        if (this._occupiedByExisting(array, spot + i)) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;

      // place the new event
      array[spot] = newDur;
      for (let i = spot + 1; i < spot + newDur && i < array.length; i++) {
        array[i] = 0; // the main "dur" is stored at spot
      }

      // re-scan
      events = this._scanEvents(array);
    }

    return array;
  }

  /**
   * Called if density=1 => we want no rests. We'll fill all empty slots with new events,
   * but keep existing multi-step notes intact. If an event is 2 steps at index=0, that's fine.
   */
  _fillAllSteps(array) {
    // First, keep existing events. Then fill all gaps.
    // E.g. if array= [2,0,0,1,0,1,0,0], steps 0..1 are one event, step3=1, step5=1 => so we fill steps2,4,6,7
    let i = 0;
    while (i < array.length) {
      if (array[i] > 0) {
        // skip over this entire event
        const dur = array[i];
        i += dur;
      } else {
        // place a new event. Maybe random dur=1 or 2
        const newDur = this.randomFn() < 0.3 ? 2 : 1;
        if (i + newDur > array.length) {
          // if we can't fit a multi-step, place single-step
          array[i] = 1;
          i += 1;
        } else {
          array[i] = newDur;
          // zero out the subsequent steps
          for (let j = i + 1; j < i + newDur; j++) {
            if (j < array.length) {
              array[j] = 0;
            }
          }
          i += newDur;
        }
      }
    }
    return array;
  }

  /**
   * Helper that returns an array of { start, dur } for each event in the pattern array.
   * An "event" is an index i where array[i] > 0, meaning the note starts at i and
   * extends for array[i] steps in total.
   */
  _scanEvents(array) {
    const events = [];
    let i = 0;
    while (i < array.length) {
      const dur = array[i];
      if (dur > 0) {
        events.push({ start: i, dur });
        i += dur;
      } else {
        i++;
      }
    }
    return events;
  }

  /**
   * Returns true if `index` is inside any existing event. i.e. pattern[index0] with dur> (index-index0).
   */
  _occupiedByExisting(array, index) {
    // If index < 0 or >= array.length => out of range => treat as occupied
    if (index < 0 || index >= array.length) return true;

    // Look backward until we find array[k] > 0 or the start
    for (let k = index; k >= 0; k--) {
      const dur = array[k];
      if (dur > 0) {
        // the event starts at k and extends k+dur-1
        const end = k + dur - 1;
        return index <= end;
      }
      // if dur=0 => keep going
    }
    return false;
  }

  /**
   * The pattern length in steps
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Called each step by LiveLoop. We look up whether this step is the start of a note,
   * adapt pitch/velocity from chordManager + energyManager, then return the note if any.
   * If the pattern array says "2" at step 0, that means from step0..1 is one note event.
   * But we only trigger noteOn at step0. The next step1 is "covered" by that note, so no new noteOn.
   */
  getNotes(stepIndex, context = {}) {
    const chordManager = context.chordManager;
    const energyManager = context.energyManager;
    const rhythmManager = context.rhythmManager;

    if (!chordManager) return [];
    const chordNotes = chordManager.getCurrentChordNotes() || [];
    if (!chordNotes.length) return [];

    // Check if this step is the "start" of a note
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
   * Weighted approach to pick chord tones. Possibly approach ±1 semitone if tension=high.
   */
  _chooseChordNote(chordNotes, tension) {
    // Weighted approach: root=50%, third=30%, fifth=15%, extension=5% if available
    // Adjust as you like:
    const r = this.randomFn() * 100;
    let picked = chordNotes[0];
    if (r < 50 && chordNotes[0]) {
      picked = chordNotes[0]; // root
    } else if (r < 80 && chordNotes[1]) {
      picked = chordNotes[1]; // third
    } else if (r < 95 && chordNotes[2]) {
      picked = chordNotes[2]; // fifth
    } else if (chordNotes[3]) {
      picked = chordNotes[3]; // extension
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
   * Downbeat => +10, offbeat => -10. (If rhythmManager is provided.)
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
