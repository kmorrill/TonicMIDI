// File: colorful-chord-swell-pattern.js

import { BasePattern } from "./base-pattern.js";
import { Scale, Chord, Note } from "@tonaljs/tonal";

/*
  ColorfulChordSwellPattern
  -------------------------
  A robust chord provider pattern that:
   1) Maps 'color' to a mode (Ionian, Lydian, Aeolian, etc.).
   2) Builds diatonic chords in that key/mode.
   3) Randomly picks a progression of 4 chords (with optional tension-based variations).
   4) Each chord "swells" over multiple steps:
      - Single noteOn with multi-step duration
      - Optional Expression CC ramp each step for a volume swell
   5) Overlap or gap is controlled by `overlap` (positive => overlap, negative => gap).
   6) chordComplexity => how extended chords are (7,9,13) or added tensions.
   7) hype => scales velocity, tension => adds more borrowed chords or dissonances
      (none/low/mid/high).
   8) This version demonstrates a multi-level tension approach:
      - none => no borrowed chords, fewer dissonances
      - low => mild chance of borrowed chords or 7/9 intervals
      - mid => bigger chance of borrowed chords, more 9/11/b9
      - high => near-certain borrowed chord & big dissonances (#9, b9, 13).
*/

export class ColorfulChordSwellPattern extends BasePattern {
  /**
   * @typedef {Object} ColorfulChordSwellOptions
   * @property {"warm"|"bright"|"dark"|"mysterious"} [color="warm"]
   *   A broad descriptor for the scale/mode to use.
   * @property {number} [swellDuration=16]
   *   How many steps each chord holds (and “swells”).
   * @property {number} [overlap=2]
   *   If positive, chords overlap by that many steps; if negative, there's a gap.
   * @property {number} [chordComplexity=0.5]
   *   0..1 controlling how many extensions/tensions we add to the diatonic chords.
   * @property {Function} [randomFn=Math.random]
   *   Random function for deterministic testing.
   */

  constructor({
    color = "warm",
    swellDuration = 16,
    overlap = 2,
    chordComplexity = 0.5,
    randomFn = Math.random,
  } = {}) {
    super({
      color,
      swellDuration,
      overlap,
      chordComplexity,
    });

    this.color = color;
    this.swellDuration = swellDuration;
    this.overlap = overlap;
    this.chordComplexity = chordComplexity;
    this.randomFn = randomFn;

    // Internal storage of chord schedule
    this.chordEvents = [];

    this._lastSig = "";
    this.lastHype = null;
    this.lastTension = null;

    console.log(
      "[ColorfulChordSwellPattern] constructor:",
      "color=",
      color,
      "swellDuration=",
      swellDuration,
      "overlap=",
      overlap,
      "chordComplexity=",
      chordComplexity
    );

    // Build initial chord events (assuming hype=low, tension=none to start)
    this._ensureChordEvents("low", "none");
  }

  /**
   * Each pass, we hold chords for 'swellDuration' steps. Then move to the next chord.
   * So the total length is the endStep of the last chord event.
   */
  getLength() {
    if (!this.chordEvents.length) return 1;
    return this.chordEvents[this.chordEvents.length - 1].endStep;
  }

  /**
   * Called every step by the LiveLoop. We only produce noteOn once at the chord start,
   * with multi-step duration. Optionally we do a CC "swell" each step.
   */
  getNotes(stepIndex, context = {}) {
    const hype = context.energyManager?.getHypeLevel?.() || "low";
    const tension = context.energyManager?.getTensionLevel?.() || "none";

    // If something changed, rebuild chord events
    this._ensureChordEvents(hype, tension);

    const cycleLen = this.getLength();
    const localStep = stepIndex % cycleLen;

    // find which chord event is active
    const ev = this.chordEvents.find(
      (x) => localStep >= x.startStep && localStep < x.endStep
    );

    if (!ev) {
      // If there's a gap (e.g. overlap < 0), we might clear chord
      if (context.chordManager) {
        context.chordManager.clearChord(this._getProviderId());
      }
      return [];
    }

    const chordLength = ev.endStep - ev.startStep;

    // If this is the chord start, do noteOn
    if (localStep === ev.startStep) {
      // Post chord to chordManager
      if (context.chordManager) {
        context.chordManager.setCurrentChord(
          this._getProviderId(),
          ev.rootNote, // e.g. "C4"
          ev.chordNotes // e.g. ["C4","E4","G4","B4"]
        );
      }

      // We'll pick a base velocity. If hype is high, scale it
      let velocity = Math.floor(70 + 30 * this._hypeFactor(hype));
      if (velocity > 127) velocity = 127;

      console.log(
        "[ColorfulChordSwellPattern] Starting chord:",
        ev.chordNotes,
        `velocity=${velocity}, chordLength=${chordLength}`
      );

      // Return note objects with multi-step duration
      return ev.chordNotes.map((noteName) => ({
        note: noteName,
        velocity,
        durationSteps: chordLength,
      }));
    }

    // If not chord start, no new notes. But possibly do a CC swell
    this._sendSwellCC(localStep, ev, hype, context);
    return [];
  }

