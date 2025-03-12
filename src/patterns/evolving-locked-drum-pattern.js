// File: patterns/evolving-locked-drum-pattern.js

import { BasePattern } from "./base-pattern.js";

export class EvolvingLockedDrumPattern extends BasePattern {
  constructor(options = {}) {
    super(options);

    this.patternLength = options.patternLength ?? 16;
    this.drumIntensity = options.drumIntensity ?? 0.5;
    this.flavor = options.flavor ?? "house"; // or "ambient","tribal","lofi", etc.

    this.deviceDefinition = options.deviceDefinition || null;

    this._lastHype = null;
    this._lastTension = null;
    this._lastDrumIntensity = this.drumIntensity;
    this._lastFlavor = this.flavor;

    this.cachedPattern = [];
  }

  getNotes(stepIndex, context = {}) {
    const hype = context.energyManager?.getHypeLevel?.() || "low";
    const tension = context.energyManager?.getTensionLevel?.() || "none";

    // If we detect changes in hype/tension/intensity/flavor, rebuild the pattern
    if (
      hype !== this._lastHype ||
      tension !== this._lastTension ||
      this.drumIntensity !== this._lastDrumIntensity ||
      this.flavor !== this._lastFlavor ||
      !this.cachedPattern.length
    ) {
      this._generatePattern(hype, tension);

      this._lastHype = hype;
      this._lastTension = tension;
      this._lastDrumIntensity = this.drumIntensity;
      this._lastFlavor = this.flavor;
    }

    const stepInBar = stepIndex % this.patternLength;
    return this.cachedPattern[stepInBar] || [];
  }

  getLength() {
    return this.patternLength;
  }

  setDrumIntensity(value) {
    this.drumIntensity = Math.max(0, Math.min(1, value));
  }

  setFlavor(newFlavor) {
    this.flavor = newFlavor;
  }

  forceRegenerate(context = {}) {
    const hype = context.energyManager?.getHypeLevel?.() || "low";
    const tension = context.energyManager?.getTensionLevel?.() || "none";
    this._generatePattern(hype, tension);
    this._lastHype = hype;
    this._lastTension = tension;
    this._lastDrumIntensity = this.drumIntensity;
    this._lastFlavor = this.flavor;
  }

  // ---------------------------------------------------
  // Main pattern generation
  // ---------------------------------------------------
  _generatePattern(hype, tension) {
    // Initialize empty step arrays
    this.cachedPattern = Array.from({ length: this.patternLength }, () => []);

    // 1) Build the foundation pattern for this flavor & hype
    const foundation = getFoundationPattern(this.flavor, hype, tension);

    // 2) Merge that foundation into the cached array
    for (let step = 0; step < this.patternLength; step++) {
      for (const fHit of foundation[step]) {
        // fHit is { drumName, velocity }
        this.cachedPattern[step].push({
          note: this._lookupDrumNote(fHit.drumName),
          velocity: fHit.velocity,
          durationSteps: 1,
        });
      }
    }

    // 3) Add random hits on top, scaled by hype + intensity
    const hypeFactor = getHypeFactor(hype);
    for (let step = 0; step < this.patternLength; step++) {
      // Fewer attempts if intensity is low. We do a max of 2–3 for medium or high.
      // For example:
      //    maxHits = 3 * drumIntensity * hypeFactor => ~ 0..4 attempts
      // But we clamp it so that at low intensity it might be 0–1 attempts, not big.
      const baseMax = 3 * this.drumIntensity * hypeFactor; // e.g. up to 3 if intensity=1 & hype=medium
      const attempts = Math.floor(Math.random() * baseMax);

      const flavorPools = getInstrumentPoolsForFlavor(this.flavor);

      // Attempt random overlays
      for (let i = 0; i < attempts; i++) {
        const chosen = pickWeightedInstrument(flavorPools, hype);
        if (!chosen) continue;

        // If the foundation or an existing random pick is already here, maybe skip
        const alreadyHere = this.cachedPattern[step].some(
          (hit) => hit._origName === chosen
        );
        if (alreadyHere) continue;

        const randomVel = decideVelocity(hype, this.drumIntensity);
        this.cachedPattern[step].push({
          note: this._lookupDrumNote(chosen),
          _origName: chosen,
          velocity: randomVel,
          durationSteps: 1,
        });
      }

      // If tension is mid or high, possibly add a “spicy” accent
      if (tension === "mid" || tension === "high") {
        if ([2, 6, 10, 14].includes(step)) {
          const spiceChance = tension === "high" ? 0.3 : 0.15;
          if (Math.random() < spiceChance) {
            const edgy = pickRandom(["metal", "chi", "cowbell", "guiro"]);
            // Don’t double-add if it’s already there
            if (
              !this.cachedPattern[step].some((hit) => hit._origName === edgy)
            ) {
              this.cachedPattern[step].push({
                note: this._lookupDrumNote(edgy),
                _origName: edgy,
                velocity: tension === "high" ? 100 : 80,
                durationSteps: 1,
              });
            }
          }
        }
      }
    }
  }

