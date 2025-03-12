import { BasePattern } from "./base-pattern.js";

/**
 * PhraseContourMelody
 *
 * Generates multi-bar melodic phrases with subSections like "intro", "build", "peak", etc.
 * Reacts to tension & hype on *every step*, allowing real-time changes in dissonance
 * (tension) and velocity/density (hype). Holds or rests can occur to shape phrase arcs.
 *
 * Dependencies/Assumptions:
 *  - chordManager in context (for chord notes).
 *  - energyManager in context (for tension/hype).
 *  - extends your BasePattern class that requires getNotes(step, context) and getLength().
 */

export class PhraseContourMelody extends BasePattern {
  /**
   * @param {Object} options
   * @param {number} [options.phraseBars=4]
   *    How many bars (measures) a full phrase spans before looping.
   * @param {string[]} [options.subSections=["build","peak","resolve"]]
   *    The sub-sections that define pitch/duration/dynamics roles in the phrase.
   *    Examples: ["intro","build","peak","resolve","cadence"], etc.
   * @param {number} [options.stepsPerBar=16]
   *    How many steps your system uses per bar (16 is common in 4/4 if each step is a 16th note).
   * @param {number} [options.cadenceBeats=2]
   *    Beats (or step fraction) to hold or rest at the phrase end as a cadence. If your bar is 4 beats, 2 means half a bar, etc.
   * @param {number} [options.melodicDensity=0.7]
   *    0..1: Probability of placing a note in each potential sub-slot. Higher => busier lines.
   * @param {number} [options.baseVelocity=90]
   *    A central velocity. SubSections or hype can scale this up/down.
   * @param {number} [options.tensionEmbellishProb=0.2]
   *    Base chance to insert approach/dissonance. Will scale up if tension=mid/high.
   * @param {Object} [options.hypeDynamics={low:1.0, medium:1.2, high:1.4}]
   *    Dict controlling velocity/density scaling for different hype levels.
   *    e.g. { low:1.0, medium:1.2, high:1.4 }
   *
   * Implementation notes:
   *  - We do step-by-step logic. Each time getNotes() is called, we see which subSection
   *    we are in, we decide if we produce a new note or continue/hold from last step, etc.
   *  - Because we allow longer durations, we track active notes in 'this.activeNotes' and
   *    only re-trigger if the old note ended or we want a new note.
   */
  constructor({
    phraseBars = 4,
    subSections = ["build", "peak", "resolve"],
    stepsPerBar = 16,
    cadenceBeats = 2,
    melodicDensity = 0.7,
    baseVelocity = 90,
    tensionEmbellishProb = 0.2,
    hypeDynamics = { low: 1.0, medium: 1.2, high: 1.4 },
  } = {}) {
    super();
    this.phraseBars = phraseBars;
    this.subSections = subSections;
    this.stepsPerBar = stepsPerBar;
    this.cadenceBeats = cadenceBeats;
    this.melodicDensity = melodicDensity;
    this.baseVelocity = baseVelocity;
    this.tensionEmbellishProb = tensionEmbellishProb;
    this.hypeDynamics = hypeDynamics;

    // We track the internal note-sustaining logic:
    // A list of currently active notes with their endStep, so we don't re-trigger
    this.activeNotes = [];

    // Precompute total phrase steps
    this.totalPhraseSteps = this.phraseBars * this.stepsPerBar;

    // Sub-section boundaries (start step -> end step).
    // We'll fill them in _buildSubSectionMap().
    this.subSectionMap = [];

    // Actually compute sub-section boundaries
    this._buildSubSectionMap();

    // If you want, you can store phrase-level data if you prefer. We'll do step-by-step.
  }

  // ----------------------------------------------------------
  // Public pattern API
  // ----------------------------------------------------------