  /**
   * If hype/tension/color/swellDuration/etc. changed, rebuild chordEvents.
   */
  _ensureChordEvents(hype, tension) {
    const sigObj = {
      color: this.color,
      swellDuration: this.swellDuration,
      overlap: this.overlap,
      chordComplexity: this.chordComplexity,
      hype,
      tension,
    };
    const sig = JSON.stringify(sigObj);

    if (sig !== this._lastSig) {
      // Log changes in hype/tension explicitly
      if (this.lastHype !== hype) {
        console.log(
          `[ColorfulChordSwellPattern] Hype changed from ${this.lastHype} to ${hype}.`
        );
      }
      if (this.lastTension !== tension) {
        console.log(
          `[ColorfulChordSwellPattern] Tension changed from ${this.lastTension} to ${tension}.`
        );
      }

      console.log(
        `[ColorfulChordSwellPattern] Rebuilding chord events because something changed:\n`,
        sigObj
      );

      this._lastSig = sig;
      this.lastHype = hype;
      this.lastTension = tension;

      this._buildChordEvents(hype, tension);
    }
  }

  /**
   * The "heart" of the pattern building. We:
   *   1) Determine scale from color => mode
   *   2) Generate a set of diatonic chords
   *   3) Possibly add borrowed chords if tension is >= low
   *   4) Build a simple 4-chord progression
   *   5) Possibly shorten chord durations if tension is high
   *   6) Log each chord
   */
  _buildChordEvents(hype, tension) {
    console.log(
      `[ColorfulChordSwellPattern] _buildChordEvents => hype=${hype}, tension=${tension}`
    );

    this.chordEvents = [];

    // Step 1) Map color => mode
    const mode = this._mapColorToMode(this.color);

    // Step 2) Choose a random root note from possibleRoots
    const possibleRoots = ["C", "D", "E", "F", "G", "A", "Bb", "Eb"];
    const root =
      possibleRoots[Math.floor(this.randomFn() * possibleRoots.length)];
    const scaleName = `${root} ${mode}`;

    console.log(
      `\t[ColorfulChordSwellPattern] Using scaleName="${scaleName}" (color=${this.color})`
    );

    // Attempt to get scale. If fail, fallback to C Ionian
    const scaleData = Scale.get(scaleName);
    if (!scaleData || !scaleData.notes || scaleData.notes.length < 1) {
      console.warn(
        `\t[ColorfulChordSwellPattern] Could not load scale for ${scaleName}, fallback to C ionian`
      );
      scaleData.notes = Scale.get("C ionian").notes;
    }

    // Step 3) Build diatonic chord set
    const diatonicChords = this._generateDiatonicChords(scaleData, mode);

    // Possibly do borrowed chord if tension >= low (just one example approach)
    const tFactor = this._tensionFactor(tension);

    if (tFactor >= 1) {
      // The higher the tension, the bigger the chance of adding a borrowed chord
      const chanceBorrow = tFactor * 0.3; // none=0 => skip, low=0.3, mid=0.6, high=0.9
      if (this.randomFn() < chanceBorrow) {
        console.log(
          `\t[ColorfulChordSwellPattern] tensionFactor=${tFactor} => adding borrowed chord`
        );
        const borrowed = this._borrowOrSecondaryDominant(
          scaleData,
          diatonicChords
        );
        if (borrowed) diatonicChords.push(borrowed);
      }
    }

    // Possibly shorten chord duration if tension is extremely high
    let chordBars = this.swellDuration;
    if (tFactor === 3) {
      // For tension=high => shorten by 8 steps but not below 4
      chordBars = Math.max(4, chordBars - 8);
      console.log(
        `\t[ColorfulChordSwellPattern] tension=high => chord length shortened to ${chordBars}`
      );
    }

    // Step 4) Pick a 4-chord progression from diatonicChords
    const chordCount = 4;
    let currentStart = 0;
    for (let i = 0; i < chordCount; i++) {
      const randChord =
        diatonicChords[Math.floor(this.randomFn() * diatonicChords.length)];
      // e.g. { name: "Cmaj7", root: "C" }

      // Step 5) Extend chord
      const chordNotes = this._extendChord(randChord, hype, tension);

      // Build event
      const chordStart = currentStart;
      const chordEnd = chordStart + chordBars;
      const rootNote = randChord.root + "4";

      this.chordEvents.push({
        rootNote,
        chordNotes,
        startStep: chordStart,
        endStep: chordEnd,
      });

      console.log(
        `\t[ColorfulChordSwellPattern] Chord #${i + 1}: ${randChord.name}, ` +
          `rootNote=${rootNote}, chordNotes=[${chordNotes.join(", ")}], ` +
          `start=${chordStart}, end=${chordEnd}`
      );

      currentStart = chordStart + chordBars - this.overlap;
    }

    // Log final chordEvents array
    console.log(
      `[ColorfulChordSwellPattern] Final chord progression built with ${this.chordEvents.length} chords.`
    );
    this.chordEvents.forEach((ev, idx) => {
      console.log(`\tChord Event #${idx + 1}:`, ev);
    });
  }

