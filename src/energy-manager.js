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
 *   const chordManager = new ChordManager();
 *   const rhythmManager = new RhythmManager();
 *   const manager = new EnergyManager({ 
 *     liveLoops: [drumLoop, bassLoop, melodyLoop],
 *     chordManager,
 *     rhythmManager
 *   });
 *   manager.setHypeLevel("full");   // manipulates loops to "full" arrangement
 *   manager.setTensionLevel("high"); // more dissonant chords, removing fundamental, etc.
 */

export class EnergyManager {
  /**
   * @param {object} options
   * @param {Array}  [options.liveLoops=[]] - The LiveLoops under management.
   * @param {object} [options.chordManager=null] - ChordManager for harmonic manipulation
   * @param {object} [options.rhythmManager=null] - RhythmManager for rhythmic manipulation
   * @param {object} [options.globalContext=null] - Optional GlobalContext that holds both managers
   */
  constructor({ 
    liveLoops = [], 
    chordManager = null, 
    rhythmManager = null,
    globalContext = null
  } = {}) {
    // The loops we will orchestrate
    this.liveLoops = liveLoops;

    // Track current hype/tension states if needed
    this.currentHypeLevel = null;
    this.currentTensionLevel = null;

    // Store references to managers
    this.chordManager = chordManager;
    this.rhythmManager = rhythmManager;
    this.globalContext = globalContext;

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
   *   - Setting rhythm subdivisions through RhythmManager
   *
   * @param {string} level - e.g. "low", "medium", "full", or other
   */
  setHypeLevel(level) {
    this.currentHypeLevel = level;
    console.log(`EnergyManager: Setting hype level to "${level}"`);

    // Update global context if available
    if (this.globalContext) {
      this.globalContext.setHypeLevel(level);
    }
    
    // Or update rhythm manager directly if available
    if (this.rhythmManager && !this.globalContext) {
      switch(level) {
        case "full":
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

    // Example logic for LiveLoops:
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
   *   - Using more dissonant chord patterns through ChordManager
   *   - Omitting certain chord tones for implied tension
   *   - Filtration or removing fundamental frequencies to create "missing" tension
   *
   * @param {string} level - e.g. "none", "low", "mid", "high"
   */
  setTensionLevel(level) {
    this.currentTensionLevel = level;
    console.log(`EnergyManager: Setting tension level to "${level}"`);
    
    // Update global context if available
    if (this.globalContext) {
      this.globalContext.setTensionLevel(level);
    }
    
    // Or update chord manager directly if available
    if (this.chordManager && !this.globalContext) {
      this.chordManager.setTensionLevel(level);
    }

    // Additional handling for LiveLoops that need direct modification
    switch (level) {
      case "high": {
        // Possibly push chord loops to dissonant or dominant-based patterns
        // Or remove the root from the bass line for implied tension
        this.liveLoops.forEach((loop) => {
          if (loop.name === "Chord") {
            // For loops using ChordPattern, adjust voicing type
            if (loop.pattern && typeof loop.pattern.setVoicingType === 'function') {
              loop.pattern.setVoicingType("open");
            }
          }
          if (loop.name === "Bass") {
            // Maybe raise the transpose by 7 semitones for tension
            loop.setTranspose(7);
          }
        });
        break;
      }

      case "mid": {
        // Some moderate tension approach
        this.liveLoops.forEach((loop) => {
          if (loop.pattern && typeof loop.pattern.setVoicingType === 'function') {
            loop.pattern.setVoicingType("close");
          }
          if (loop.name === "Bass") {
            loop.setTranspose(0); // Reset transpose
          }
        });
        break;
      }

      case "low": {
        // Add slight tension
        this.liveLoops.forEach((loop) => {
          if (loop.pattern && typeof loop.pattern.setVoicingType === 'function') {
            loop.pattern.setVoicingType("close");
          }
        });
        break;
      }

      case "none": {
        // Very stable chord approach or minimal tension
        this.liveLoops.forEach((loop) => {
          if (loop.pattern && typeof loop.pattern.setVoicingType === 'function') {
            loop.pattern.setVoicingType("close");
          }
          if (loop.name === "Bass") {
            loop.setTranspose(0); // Reset transpose
          }
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
          if (loop.pattern && typeof loop.pattern.setVoicingType === 'function') {
            loop.pattern.setVoicingType("spread");
          }
        });
        break;
      case "minimal":
        this.liveLoops.forEach((loop) => {
          if (loop.pattern && typeof loop.pattern.setVoicingType === 'function') {
            loop.pattern.setVoicingType("close");
          }
        });
        break;
      default:
        console.warn(`Unknown arrangement style: ${style}`);
        break;
    }
  }

  /**
   * Update the ChordManager to use a new chord progression
   * 
   * @param {Array} progression - Array of chord objects 
   */
  setChordProgression(progression) {
    if (this.globalContext && this.globalContext.chordManager) {
      this.globalContext.chordManager.setProgression(progression);
    } else if (this.chordManager) {
      this.chordManager.setProgression(progression);
    } else {
      console.warn("EnergyManager: No ChordManager available to set progression");
    }
  }
}
