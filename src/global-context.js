/**
 * src/global-context.js
 *
 * The GlobalContext provides a centralized way to share harmonic and rhythmic information
 * between patterns and managers. It serves as a container for the ChordManager, RhythmManager,
 * EnergyManager, and potentially other shared state needed by patterns.
 */

import { ChordManager } from "./chord-manager.js";
import { RhythmManager } from "./rhythm-manager.js";
import { EnergyManager } from "./energy-manager.js"; // Assuming EnergyManager is defined elsewhere

export class GlobalContext {
  /**
   * @param {Object} options
   * @param {ChordManager} [options.chordManager] - The chord manager instance
   * @param {RhythmManager} [options.rhythmManager] - The rhythm manager instance
   * @param {EnergyManager} [options.energyManager] - The energy manager instance
   * @param {Object} [options.additionalContext={}] - Any additional shared context
   */
  constructor({
    chordManager = new ChordManager(),
    rhythmManager = new RhythmManager(),
    energyManager = null, // EnergyManager is now an optional parameter
    additionalContext = {},
  } = {}) {
    this.chordManager = chordManager;
    this.rhythmManager = rhythmManager;
    this.energyManager = energyManager; // Store the energy manager instance

    // Store any additional context (e.g., global key, scale, etc.)
    this.additionalContext = additionalContext;

    // For tracking energy and tension levels globally
    this.energyState = {
      hypeLevel: "low",
      tensionLevel: "none",
    };
  }

  /**
   * Sets the global tension level and propagates it to the chord manager
   *
   * @param {string} level - Tension level ("none", "low", "mid", "high")
   */
  setTensionLevel(level) {
    this.energyState.tensionLevel = level;
    if (this.chordManager) {
      this.chordManager.setTensionLevel(level);
    }
  }

  /**
   * Sets the global hype level (energy or intensity)
   *
   * @param {string} level - Hype level ("low", "medium", "high")
   */
  setHypeLevel(level) {
    this.energyState.hypeLevel = level;

    // Potentially set rhythm subdivision based on hype level
    if (this.rhythmManager) {
      switch (level) {
        case "high":
          this.rhythmManager.setSubdivision("doubleTime");
          break;
        case "medium":
          this.rhythmManager.setSubdivision("normal");
          break;
        case "low":
          this.rhythmManager.setSubdivision("halfTime");
          break;
      }
    }
  }

  /**
   * Gets the current energy state
   *
   * @returns {Object} The current energy state (hype and tension levels)
   */
  getEnergyState() {
    return { ...this.energyState };
  }

  /**
   * Updates or adds additional context data
   *
   * @param {Object} newContext - New context data to merge with existing additionalContext
   */
  updateAdditionalContext(newContext) {
    this.additionalContext = {
      ...this.additionalContext,
      ...newContext,
    };
  }

  /**
   * Creates a pattern-specific context that includes all global context plus
   * pattern-specific overrides
   *
   * @param {Object} patternContext - Pattern-specific context that overrides global values
   * @returns {Object} Combined context with pattern-specific values taking precedence
   */
  createPatternContext(patternContext = {}) {
    return {
      chordManager: this.chordManager,
      rhythmManager: this.rhythmManager,
      energyManager: this.energyManager, // Include energyManager in the pattern context
      energyState: this.getEnergyState(),
      ...this.additionalContext,
      ...patternContext,
    };
  }
}