  _lookupDrumNote(drumNameOrNote) {
    if (typeof drumNameOrNote === "number") {
      return drumNameOrNote;
    }
    if (!this.deviceDefinition) {
      return 60; // fallback if no definition
    }
    const found = this.deviceDefinition.getDrumNote(drumNameOrNote);
    return found == null ? 60 : found;
  }
}

// -------------------------------------------------------------------
// "Minimal at Low Hype" Foundation Patterns
// -------------------------------------------------------------------
function getFoundationPattern(flavor, hype, tension) {
  // We’ll store an array of length=16, each step is an array of objects:
  // e.g. foundation[step] = [ { drumName:"kick", velocity:80 }, ... ]
  const foundation = Array.from({ length: 16 }, () => []);

  // Decide a base velocity for the backbone hits
  let backboneVel = 100;
  if (hype === "low") backboneVel = 70;
  if (hype === "medium") backboneVel = 100;
  if (hype === "high") backboneVel = 115;

  switch (flavor) {
    case "house":
      if (hype === "low") {
        // Very minimal: just a single quiet(ish) kick on step 0
        foundation[0].push({ drumName: "kick", velocity: backboneVel });
      } else if (hype === "medium") {
        // Standard 4-on-floor
        [0, 4, 8, 12].forEach((s) =>
          foundation[s].push({ drumName: "kick", velocity: backboneVel })
        );
        // Soft snare at 4,12
        [4, 12].forEach((s) =>
          foundation[s].push({ drumName: "snare", velocity: backboneVel - 10 })
        );
      } else {
        // hype=high => same 4-on-floor + possibly add hats
        [0, 4, 8, 12].forEach((s) =>
          foundation[s].push({ drumName: "kick", velocity: backboneVel })
        );
        [4, 12].forEach((s) =>
          foundation[s].push({ drumName: "snare", velocity: backboneVel })
        );
        // Add open hat on 2,6,10,14 (light accent)
        [2, 6, 10, 14].forEach((s) =>
          foundation[s].push({
            drumName: "open_hat",
            velocity: backboneVel - 20,
          })
        );
      }
      break;

    case "tribal":
      // Similar approach: for low hype => single random tom,
      // medium => bigger pattern, high => more steps, etc.
      // ...
      break;

    // ... your other flavors here

    default:
      // fallback or "ambient"
      if (hype === "low") {
        foundation[0].push({ drumName: "kick", velocity: backboneVel });
      } else if (hype === "medium") {
        [0, 8].forEach((s) =>
          foundation[s].push({ drumName: "kick", velocity: backboneVel })
        );
        [4, 12].forEach((s) =>
          foundation[s].push({ drumName: "snare", velocity: backboneVel })
        );
      } else {
        [0, 4, 8, 12].forEach((s) =>
          foundation[s].push({ drumName: "kick", velocity: backboneVel })
        );
        foundation[4].push({ drumName: "snare", velocity: backboneVel });
        foundation[12].push({ drumName: "snare", velocity: backboneVel });
      }
      break;
  }

  // If tension is high, we could add a mild boost or something to certain steps
  if (tension === "high") {
    // E.g. add a clap or rim on step 2 just to underscore tension
    foundation[2].push({ drumName: "clap", velocity: backboneVel });
  }

  // Return our 16-step foundation
  return foundation;
}

// -------------------------------------------------------------------
// Remaining random logic is mostly unchanged
// -------------------------------------------------------------------
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

function getInstrumentPoolsForFlavor(flavor) {
  switch (flavor) {
    case "house":
      return {
        primary: ["kick"],
        secondary: ["snare", "clap", "closed_hat", "open_hat"],
        tertiary: ["ride", "crash", "shaker", "tambourine", "cowbell"],
      };
    // ...
    default:
      // fallback or "ambient"
      return {
        primary: ["kick", "rim"],
        secondary: ["snare", "shaker", "tambourine"],
        tertiary: ["open_hat", "crash", "metal", "cowbell"],
      };
  }
}

function pickWeightedInstrument(pools, hype) {
  // same weighting logic as before
  let wPrimary = 1.0;
  let wSecondary = 1.0;
  let wTertiary = 0.5;
  switch (hype) {
    case "low":
      wSecondary = 0.4;
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
  const total = wPrimary + wSecondary + wTertiary;
  const r = Math.random() * total;
  if (r < wPrimary) {
    return pickRandom(pools.primary);
  } else if (r < wPrimary + wSecondary) {
    return pickRandom(pools.secondary);
  } else {
    return pickRandom(pools.tertiary);
  }
}

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Velocity shaping for random hits
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
  const final = scaled + (Math.random() * 10 - 5); // ±5 randomization
  return Math.max(1, Math.min(127, Math.round(final)));
}
