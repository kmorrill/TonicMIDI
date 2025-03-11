// File: colorful-chord-swell-pattern.js

import { BasePattern } from "./base-pattern.js";
import { Scale, Chord, Note } from "@tonaljs/tonal";
/*
  The 'progression' submodule can help with diatonic chord naming or 
  building progressions from scale degrees (I, ii, V, etc.).
*/

/**
 * ColorfulChordSwellPattern
 *
 * A robust chord provider pattern that:
 *   1) Maps 'color' to a mode (Ionian, Lydian, Aeolian, etc.).
 *   2) Builds diatonic chords in that key/mode.
 *   3) Randomly picks a progression of 4 chords (with optional tension-based variations).
 *   4) Each chord "swells" over multiple steps:
 *      - Single noteOn with multi-step duration
 *      - Optional Expression CC ramp each step if you want a real volume swell
 *   5) Overlap or gap is controlled by `overlap` (positive => overlap, negative => gap).
 *   6) chordComplexity => how extended chords are (7,9,13) or added tensions.
 *   7) hype => scales velocity, tension => adds dissonances or borrowed chords.
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

    // Build initial chord events
    this._ensureChordEvents("low", "none");
  }

  /**
   * The repeating length in steps of our chord cycle. Usually the last chord end.
   */
  getLength() {
    if (!this.chordEvents.length) return 1;
    return this.chordEvents[this.chordEvents.length - 1].endStep;
  }

  /**
   * Called every step by the LiveLoop. We only produce noteOn once at chord start,
   * with multi-step duration. Optionally, each step we do an Expression CC to emulate “swell.”
   */
  getNotes(stepIndex, context = {}) {
    const hype = context.energyManager?.getHypeLevel?.() || "low";
    const tension = context.energyManager?.getTensionLevel?.() || "none";

    // If something changed, rebuild chord events
    this._ensureChordEvents(hype, tension);

    const cycleLen = this.getLength();
    const localStep = stepIndex % cycleLen;

    // find which chord event is active in this step
    const ev = this.chordEvents.find(
      (x) => localStep >= x.startStep && localStep < x.endStep
    );

    if (!ev) {
      // gap if overlap < 0
      // optionally clear chord from chordManager
      if (context.chordManager) {
        context.chordManager.clearChord(this._getProviderId());
      }
      return [];
    }

    const chordLength = ev.endStep - ev.startStep;
    if (localStep === ev.startStep) {
      // This is chord's start => set chord in chordManager
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
      // The LiveLoop will do noteOn now + noteOff after chordLength
      return ev.chordNotes.map((noteName) => ({
        note: noteName,
        velocity,
        durationSteps: chordLength,
      }));
    }

    // If not chord start, no new notes.
    // But we can do an expression CC ramp if you want a “swell” effect:
    this._sendSwellCC(localStep, ev, hype, context);

    return [];
  }

  // ----------------------------------------------------------------
  // Internal Methods
  // ----------------------------------------------------------------

  /**
   * Rebuild chordEvents if color, swellDuration, overlap, chordComplexity, hype, or tension changed.
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
      console.log(
        "[ColorfulChordSwellPattern] Signature changed -> rebuilding chord events."
      );
      this._lastSig = sig;
      this.lastHype = hype;
      this.lastTension = tension;
      this._buildChordEvents(hype, tension);
    }
  }

  /**
   * Build chord events array (like a small progression).
   * We'll:
   *   1) Map color => a scale (like Ionian, Lydian, Aeolian, etc.).
   *   2) Pick a random root from possibleRoots, produce the scale.
   *   3) Generate diatonic chords from that scale.
   *   4) Pick a 4-chord progression from those diatonic chords, possibly add a borrowed chord if tension is high.
   *   5) For each chord, add complexity if chordComplexity is high.
   *   6) Each chord is `swellDuration` steps, the next chord starts at (start + swellDuration - overlap).
   */
  _buildChordEvents(hype, tension) {
    this.chordEvents = [];

    // 1) Map color => mode
    const mode = this._mapColorToMode(this.color);

    // 2) Choose a random root
    const possibleRoots = ["C", "D", "E", "F", "G", "A", "Bb", "Eb"];
    const root =
      possibleRoots[Math.floor(this.randomFn() * possibleRoots.length)];
    const scaleName = `${root} ${mode}`; // e.g. "F Lydian"

    console.log(
      "[ColorfulChordSwellPattern] _buildChordEvents:",
      `mode=${mode}, root=${root}, scaleName=${scaleName}, hype=${hype}, tension=${tension}, chordComplexity=${this.chordComplexity}`
    );

    // Get scale notes
    const scaleData = Scale.get(scaleName);
    if (!scaleData || !scaleData.notes || scaleData.notes.length < 1) {
      // fallback if scale not recognized
      console.warn(
        `Could not get scale for ${scaleName}, fallback to C major scale`
      );
      scaleData.notes = Scale.get("C ionian").notes;
    }

    // 3) Build diatonic chord set. For each scale degree, we can do:
    const diatonicChords = this._generateDiatonicChords(scaleData, mode);

    // Possibly do a borrowed chord or secondary if tension is high
    if (tension === "high") {
      console.log(
        "[ColorfulChordSwellPattern] tension='high' => adding borrowed chord"
      );
      const borrowed = this._borrowOrSecondaryDominant(
        scaleData,
        diatonicChords
      );
      if (borrowed) diatonicChords.push(borrowed);
    }

    // 4) Pick a 4-chord progression
    let chordCount = 4;
    let currentStart = 0;
    for (let i = 0; i < chordCount; i++) {
      const randChord =
        diatonicChords[Math.floor(this.randomFn() * diatonicChords.length)];
      // e.g. { name: "Cmaj7", root: "C", type: "maj7" }

      // Build extended chord notes from complexity
      let chordNotes = this._extendChord(randChord, hype, tension);

      // Figure out start/end
      const chordStart = currentStart;
      const chordEnd = chordStart + this.swellDuration;

      // rootNote can be the chord's root at octave 4
      const rootNote = randChord.root + "4";

      this.chordEvents.push({
        rootNote,
        chordNotes,
        startStep: chordStart,
        endStep: chordEnd,
      });

      console.log(
        `[ColorfulChordSwellPattern] Chord #${i + 1} =>`,
        `rootNote=${rootNote}, chordNotes=${chordNotes}, start=${chordStart}, end=${chordEnd}`
      );

      currentStart = chordStart + this.swellDuration - this.overlap;
    }
  }

  /**
   * Map color => a mode for the scale.
   * Tweak to taste if you want more variety.
   * e.g. "warm" => "ionian", "bright" => "lydian", "dark" => "aeolian", "mysterious" => "phrygian" or "locrian"
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
   * Given a scale (notes & mode), generate the diatonic chords (I..VII).
   * We’ll do triads or 7th-chords as a base.
   */
  _generateDiatonicChords(scaleData, mode) {
    const notes = scaleData.notes; // e.g. ["F","G","A","Bb","C","D","E"] if "F Lydian"
    if (notes.length < 7) return [];

    const diatonic = [];
    for (let i = 0; i < 7; i++) {
      const root = notes[i];
      // Let's collect the 1-3-5-7 from scale steps (mod 7).
      const third = notes[(i + 2) % 7];
      const fifth = notes[(i + 4) % 7];
      const seventh = notes[(i + 6) % 7]; // could do 6 for 7th

      const chordPitchSet = [root, third, fifth, seventh].map((n) => n + "4");
      // Use Tonal to interpret
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
   * Possibly insert a borrowed chord or secondary dominant if tension=high.
   * For example, pick a random chord that’s not strictly diatonic to add spice.
   */
  _borrowOrSecondaryDominant(scaleData, diatonicChords) {
    // A simplistic approach: pick a note a 5th above the scale root, build a 7 chord
    const scaleRoot = scaleData.tonic || scaleData.notes[0] || "C";
    const upFifth = Note.transpose(scaleRoot, "5P"); // e.g. "C" -> "G"
    const chordName = upFifth + "7";
    return {
      name: chordName,
      root: upFifth,
    };
  }

  /**
   * Extend a base chord according to chordComplexity plus hype/tension.
   * We'll parse the chord with Tonal, then add intervals (9, 13, #9) if complexity is high.
   */
  _extendChord(chordMeta, hype, tension) {
    const baseChordName = chordMeta.name; // e.g. "Cmaj7"
    const chordObj = Chord.get(baseChordName);
    let chordNotes = chordObj.notes;
    if (!chordNotes.length) {
      // fallback: just use chord root
      chordNotes = [chordMeta.root];
    }

    // 1) convert each note => e.g. "C" => "C4"
    chordNotes = chordNotes.map((n) => n + "4");

    // 2) If chordComplexity is 0.7 or higher, add 9 or 13
    const extProb = this.chordComplexity * 100;
    if (this.randomFn() * 100 < extProb) {
      const addInterval = this.randomFn() < 0.5 ? "9" : "13";
      chordNotes = this._addInterval(chordNotes, addInterval);
    }

    // 3) If tension = "high", maybe add a #9 or b9
    if (tension === "high") {
      chordNotes = this._addInterval(
        chordNotes,
        this.randomFn() < 0.5 ? "#9" : "b9"
      );
    }

    // 4) If hype is high, we might do bigger voicings or spread out
    if (this._hypeFactor(hype) > 1.2) {
      console.log(
        `[ColorfulChordSwellPattern] hype is high, spreading voicing for chord: ${baseChordName}`
      );
      chordNotes = this._spreadVoicing(chordNotes, 1);
    }

    // remove duplicates
    chordNotes = [...new Set(chordNotes)];

    return chordNotes;
  }

  /**
   * Add an interval (9,13,b9,#9, etc.) to existing chord notes.
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
   * Spread voicing by shifting one or two notes an octave up
   */
  _spreadVoicing(chordNotes, noteCountToShift = 1) {
    let result = [...chordNotes];
    for (let i = 0; i < noteCountToShift && i < result.length; i++) {
      const index = result.length - 1 - i;
      const newNote = Note.transpose(result[index], "8P");
      if (newNote) result[index] = newNote;
    }
    return result;
  }

  /**
   * Return a hype factor: "low" => 1.0, "medium" => 1.2, "high" => 1.5, etc.
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
   * Attempts to find a suitable CC param from deviceDefinition’s standard CC.
   * If we don't find 'trackVolume' (or anything suitable), fallback to CC #11.
   */
  _sendSwellCC(localStep, chordEvent, hype, context) {
    const { midiBus, deviceDefinition } = context;
    if (!midiBus) return;

    const chordLen = chordEvent.endStep - chordEvent.startStep;
    const stepInto = localStep - chordEvent.startStep;
    if (stepInto < 0 || stepInto >= chordLen) return;

    // symmetrical fade in/out
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

    let ccParam = null;
    if (deviceDefinition) {
      const candidate = deviceDefinition.getCC("trackVolume");
      if (candidate !== null) {
        ccParam = candidate;
      }
    }

    const finalCc = ccParam !== null ? ccParam : 11;

    midiBus.controlChange({
      channel: 1,
      cc: finalCc,
      value: ccVal,
    });
  }

  /**
   * The ID used when calling chordManager
   */
  _getProviderId() {
    return "ColorfulChordSwellPattern";
  }
}
