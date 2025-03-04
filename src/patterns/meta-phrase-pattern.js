/**
 * meta-phrase-pattern.js
 *
 * Provides a function `createPhrasePattern` that combines any two existing patterns
 * (main vs. fill) into a single "meta pattern." By default, it repeats
 * 4 bars of main + 1 bar of fill, but you can configure any ratio of main vs fill bars.
 *
 * Usage:
 *   import { createPhrasePattern } from './meta-phrase-pattern.js';
 *   import { DrumPattern } from './patterns/drum-pattern.js'; // e.g.
 *
 *   const mainDrum = new DrumPattern(...);
 *   const fillDrum = new DrumPattern(...);
 *
 *   const phrasedDrumPattern = createPhrasePattern(
 *     mainDrum,
 *     fillDrum,
 *     {
 *       barsOfMain: 4,
 *       barsOfFill: 1,
 *       barLengthInSteps: 16,
 *       onPhraseStart: (phraseIndex) => console.log('New phrase started:', phraseIndex),
 *       onPhraseEnd: (phraseIndex) => console.log('Phrase ended:', phraseIndex),
 *     }
 *   );
 *
 *   // Then in your LiveLoop:
 *   const loop = new LiveLoop(midiBus, {
 *     pattern: phrasedDrumPattern,
 *     ...
 *   });
 */

/**
 * @typedef {Object} PhrasePatternOptions
 * @property {number} [barsOfMain=4]
 *   Number of bars (measures) to use the mainPattern.
 * @property {number} [barsOfFill=1]
 *   Number of bars (measures) to use the fillPattern.
 * @property {number} [barLengthInSteps=16]
 *   How many steps in one bar. Typically 16 if you're doing 4/4 with each quarter = 4 steps.
 * @property {function} [onPhraseStart] - Callback when a phrase starts. (phraseIndex) => void
 * @property {function} [onPhraseEnd]   - Callback when a phrase ends.   (phraseIndex) => void
 */

/**
 * Wraps two existing patterns (main and fill) into a single meta-pattern
 * that alternates 4 bars of main and 1 bar of fill, repeating indefinitely.
 *
 * You can pass ANY pattern object for mainPattern or fillPattern, as long as
 * it implements `getNotes(stepIndex, context)` and `getLength()`.
 *
 * @param {object} mainPattern  - An existing pattern implementing {getNotes, getLength}
 * @param {object} fillPattern  - Another pattern, used for the "fill" measure
 * @param {PhrasePatternOptions} [options={}]
 */
export function createPhrasePattern(
  mainPattern,
  fillPattern,
  {
    barsOfMain = 4,
    barsOfFill = 1,
    barLengthInSteps = 16,
    onPhraseStart = null,
    onPhraseEnd = null,
  } = {}
) {
  // Calculate total steps in one full phrase
  const totalBars = barsOfMain + barsOfFill;
  const phraseLengthSteps = totalBars * barLengthInSteps;

  // We'll track the phrase boundaries to fire callbacks
  let lastPhraseIndex = -1; // so when we start, we detect phrase 0 as new
  let lastStepIndex = -1; // used to see if we've advanced to a new step

  // Return a new object that implements the pattern interface
  const metaPattern = {
    /**
     * Called by the LiveLoop every step. We figure out which bar we are in
     * within the phrase, and delegate to main or fill pattern accordingly.
     *
     * @param {number} stepIndex
     * @param {object} context - chordManager, rhythmManager, etc.
     * @returns {Array<{note:string, velocity:number, durationSteps:number}>}
     */
    getNotes(stepIndex, context) {
      // Check if we've advanced to a new step
      if (stepIndex !== lastStepIndex) {
        lastStepIndex = stepIndex;

        // 1) Determine phraseIndex & stepInPhrase
        const phraseIndex = Math.floor(stepIndex / phraseLengthSteps);
        const stepInPhrase = stepIndex % phraseLengthSteps;

        // 2) If we've started a new phrase, fire onPhraseStart
        if (phraseIndex !== lastPhraseIndex) {
          if (typeof onPhraseStart === "function") {
            onPhraseStart(phraseIndex);
          }
          // The previous phrase ended just now
          if (lastPhraseIndex >= 0 && typeof onPhraseEnd === "function") {
            onPhraseEnd(lastPhraseIndex);
          }
          lastPhraseIndex = phraseIndex;
        }

        // 3) Determine if we’re in the "main" region or "fill" region of the phrase
        // e.g. barsOfMain=4 => 4 bars * barLengthInSteps=16 => 64 steps main
        const mainSteps = barsOfMain * barLengthInSteps;
        let delegatedPattern;

        if (stepInPhrase < mainSteps) {
          // In the main region
          delegatedPattern = mainPattern;
        } else {
          // In the fill region
          delegatedPattern = fillPattern;
        }

        // 4) We compute the "local step" for that sub-pattern, so each sub-pattern
        //    can do its own indexing if it wants. A typical approach is:
        const localStep = stepIndex;
        // But you could do "stepInPhrase" if you want the sub-pattern to see 0..15 within the fill bar, etc.
        // We'll just pass the global stepIndex for consistency, or pass stepInPhrase if you prefer.

        // 5) Retrieve sub-pattern’s notes
        metaPattern._cachedNotes =
          delegatedPattern.getNotes(localStep, context) || [];
      }

      // Return the notes we computed at this step
      return metaPattern._cachedNotes;
    },

    /**
     * The pattern length is 1 full phrase in steps. The transport or system might
     * loop on it or you can just treat it as indefinite.
     *
     * If the system is truly indefinite, you can do something like a large number,
     * but typically returning phraseLengthSteps is enough to let a single loop cycle once.
     *
     * @returns {number}
     */
    getLength() {
      return phraseLengthSteps;
    },

    /**
     * Optional method to reset any internal states if needed.
     * For now, we can just reset the sub-pattern states & counters.
     */
    reset() {
      if (typeof mainPattern.reset === "function") {
        mainPattern.reset();
      }
      if (typeof fillPattern.reset === "function") {
        fillPattern.reset();
      }
      lastPhraseIndex = -1;
      lastStepIndex = -1;
      metaPattern._cachedNotes = [];
    },

    /**
     * For debugging or saving config, we can store sub-pattern references and phrase settings.
     * @returns {object}
     */
    toConfig() {
      return {
        patternType: "MetaPhrasePattern",
        phraseLengthSteps,
        barsOfMain,
        barsOfFill,
        barLengthInSteps,
        mainPatternConfig: mainPattern.toConfig ? mainPattern.toConfig() : null,
        fillPatternConfig: fillPattern.toConfig ? fillPattern.toConfig() : null,
      };
    },

    // Store a small cache of notes computed at the current step
    _cachedNotes: [],
  };

  return metaPattern;
}
