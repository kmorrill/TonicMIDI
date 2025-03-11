// File: patterns/evolving-locked-drum-pattern.js

import { BasePattern } from "./base-pattern.js";

/**
 * EvolvingLockedDrumPattern
 *
 * - Acts as your single "kickProvider" if used that way (ensuring a main Kick).
 * - Reads hype & tension from context.energyManager, plus 2 local params:
 *     1) drumIntensity (0..1)
 *     2) flavor (a string like "ambient","tribal","electronic","lofi", etc.)
 * - Whenever (hype, tension, drumIntensity, or flavor) changes, it re-generates
 *   a new 16-step pattern (with random logic). Until they change again, the pattern
 *   is locked, so each bar repeats the same hits.
 *
 * **Device Definition Lookup**:
 * If you pass `deviceDefinition` in the constructor options, any drum name
 * like `"kick"`, `"snare"`, etc. will be converted to its MIDI note number
 * via `deviceDefinition.getDrumNote(...)`.
 *
 * Example usage:
 * ```js
 *   const pattern = new EvolvingLockedDrumPattern({
 *     patternLength: 16,
 *     drumIntensity: 0.3,
 *     flavor: "lofi",
 *     deviceDefinition: myOpXyDevice,  // so it can map drum names to MIDI notes
 *   });
 *
 *   const loop = new LiveLoop(midiBus, {
 *     pattern,
 *     deviceManager,
 *     midiOutputId: "op-xy-output",
 *     role: "kickProvider",
 *   });
 *
 *   // Then calls like:
 *   energyManager.setHypeLevel("medium");
 *   pattern.setDrumIntensity(0.8);  // triggers a fresh re-gen of the 16-step pattern
 * ```
 */
export class EvolvingLockedDrumPattern extends BasePattern {
  /**
   * @param {Object} options
   * @param {number} [options.patternLength=16]
   *   The total steps in one cycle. Typically 16 for a 4/4 measure.
   * @param {number} [options.drumIntensity=0.5]
   *   A single parameter (0..1) controlling how dense & loud the pattern is.
   *   - 0 => extremely sparse, lower velocities
   *   - 1 => more hits, higher velocities
   * @param {string} [options.flavor="ambient"]
   *   A style label controlling which instruments are favored.
   *   (e.g. "ambient","tribal","electronic","lofi")
   * @param {import("../device-definition.js").DeviceDefinition} [options.deviceDefinition=null]
   *   If provided, drum names like "kick" or "snare" will be mapped to numeric
   *   MIDI note values via `deviceDefinition.getDrumNote(...)`.
   */
  constructor(options = {}) {
    super(options);

    this.patternLength = options.patternLength ?? 16;
    this.drumIntensity = options.drumIntensity ?? 0.5;
    this.flavor = options.flavor ?? "ambient";

    /**
     * The DeviceDefinition (optional). If present, we convert drum names to MIDI numbers.
     * @private
     */
    this.deviceDefinition = options.deviceDefinition || null;

    // Keep track of last known hype/tension from energyManager so we can detect changes
    this._lastHype = null;
    this._lastTension = null;
    this._lastDrumIntensity = this.drumIntensity;
    this._lastFlavor = this.flavor;

    /**
     * We'll store a cached array of hits for each step:
     *   this.cachedPattern[stepIndex] => array of { note, velocity, durationSteps }
     */
    this.cachedPattern = [];

    // Initially, we don't know hype/tension. We'll generate the pattern
    // as soon as we first call getNotes(), or you can call forceRegenerate().
  }

  /**
   * getNotes is called each step by the LiveLoop. We:
   *   1) read current hype & tension from context
   *   2) compare with last-known hype/tension/flavor/drumIntensity
   *   3) if any have changed, re-generate a new 16-step pattern
   *   4) return the pre-computed hits for the current step
   */
  getNotes(stepIndex, context = {}) {
    // 1) read hype & tension from energyManager
    const hype = context.energyManager?.getHypeLevel?.() || "low";
    const tension = context.energyManager?.getTensionLevel?.() || "none";

    // 2) check if anything changed
    if (
      hype !== this._lastHype ||
      tension !== this._lastTension ||
      this.drumIntensity !== this._lastDrumIntensity ||
      this.flavor !== this._lastFlavor ||
      this.cachedPattern.length === 0 // or if we haven't generated yet
    ) {
      // 3) re-generate
      this._generatePattern(hype, tension);
      // record the new state
      this._lastHype = hype;
      this._lastTension = tension;
      this._lastDrumIntensity = this.drumIntensity;
      this._lastFlavor = this.flavor;
    }

    // 4) Return the hits stored for this step
    const stepInBar = stepIndex % this.patternLength;
    return this.cachedPattern[stepInBar] || [];
  }

