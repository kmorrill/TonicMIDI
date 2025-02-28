/**
 * src/energy-manager.js
 *
 * The EnergyManager is an optional high-level orchestrator that adjusts
 * LiveLoops in real-time to reflect changes in "energy," such as hype or tension.
 * It does not handle transport or MIDI directly—only manipulates loops' patterns,
 * LFO parameters, muting/unmuting, etc.
 *
 * This example assumes:
 *  - Your LiveLoops have some methods for pattern swapping, muting, and possibly LFO updates.
 *  - Your Patterns can change voicings, tension, or other qualities if applicable.
 *
 * Usage:
 *   const manager = new EnergyManager({ liveLoops: [drumLoop, bassLoop, melodyLoop] });
 *   manager.setHypeLevel("full");   // manipulates loops to "full" arrangement
 *   manager.setTensionLevel("high"); // more dissonant chords, removing fundamental, etc.
 */

export class EnergyManager {
  /**
   * @param {object} options
   * @param {Array}  [options.liveLoops=[]] - The LiveLoops under management.
   */
  constructor({ liveLoops = [] } = {}) {
    // The loops we will orchestrate
    this.liveLoops = liveLoops;

    // Track current hype/tension states if needed
    this.currentHypeLevel = null;
    this.currentTensionLevel = null;

    // If your system has certain known patterns or configurations, you can store them here:
    // e.g., this.availableDrumPatterns = { low: drumPatternLow, full: drumPatternFull };
    // or you can compute them on the fly in setHypeLevel, etc.
  }

  /**
   * Sets the hype level (e.g., "low", "medium", "full") across all relevant LiveLoops.
   * This might involve:
   *   - Muting/unmuting certain loops
   *   - Swapping patterns for busier or simpler ones
   *   - Adjusting LFO frequencies or amplitudes
   *
   * @param {string} level - e.g. "low", "medium", "full", or other
   */
  setHypeLevel(level) {
    this.currentHypeLevel = level;
    console.log(`EnergyManager: Setting hype level to "${level}"`);

    // Example logic (stub):
    switch (level) {
      case "full": {
        // 1) Unmute all loops or add new loops for a "full" arrangement
        // 2) Switch some loops to more intense patterns
        // 3) Increase LFO amplitude/frequency for more movement

        // Example pseudo-code for loops with hypothetical methods:
        this.liveLoops.forEach((loop) => {
          // If loop is a drums loop, pick a busier pattern
          if (loop.name === "Drums") {
            loop.setMuted(false);
            // Possibly queue or immediate
            // e.g. loop.setPattern(fullBusyDrumPattern, /* immediate= */ true);
          }

          // If loop is a melodic line, raise LFO freq
          if (loop.lfos && loop.lfos[0]) {
            loop.lfos[0].setFrequency(2.0);
            loop.lfos[0].setAmplitude(1.0);
          }
        });
        break;
      }

      case "medium": {
        // Partially unmute loops, or use medium-intensity patterns
        // ...
        this.liveLoops.forEach((loop) => {
          // Example: if a loop is "Pad", use a mid-intensity chord pattern
          if (loop.name === "Pad") {
            loop.setMuted(false);
            // loop.setPattern(mediumPadPattern);
          }
        });
        break;
      }

      case "low": {
        // Possibly mute some loops, pick simpler patterns
        this.liveLoops.forEach((loop) => {
          // If not critical, mute it
          if (loop.name !== "Bass") {
            loop.setMuted(true);
          }
          // If we do keep a loop, choose a minimal pattern
          // e.g. loop.setPattern(sparsePattern, false);
        });
        break;
      }

      default: {
        console.warn(
          `EnergyManager: Unknown hype level "${level}". No changes made.`
        );
        break;
      }
    }
  }

  /**
   * Sets the tension level ("none", "mid", "high", etc.). This might involve:
   *   - Using more dissonant chord patterns
   *   - Omitting certain chord tones for implied tension
   *   - Filtration or removing fundamental frequencies to create "missing" tension
   *
   * @param {string} level - e.g. "none", "mid", "high"
   */
  setTensionLevel(level) {
    this.currentTensionLevel = level;
    console.log(`EnergyManager: Setting tension level to "${level}"`);

    // Example logic (stub):
    switch (level) {
      case "high": {
        // Possibly push chord loops to dissonant or dominant-based patterns
        // Or remove the root from the bass line for implied tension
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Chord") {
            // loop.setPattern(dissonantChordPattern);
          }
          if (loop.name === "Bass") {
            // loop.setPattern(noRootBassPattern);
          }
        });
        break;
      }

      case "mid": {
        // Some moderate tension approach
        this.liveLoops.forEach((loop) => {
          // e.g., loop.setPattern(slightlyDissonantPattern);
        });
        break;
      }

      case "none": {
        // Very stable chord approach or minimal tension
        this.liveLoops.forEach((loop) => {
          // loop.setPattern(stableChordPattern);
        });
        break;
      }

      default: {
        console.warn(
          `EnergyManager: Unknown tension level "${level}". No changes made.`
        );
        break;
      }
    }
  }

  /**
   * Add or remove a LiveLoop from the manager. Useful if loops are created dynamically.
   */
  addLiveLoop(loop) {
    this.liveLoops.push(loop);
  }

  removeLiveLoop(loop) {
    this.liveLoops = this.liveLoops.filter((l) => l !== loop);
  }

  /**
   * (Optional) A method to set arrangement style, or other categories of changes.
   * For example, "setArrangementStyle('wide')" might force wide chord voicings or bigger reverb, etc.
   */
  setArrangementStyle(style) {
    console.log(`EnergyManager: Setting arrangement style to "${style}"`);

    // Example: switch patterns or transform loops based on arrangement style
    switch (style) {
      case "wide":
        // e.g. all chord loops use wide voicings
        this.liveLoops.forEach((loop) => {
          // if loop is a chord pattern, do something like loop.pattern.setVoicing("open");
        });
        break;
      case "minimal":
        // ...
        break;
      default:
        console.warn(`Unknown arrangement style: ${style}`);
        break;
    }
  }
}