  /**
   * Convert a color (warm, bright, dark, mysterious) into a modal name (ionian, lydian, aeolian, phrygian, etc.)
   */
  _mapColorToMode(color) {
    switch (color) {
      case "bright":
        return "lydian";
      case "dark":
        return "aeolian"; // minor scale
      case "mysterious":
        return "phrygian";
      case "warm":
      default:
        return "ionian"; // standard major
    }
  }

  /**
   * Simple helper: parse the scale, get each scale degree, and produce triad or 7th-chord.
   */
  _generateDiatonicChords(scaleData, mode) {
    const notes = scaleData.notes;
    if (notes.length < 7) return [];

    const diatonic = [];
    for (let i = 0; i < 7; i++) {
      const root = notes[i];
      const third = notes[(i + 2) % 7];
      const fifth = notes[(i + 4) % 7];
      const seventh = notes[(i + 6) % 7];

      const chordPitchSet = [root, third, fifth, seventh].map((n) => n + "4");
      const chordData = Chord.detect(chordPitchSet);

      let chordName = chordData.length ? chordData[0] : root;
      let chordRoot = root;
      if (chordName.match(/^[A-G][#b]?/)) {
        chordRoot = chordName.match(/^[A-G][#b]?/)[0];
      }

      diatonic.push({
        name: chordName,
        root: chordRoot,
      });
    }
    return diatonic;
  }

  /**
   * Insert a borrowed chord or secondary dominant. Could scale up with tension.
   */
  _borrowOrSecondaryDominant(scaleData, diatonicChords) {
    // For example: pick a note a 5th above scale root => build a 7 chord
    const scaleRoot = scaleData.tonic || scaleData.notes[0] || "C";
    const upFifth = Note.transpose(scaleRoot, "5P"); // "C" => "G"
    const chordName = upFifth + "7";
    return {
      name: chordName,
      root: upFifth,
    };
  }

  /**
   * Extend a chord by tension/hype/complexity. Different expansions for none/low/mid/high tension.
   */
  _extendChord(chordMeta, hype, tension) {
    const tFactor = this._tensionFactor(tension);

    // parse base chord
    const baseChordName = chordMeta.name;
    const chordObj = Chord.get(baseChordName);
    let chordNotes = chordObj.notes.length ? chordObj.notes : [chordMeta.root];

    // map them to octave "4"
    chordNotes = chordNotes.map((n) => n + "4");

    // Step 1) base extension from chordComplexity => add "9" or "13" sometimes
    const extProb = this.chordComplexity * 100;
    if (this.randomFn() * 100 < extProb) {
      const addInterval = this.randomFn() < 0.5 ? "9" : "13";
      chordNotes = this._addInterval(chordNotes, addInterval);
    }

    // Step 2) Additional tension expansions by level
    switch (tFactor) {
      case 1: // low tension
        // maybe 30% chance to add a '7' or '9'
        if (this.randomFn() < 0.3) {
          const interval = this.randomFn() < 0.5 ? "7" : "9";
          chordNotes = this._addInterval(chordNotes, interval);
        }
        break;
      case 2: // mid tension
        // maybe 40% chance to add '9' or '11'
        if (this.randomFn() < 0.4) {
          const interval = this.randomFn() < 0.5 ? "11" : "9";
          chordNotes = this._addInterval(chordNotes, interval);
        }
        // maybe 25% chance to also add b9
        if (this.randomFn() < 0.25) {
          chordNotes = this._addInterval(chordNotes, "b9");
        }
        break;
      case 3: // high tension
        // existing approach => #9 or b9
        chordNotes = this._addInterval(
          chordNotes,
          this.randomFn() < 0.5 ? "#9" : "b9"
        );
        // maybe also add a '13'
        if (this.randomFn() < 0.5) {
          chordNotes = this._addInterval(chordNotes, "13");
        }
        break;
      default:
        // tension=none => do nothing extra
        break;
    }

    // If hype is high, we spread voicings
    if (this._hypeFactor(hype) > 1.2) {
      console.log(
        `[ColorfulChordSwellPattern] hype is high => spreading voicing for chord: ${baseChordName}`
      );
      chordNotes = this._spreadVoicing(chordNotes, 1);
    }

    // remove duplicates
    chordNotes = [...new Set(chordNotes)];
    return chordNotes;
  }

  /**
   * For tension => returns 0..3. e.g. none=0, low=1, mid=2, high=3
   */
  _tensionFactor(tension) {
    switch (tension) {
      case "low":
        return 1;
      case "mid":
        return 2;
      case "high":
        return 3;
      default:
        return 0; // "none"
    }
  }

  /**
   * Add an interval (9, 13, b9, #9, 11, 7) to chordNotes. If rootNote is the 0th, we transpose root.
   */
  _addInterval(chordNotes, interval) {
    if (!chordNotes.length) return chordNotes;
    const rootNote = chordNotes[0];
    const up = Note.transpose(rootNote, interval);
    if (up && up !== rootNote) {
      return [...chordNotes, up];
    }
    return chordNotes;
  }

  /**
   * Spread voicing by shifting one or two top notes an octave up.
   */
  _spreadVoicing(chordNotes, noteCountToShift = 1) {
    let result = [...chordNotes];
    for (let i = 0; i < noteCountToShift && i < result.length; i++) {
      const index = result.length - 1 - i;
      const newNote = Note.transpose(result[index], "8P");
      if (newNote) {
        result[index] = newNote;
      }
    }
    return result;
  }

  /**
   * The hype factor is unchanged from earlier code: "low"=1.0, "medium"=1.2, "high"=1.5
   */
  _hypeFactor(hype) {
    let factor;
    switch (hype) {
      case "medium":
        factor = 1.2;
        break;
      case "high":
        factor = 1.5;
        break;
      default:
        factor = 1.0;
        break;
    }
    console.log(
      `[ColorfulChordSwellPattern] _hypeFactor("${hype}") => ${factor}`
    );
    return factor;
  }

  /**
   * If we want to do a dynamic Expression CC fade in/out, we do it here each step.
   *   - symmetrical fade in/out over chord duration
   *   - scaled by hype factor
   */
  _sendSwellCC(localStep, chordEvent, hype, context) {
    const { midiBus, deviceDefinition } = context;
    if (!midiBus) return;

    const chordLen = chordEvent.endStep - chordEvent.startStep;
    const stepInto = localStep - chordEvent.startStep;
    if (stepInto < 0 || stepInto >= chordLen) return;

    const half = chordLen / 2;
    let fraction;
    if (stepInto < half) {
      fraction = stepInto / half; // fade in
    } else {
      const out = (stepInto - half) / half;
      fraction = 1 - out; // fade out
    }

    let ccVal = Math.floor(fraction * 127 * this._hypeFactor(hype));
    if (ccVal > 127) ccVal = 127;
    if (ccVal < 0) ccVal = 0;

    // see if deviceDefinition has a "trackVolume" CC
    let ccParam = null;
    if (deviceDefinition) {
      const candidate = deviceDefinition.getCC("trackVolume");
      if (candidate !== null) {
        ccParam = candidate;
      }
    }

    // fallback is CC #11
    const finalCc = ccParam !== null ? ccParam : 11;

    midiBus.controlChange({
      channel: 1, // or whichever channel you prefer
      cc: finalCc,
      value: ccVal,
    });
  }

  /**
   * The ID used when calling chordManager (so it knows who sets the chord).
   */
  _getProviderId() {
    return "ColorfulChordSwellPattern";
  }
}
