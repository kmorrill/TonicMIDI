import { AbstractPattern } from "./pattern-interface.js";

export class DrumPattern extends AbstractPattern {
  constructor({
    // A single pattern specifying "medium" by default
    mediumPattern,

    // Optional device-specific mapping: e.g. {kick:"C3", snare:"D3", hh:"F#3"}
    drumMap = {},

    // Number of steps in each pattern
    patternLength = 16,
  } = {}) {
    super();

    this.drumMap = drumMap;
    this.patternLength = patternLength;
    this.currentHype = "medium"; // default

    // Generate low & high from the medium data
    const { low, medium, high } = this._inferLowAndHighPatterns(mediumPattern);
    this.patterns = { low, medium, high };
  }

  /**
   * Over-simplified heuristic: drop some hits for low, add more hits for high.
   * You can expand or refine this logic for your own style.
   */
  _inferLowAndHighPatterns(mediumPattern) {
    const lowPattern = {};
    const highPattern = {};

    for (const drumName in mediumPattern) {
      const medArray = mediumPattern[drumName];

      // Low: keep strong beats, remove others or keep rarely
      const lowArray = medArray.map((val, idx) => {
        // Keep if it's a strong beat & originally a hit
        if (idx % 4 === 0 && val === 1) return 1;
        // Else random small chance
        if (val === 1 && Math.random() < 0.3) return 1;
        return 0;
      });

      // High: keep the medium hits, and occasionally add extra hits on empty steps
      const highArray = medArray.map((val, idx) => {
        if (val === 1) return 1;
        // offbeat or 16th expansions
        if (idx % 2 !== 0 && Math.random() < 0.4) return 1;
        return 0;
      });

      lowPattern[drumName] = lowArray;
      highPattern[drumName] = highArray;
    }

    return {
      low: lowPattern,
      medium: mediumPattern,
      high: highPattern,
    };
  }

  /**
   * Called by the LiveLoop's tick method to get any hits on this step.
   */
  getNotes(stepIndex, context) {
    // If we want to override from context, do so:
    if (context && context.energyState?.hypeLevel) {
      this.currentHype = context.energyState.hypeLevel;
    }

    const patternSet = this.patterns[this.currentHype];
    if (!patternSet) return [];

    // 16-step repeating
    const stepInBar = stepIndex % this.patternLength;

    const hits = [];
    for (const drumName in patternSet) {
      const drumArray = patternSet[drumName];
      if (!drumArray || !Array.isArray(drumArray)) continue;

      if (drumArray[stepInBar] === 1) {
        // Map the logical name ("kick") to the actual MIDI note
        const note = this.drumMap[drumName] || "C3";
        hits.push({
          note,
          velocity: 100,
          durationSteps: 1,
        });
      }
    }
    return hits;
  }

  getLength() {
    return this.patternLength;
  }

  /**
   * Let the EnergyManager or user code override the hype level manually.
   */
  setHypeLevel(level) {
    if (["low", "medium", "high"].includes(level)) {
      this.currentHype = level;
    }
  }
}