  /**
   * getNotes(stepIndex, context):
   *   Called each step by the sequencer (TransportManager).
   *   We'll figure out which sub-section we're in, interpret tension/hype,
   *   decide if we place a new note or hold, pick pitches, etc.
   */
  getNotes(stepIndex, context) {
    const chordManager = context?.chordManager;
    const energyManager = context?.energyManager;

    if (!chordManager) {
      console.warn("[PhraseContourMelody] No chordManager in context!");
      return [];
    }

    // 1) Identify chord + tension/hype
    const chordNotes = chordManager.getCurrentChordNotes() || [];
    const tensionLevel = energyManager?.getTensionLevel?.() || "none";
    const hypeLevel = energyManager?.getHypeLevel?.() || "low";

    // We'll scale tensionEmbellishProb based on tension:
    let tensionFactor = 1.0;
    switch (tensionLevel) {
      case "low":
        tensionFactor = 0.5;
        break;
      case "mid":
        tensionFactor = 1.5;
        break;
      case "high":
        tensionFactor = 2.5;
        break;
      default:
        tensionFactor = 1.0;
        break;
    }
    const actualEmbellishProb = Math.min(
      1.0,
      this.tensionEmbellishProb * tensionFactor
    );

    // We'll scale velocity / density based on hype:
    let hypeScale = 1.0;
    if (this.hypeDynamics[hypeLevel] != null) {
      hypeScale = this.hypeDynamics[hypeLevel];
    }

    const scaledDensity = Math.min(1.0, this.melodicDensity * hypeScale);

    // 2) Figure out our "local step" within the phrase
    const localStep = stepIndex % this.getLength(); // wrap around phrase
    // 3) Figure out which subSection we are in
    const subSec = this._findSubSection(localStep);
    // 4) From subSec, get recommended approach
    const subSecCfg = this._getSubSectionConfig(subSec);

    // We'll also see if we're in "cadence" time at the phrase end:
    const isCadenceZone = this._isInCadenceZone(localStep);

    // ----------------------------------------------------------
    // STEP LOGIC: Are we continuing a held note, or do we create a new note?
    // We'll check for ended notes first.
    // ----------------------------------------------------------
    const stillActive = [];
    for (const noteObj of this.activeNotes) {
      if (localStep >= noteObj.endStep) {
        // note ends here => schedule a noteOff in the "notes" output
      } else {
        stillActive.push(noteObj);
      }
    }
    this.activeNotes = stillActive;

    // We'll see if we want to create a new note at this step:
    // We'll skip if we already have a note continuing from previous step
    //   *unless* subSec logic or tension changes want to forcibly re-trigger.
    const continuingNote = this.activeNotes.find(
      (n) => n.startStep <= localStep && localStep < n.endStep
    );
    if (continuingNote) {
      // We are currently holding a note from previous steps => no new noteOn
      return this._buildNoteArray([], localStep);
    }

    // If we get here, there's no note sustaining. Decide if we place a new note.
    const placeNote = Math.random() < scaledDensity;

    if (!placeNote && !isCadenceZone) {
      // We'll rest => no new note
      return this._buildNoteArray([], localStep);
    }

    // If we are in the "cadence" final zone, we might forcibly place a note or hold
    if (isCadenceZone) {
      // Optionally check tension: if tension=high, maybe skip rest for ongoing drive
      // else forcibly place a stable chord tone for resolution
    }

    // 5) Determine the note's pitch. We'll pick from chordNotes, possibly adding tension
    const pitch = this._pickPitch(
      chordNotes,
      subSecCfg,
      tensionLevel,
      actualEmbellishProb
    );
    if (!pitch) {
      // If no chord notes are available, we skip
      return this._buildNoteArray([], localStep);
    }

    // 6) Decide note velocity => baseVelocity * subSec velocity factor * hypeScale
    const suggestedVel = subSecCfg.velocityFactor ?? 1.0;
    let velocity = Math.floor(
      this.baseVelocity * hypeScale * suggestedVel +
        (subSecCfg.velocityJitter ?? 0) * (Math.random() - 0.5)
    );
    velocity = Math.max(1, Math.min(127, velocity));

    // 7) Decide note duration
    // We'll see if subSec prescribes a typical length in beats (like 0.5 or 1.0).
    // We'll convert beats -> steps. Then clamp to the end of subSec or phrase.
    const durationBeats = this._pickDurationBeats(subSecCfg);
    let durationSteps = Math.floor(durationBeats * (this.stepsPerBar / 4.0));
    // If your bar is 4 beats, stepsPerBar/4 => steps per beat. For 16 spb => 4 steps per beat.
    // This is one example approach.

    // If we're near the phrase end or in cadence, we might override for a hold
    if (isCadenceZone) {
      // e.g., if we have a dedicated 'cadenceBeats', hold that entire region
      durationSteps = this._computeCadenceSteps(localStep);
    }

    // But ensure we don't run beyond phrase boundary
    const endOfPhraseStep = this.getLength();
    const noteEnd = Math.min(localStep + durationSteps, endOfPhraseStep);

    // 8) Create a note object
    const newNoteObj = {
      note: pitch,
      velocity,
      startStep: localStep,
      endStep: noteEnd,
    };
    this.activeNotes.push(newNoteObj);

    // Return the newly triggered note (and no noteOff yet)
    // We'll handle noteOff automatically once step >= endStep in subsequent ticks
    return this._buildNoteArray([newNoteObj], localStep);
  }

  /**
   * Returns total steps in the phrase (phraseBars * stepsPerBar).
   */
  getLength() {
    return this.totalPhraseSteps;
  }

  // ----------------------------------------------------------
  // Internal Implementation
  // ----------------------------------------------------------