  /**
   * getLength must return the number of steps before repeating.
   */
  getLength() {
    return this.patternLength;
  }

  /**
   * Let user set drumIntensity. We'll cause a re-gen next time getNotes is called.
   */
  setDrumIntensity(value) {
    this.drumIntensity = Math.max(0, Math.min(1, value));
  }

  /**
   * Let user set flavor. We'll cause a re-gen next time getNotes is called.
   */
  setFlavor(newFlavor) {
    this.flavor = newFlavor;
  }

  /**
   * If you want to forcibly re-generate in the middle of a bar,
   * you can call pattern.forceRegenerate(context).
   */
  forceRegenerate(context = {}) {
    const hype = context.energyManager?.getHypeLevel?.() || "low";
    const tension = context.energyManager?.getTensionLevel?.() || "none";
    this._generatePattern(hype, tension);

    // update stored values so we don't re-generate again immediately
    this._lastHype = hype;
    this._lastTension = tension;
    this._lastDrumIntensity = this.drumIntensity;
    this._lastFlavor = this.flavor;
  }

  /**
   * The core random logic, but we do it ONCE to fill up
   * this.cachedPattern[0..patternLength-1] with arrays of hits.
   * Then it won't change until hype/tension/flavor/intensity changes again.
   *
   * @private
   */
  _generatePattern(hype, tension) {
    // build empty array for each step
    this.cachedPattern = new Array(this.patternLength).fill(null).map(() => []);

    // We'll do the same random approach for each step:
    // For step in 0..patternLength-1, we generate hits based on hype/tension + user params
    const hypeFactor = getHypeFactor(hype);

    for (let step = 0; step < this.patternLength; step++) {
      // how many attempts for this step?
      const maxHits = Math.floor(this.drumIntensity * hypeFactor * 3 + 0.5);
      const attempts = Math.floor(Math.random() * (maxHits + 1));

      // pick instruments for each attempt
      const pools = getInstrumentPoolsForFlavor(this.flavor);
      const hitsForStep = [];

      for (let i = 0; i < attempts; i++) {
        const chosenNote = pickWeightedInstrument(pools, hype);
        if (chosenNote) {
          hitsForStep.push({
            note: chosenNote,
            velocity: decideVelocity(hype, this.drumIntensity),
            durationSteps: 1,
          });
        }
      }

      // Kick provider logic:
      // ensure we have a real kick on step 0 if hype >= "medium"
      // or if hype="low" but intensity > 0.7
      if (
        hype === "medium" ||
        hype === "high" ||
        (hype === "low" && this.drumIntensity > 0.7)
      ) {
        if (step === 0 && !hitsForStep.some((h) => isKick(h.note))) {
          hitsForStep.push({
            note: "kick",
            velocity: 110,
            durationSteps: 1,
          });
        }
      }

      // If tension >= "mid", add “spicy” hits (metal, chi, cowbell, guiro) on offbeats
      if (tension === "mid" || tension === "high") {
        const spiceSteps = [2, 6, 10, 14];
        if (spiceSteps.includes(step)) {
          const spiceChance = tension === "high" ? 0.25 : 0.15;
          if (Math.random() < spiceChance) {
            const edgy = pickRandom(["metal", "chi", "cowbell", "guiro"]);
            hitsForStep.push({
              note: edgy,
              velocity: tension === "high" ? 100 : 80,
              durationSteps: 1,
            });
          }
        }
      }

      // unify duplicates
      const finalHits = mergeDuplicates(hitsForStep);

      // Convert any string-based drum name to a numeric MIDI note if possible
      finalHits.forEach((hit) => {
        hit.note = this._lookupDrumNote(hit.note);
      });

      this.cachedPattern[step] = finalHits;
    }
  }

  /**
   * Converts a drum name like "kick", "snare" into a numeric MIDI note
   * via `deviceDefinition.getDrumNote(...)`. If none found, defaults to 60 (C4).
   *
   * @private
   * @param {string|number} drumNameOrNote - e.g. "kick", "snare", or numeric MIDI
   * @returns {number} MIDI note number
   */
  _lookupDrumNote(drumNameOrNote) {
    // If pattern logic already assigned numeric MIDI note, just return it
    if (typeof drumNameOrNote === "number") {
      return drumNameOrNote;
    }
    // If no deviceDefinition, fallback to 60
    if (!this.deviceDefinition) {
      return 60; // fallback
    }
    // Attempt to look up
    const num = this.deviceDefinition.getDrumNote(drumNameOrNote);
    if (num !== null) {
      return num;
    }
    // fallback
    return 60;
  }
}

