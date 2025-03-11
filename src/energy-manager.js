/**
 * src/energy-manager.js
 *
 * A hybrid approach:
 * - The manager does some big-picture changes (e.g. unmuting loops, storing "doubleTime")
 * - Patterns can read hype/tension from here, plus "currentSubdivision",
 *   and decide how to interpret that (like playing faster patterns).
 */

export class EnergyManager {
  /**
   * @param {object} options
   * @param {Array} [options.liveLoops=[]]
   *   The loops we can directly manipulate (mute/unmute, etc.).
   * @param {object} [options.globalContext=null]
   *   If you maintain a global context, we can store it. (Optional)
   */
  constructor({ liveLoops = [], globalContext = null } = {}) {
    this.liveLoops = liveLoops;
    this.globalContext = globalContext;

    // Defaults
    this.currentHypeLevel = "low";
    this.currentTensionLevel = "none";
    this.currentSubdivision = "normal"; // e.g., "normal", "doubleTime", or "halfTime"
    this.currentArrangementStyle = null;
  }

  /**
   * Sets the hype level ("low","medium","high", etc.),
   * does some big changes (unmute loops, etc.), and
   * sets `this.currentSubdivision` so patterns can see it and interpret double-time or half-time.
   *
   * @param {string} level
   */
  setHypeLevel(level) {
    console.log("[EnergyManager] setting hype to", level);
    this.currentHypeLevel = level;

    switch (level) {
      case "high":
        // Example: store "doubleTime" so patterns can see it
        this.currentSubdivision = "doubleTime";

        // Unmute certain loops (e.g., Drums) and intensify LFO
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Drums") {
            loop.setMuted(false);
            if (loop.lfos && loop.lfos[0]) {
              loop.lfos[0].setFrequency(2.0);
              loop.lfos[0].setAmplitude(1.0);
            }
          }
          // Possibly unmute or adjust other loops
          // e.g., loop.setMuted(false) for all
        });
        break;

      case "medium":
        // "medium" => normal subdivision
        this.currentSubdivision = "normal";
        // Possibly partially unmute or set moderate patterns
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Drums") {
            loop.setMuted(false);
            // Maybe do lesser LFO freq
            if (loop.lfos && loop.lfos[0]) {
              loop.lfos[0].setFrequency(1.0);
              loop.lfos[0].setAmplitude(0.8);
            }
          }
        });
        break;

      case "low":
        // "low" => halfTime
        this.currentSubdivision = "halfTime";
        // Possibly mute certain loops
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Drums") {
            loop.setMuted(true);
          }
        });
        break;

      default:
        console.warn(
          `EnergyManager: Unknown hype level "${level}". No changes made.`
        );
        break;
    }
  }

  /**
   * Sets the tension level. We do NOT push this to chordManager,
   * but store it for patterns to read if they want dissonance or omit fundamentals, etc.
   *
   * @param {string} level
   */
  setTensionLevel(level) {
    this.currentTensionLevel = level;
    switch (level) {
      case "none":
      case "low":
      case "mid":
      case "high":
        // No direct changes here, let patterns decide
        break;
      default:
        console.warn(
          `EnergyManager: Unknown tension level "${level}". No changes made.`
        );
        break;
    }
  }

  /**
   * Sets a broad arrangement style label (e.g. "wide", "minimal"),
   * logs or manipulates loops if desired.
   *
   * @param {string} style
   */
  setArrangementStyle(style) {
    this.currentArrangementStyle = style;
    console.log(`EnergyManager: Setting arrangement style to "${style}"`);

    // If you want to do something with loops:
    // e.g. if (style === "wide") { ...some changes... }
  }

  /**
   * Getter for hype level
   * @returns {string}
   */
  getHypeLevel() {
    return this.currentHypeLevel;
  }

  /**
   * Getter for tension level
   * @returns {string}
   */
  getTensionLevel() {
    return this.currentTensionLevel;
  }

  /**
   * Getter for arrangement style
   * @returns {string|null}
   */
  getArrangementStyle() {
    return this.currentArrangementStyle;
  }

  /**
   * Getter for current subdivision (e.g. "normal","doubleTime","halfTime"),
   * which patterns can read if they want to interpret faster or slower patterns.
   *
   * @returns {string}
   */
  getSubdivision() {
    return this.currentSubdivision;
  }

  /**
   * Add a liveLoop after the manager is constructed
   * @param {object} loop
   */
  addLiveLoop(loop) {
    this.liveLoops.push(loop);
  }

  /**
   * Remove a previously added liveLoop
   * @param {object} loop
   */
  removeLiveLoop(loop) {
    this.liveLoops = this.liveLoops.filter((l) => l !== loop);
  }
}