  /**
   * Builds the subSectionMap: an array of { type, startStep, endStep }
   * dividing the phrase. The final portion might be used for "cadenceBeats."
   */
  _buildSubSectionMap() {
    // We'll treat the phrase (0..totalPhraseSteps-1) as an integer chunk.
    // We'll allocate subSections in equal segments except we keep "cadence" time aside.
    // For example, if subSections=4 and we have 64 steps, we might do 64 / 4=16 each.
    // If user wants a "cadenceBeats=2," we subtract those steps from the last subSection or treat it as a separate subSection (like "cadence").
    const totalSteps = this.getLength();
    // Convert 'cadenceBeats' into steps:
    const beatsPerBar = 4; // If you define your bar as 4 beats
    const stepsPerBeat = this.stepsPerBar / beatsPerBar;
    const cadenceSteps = Math.floor(this.cadenceBeats * stepsPerBeat);

    const subSectionCount = this.subSections.length;
    const mainSteps = Math.max(0, totalSteps - cadenceSteps);

    // We'll slice mainSteps into subSectionCount segments
    const segmentLength = Math.floor(mainSteps / subSectionCount);

    let start = 0;
    for (let i = 0; i < subSectionCount; i++) {
      let end = i === subSectionCount - 1 ? mainSteps : start + segmentLength;
      this.subSectionMap.push({
        type: this.subSections[i],
        startStep: start,
        endStep: end,
      });
      start = end;
    }

    // Now if there's a cadenceSteps leftover, we treat that as an implicit "cadence" zone
    if (cadenceSteps > 0) {
      // We'll label it "cadence" if not already in subSections
      this.subSectionMap.push({
        type: "cadence",
        startStep: mainSteps,
        endStep: totalSteps,
      });
    }
  }

  /**
   * Returns which subSection (string) the localStep is in.
   */
  _findSubSection(localStep) {
    for (const sec of this.subSectionMap) {
      if (localStep >= sec.startStep && localStep < sec.endStep) {
        return sec.type;
      }
    }
    // fallback
    return this.subSections[this.subSections.length - 1] || "resolve";
  }

  /**
   * Check if localStep is in the final "cadence" zone of the phrase
   */
  _isInCadenceZone(localStep) {
    const last = this.subSectionMap[this.subSectionMap.length - 1];
    if (!last) return false;
    if (last.type !== "cadence") return false;
    return localStep >= last.startStep;
  }

  /**
   * Convert the remaining steps in the "cadence" region to a single hold duration if desired.
   */
  _computeCadenceSteps(localStep) {
    const last = this.subSectionMap[this.subSectionMap.length - 1];
    if (!last || last.type !== "cadence") return 1;
    return Math.max(1, last.endStep - localStep);
  }

  /**
   * A dictionary describing how each subSection should shape pitch direction, durations, velocity, etc.
   * You can expand or tune these 'presets' as you see fit.
   */
  _getSubSectionConfig(subSecType) {
    const presets = {
      intro: {
        pitchDirection: "mild_asc", // or stable
        durationBeatsRange: [0.5, 1.0],
        velocityFactor: 0.9,
        velocityJitter: 5,
      },
      build: {
        pitchDirection: "ascend",
        durationBeatsRange: [0.25, 0.5], // shorter notes
        velocityFactor: 1.0,
        velocityJitter: 10,
      },
      peak: {
        pitchDirection: "high",
        durationBeatsRange: [0.75, 1.5], // might do a bigger hold
        velocityFactor: 1.2,
        velocityJitter: 5,
      },
      plateau: {
        pitchDirection: "upper_stable",
        durationBeatsRange: [0.5, 1.0],
        velocityFactor: 1.1,
        velocityJitter: 5,
      },
      fall: {
        pitchDirection: "descend",
        durationBeatsRange: [0.5, 1.0],
        velocityFactor: 1.0,
        velocityJitter: 8,
      },
      resolve: {
        pitchDirection: "stable_low",
        durationBeatsRange: [0.5, 1.0],
        velocityFactor: 0.9,
        velocityJitter: 5,
      },
      cadence: {
        pitchDirection: "root_hold",
        durationBeatsRange: [2.0, 2.0],
        velocityFactor: 0.8,
        velocityJitter: 3,
      },
      bridge: {
        pitchDirection: "wander",
        durationBeatsRange: [0.25, 0.75],
        velocityFactor: 1.0,
        velocityJitter: 10,
      },
      tag: {
        pitchDirection: "repeat",
        durationBeatsRange: [0.5, 1.0],
        velocityFactor: 1.0,
        velocityJitter: 5,
      },
    };
    return (
      presets[subSecType] || {
        pitchDirection: "stable",
        durationBeatsRange: [0.5, 0.75],
        velocityFactor: 1.0,
        velocityJitter: 5,
      }
    );
  }