/* ------------------------------------------------------------------
   HELPER UTILS (same logic as before, but used once in _generatePattern)
   ------------------------------------------------------------------ */

/**
 * Convert hype => a factor for density
 */
function getHypeFactor(hype) {
  switch (hype) {
    case "low":
      return 0.5;
    case "medium":
      return 1.0;
    case "high":
      return 1.5;
    default:
      return 1.0;
  }
}

/**
 * Returns instrument pools for each flavor,
 * which we pick from with pickWeightedInstrument().
 */
function getInstrumentPoolsForFlavor(flavor) {
  switch (flavor) {
    case "tribal":
      return {
        primary: ["kick", "low_tom", "conga_low"],
        secondary: [
          "snare",
          "mid_tom",
          "high_tom",
          "conga_high",
          "shaker",
          "rim",
        ],
        tertiary: [
          "cowbell",
          "tambourine",
          "metal",
          "chi",
          "ride",
          "pedal_hat",
        ],
      };
    case "electronic":
      return {
        primary: ["kick", "kick_alt", "snare", "snare_alt"],
        secondary: [
          "closed_hat",
          "open_hat",
          "pedal_hat",
          "clap",
          "rim",
          "crash",
        ],
        tertiary: ["metal", "chi", "ride", "shaker", "tambourine", "cowbell"],
      };
    case "lofi":
      return {
        primary: ["kick", "snare_alt", "rim", "snap"],
        secondary: [
          "shaker",
          "tambourine",
          "guiro",
          "clap",
          "kick_alt",
          "pedal_hat",
        ],
        tertiary: ["crash", "metal", "chi", "cowbell", "ride", "open_hat"],
      };
    case "ambient":
    default:
      return {
        primary: ["kick", "rim", "shaker", "snap"],
        secondary: ["kick_alt", "snare", "tambourine", "clap", "guiro", "ride"],
        tertiary: [
          "open_hat",
          "conga_low",
          "conga_high",
          "cowbell",
          "crash",
          "metal",
        ],
      };
  }
}

/**
 * Weighted pick: "primary" always has weight 1.0,
 * "secondary" might be 0.5..1.2, "tertiary" might be 0.2..1.0 depending on hype.
 */
function pickWeightedInstrument(pools, hype) {
  let wPrimary = 1.0;
  let wSecondary = 1.0;
  let wTertiary = 0.5;

  switch (hype) {
    case "low":
      wSecondary = 0.5;
      wTertiary = 0.2;
      break;
    case "medium":
      wSecondary = 1.0;
      wTertiary = 0.5;
      break;
    case "high":
      wSecondary = 1.2;
      wTertiary = 1.0;
      break;
  }

  const totalWeight = wPrimary + wSecondary + wTertiary;
  const r = Math.random() * totalWeight;

  if (r < wPrimary) {
    return pickRandom(pools.primary ?? []);
  } else if (r < wPrimary + wSecondary) {
    return pickRandom(pools.secondary ?? []);
  } else {
    return pickRandom(pools.tertiary ?? []);
  }
}

/**
 * Decide velocity from hype + intensity, adding small random offset.
 */
function decideVelocity(hype, intensity) {
  let baseMin = 40;
  let baseMax = 100;
  switch (hype) {
    case "low":
      baseMin = 30;
      baseMax = 70;
      break;
    case "medium":
      baseMin = 50;
      baseMax = 90;
      break;
    case "high":
      baseMin = 70;
      baseMax = 127;
      break;
  }
  const range = baseMax - baseMin;
  const scaled = baseMin + range * intensity;
  const final = scaled + (Math.random() * 10 - 5);
  return Math.max(1, Math.min(127, Math.round(final)));
}

/** Identify if noteName is "kick" or "kick_alt". */
function isKick(noteName) {
  return noteName === "kick" || noteName === "kick_alt";
}

/** Random pick from an array. Returns null if empty. */
function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Merge duplicates in a single step so we only keep one instance of each note. */
function mergeDuplicates(hits) {
  const seen = new Set();
  const result = [];
  for (const h of hits) {
    if (!seen.has(h.note)) {
      seen.add(h.note);
      result.push(h);
    }
  }
  return result;
}