  /**
   * Decide a random duration (in beats) from subSection config. We'll use that to convert to steps.
   */
  _pickDurationBeats(subSecCfg) {
    const [minB, maxB] = subSecCfg.durationBeatsRange;
    const val = minB + Math.random() * (maxB - minB);
    return val;
  }

  /**
   * Picks a pitch from chord notes with the subSec "pitchDirection" in mind,
   * plus optional tension-based approach notes. Return a string (e.g. "C4") or null.
   */
  _pickPitch(chordNotes, subSecCfg, tensionLevel, embellishProb) {
    if (!chordNotes.length) return null;

    // We'll interpret subSecCfg.pitchDirection to pick from chordNotes.
    // For tension, we may randomly pick a semitone above or below a chord tone if random < embellishProb.

    // Basic approach:
    // 1) Possibly pick a chord tone from top, middle, or bottom based on direction
    // 2) Possibly add approach note if random < embellishProb

    // Sort chordNotes by pitch ascending
    // (We'll define a small helper to convert noteName->midi for sorting.)
    const sortedMidi = chordNotes
      .map((n) => ({ name: n, midi: this._noteNameToMidi(n) }))
      .sort((a, b) => a.midi - b.midi);

    let targetMidi;
    switch (subSecCfg.pitchDirection) {
      case "ascend":
      case "high":
        // prefer higher chord tones
        targetMidi = sortedMidi[sortedMidi.length - 1].midi;
        break;
      case "descend":
      case "stable_low":
        targetMidi = sortedMidi[0].midi;
        break;
      case "mild_asc":
        // pick from the top half
        if (sortedMidi.length < 2) {
          targetMidi = sortedMidi[0].midi;
        } else {
          const halfIdx = Math.floor(sortedMidi.length / 2);
          targetMidi =
            sortedMidi[
              halfIdx +
                Math.floor(Math.random() * (sortedMidi.length - halfIdx))
            ].midi;
        }
        break;
      case "upper_stable":
        // pick near top but not strictly top
        if (sortedMidi.length > 2) {
          targetMidi = sortedMidi[sortedMidi.length - 2].midi;
        } else {
          targetMidi = sortedMidi[sortedMidi.length - 1].midi;
        }
        break;
      case "root_hold":
        // find the root or just pick the lowest if we don't know
        // For simplicity, pick the lowest or see if there's "C" in chordNotes.
        // We'll just pick the first sorted for now:
        targetMidi = sortedMidi[0].midi;
        break;
      case "wander":
        // pick any random chord tone
        targetMidi =
          sortedMidi[Math.floor(Math.random() * sortedMidi.length)].midi;
        break;
      case "repeat":
        // pick the middle as a simple approach
        targetMidi = sortedMidi[Math.floor(sortedMidi.length / 2)].midi;
        break;
      default:
        // "stable"
        targetMidi = sortedMidi[Math.floor(sortedMidi.length / 2)].midi;
        break;
    }

    // If tension is above none, we might do approach note
    if (Math.random() < embellishProb) {
      // +/-1 semitone
      if (Math.random() < 0.5) targetMidi += 1;
      else targetMidi -= 1;
    }

    return this._midiToNoteName(targetMidi);
  }

  /**
   * Utility method that, for a given set of newly triggered notes,
   * returns an array of { note, velocity, durationSteps } or empty.
   * Because we do noteOff scheduling in a hold approach, we can set durationSteps=1
   * so the system doesn't automatically off them—**or** we do the entire hold now.
   *
   * In many of your patterns, you schedule noteOff yourself. We'll do the "1 step" approach
   * so each step we manage the holds ourselves.
   */
  _buildNoteArray(newNoteObjs, currentStep) {
    if (!newNoteObjs || !newNoteObjs.length) return [];

    // We can treat each new note with durationSteps=1 so the system won't noteOff automatically
    // We'll manually noteOff when localStep >= noteObj.endStep in subsequent calls.
    return newNoteObjs.map((n) => ({
      note: n.note,
      velocity: n.velocity,
      durationSteps: 1,
    }));
  }

  // ----------------------------------------------------------------
  // Note name <-> midi utils
  // (You can replace with a better parse if you have a library.)
  // ----------------------------------------------------------------
  _noteNameToMidi(noteName) {
    // Very simplified parse for e.g. "C4", "G#3"
    // fallback = 60 if parse fails
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
    const m = noteName.match(/^([A-G][b#]?)(\d+)$/i);
    if (!m) return 60;
    const [, pitch, octStr] = m;
    const semitone = map[pitch] ?? 0;
    const octave = parseInt(octStr, 10);
    return 12 * (octave + 1) + semitone;
  }
  _midiToNoteName(midiVal) {
    const noteNames = [
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
    const clamp = Math.max(0, Math.min(127, midiVal));
    const name = noteNames[clamp % 12];
    const octave = Math.floor(clamp / 12) - 1;
    return name + octave;
  }
}
