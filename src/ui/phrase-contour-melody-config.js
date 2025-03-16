// File: src/ui/phrase-contour-melody-config.js

import { BasePatternConfig } from "./base-pattern-config.js";
import { PhraseContourMelody } from "../patterns/phrase-contour-melody.js";

/**
 * <phrase-contour-melody-config open>
 *
 * This component now extends BasePatternConfig, which provides the common modal UI.
 * This component only supplies its unique fields (phraseBars, subSections, stepsPerBar,
 * cadenceBeats, melodicDensity, baseVelocity, tensionEmbellishProb) and the code to build
 * a new PhraseContourMelody pattern.
 */
export class PhraseContourMelodyConfig extends BasePatternConfig {
  constructor() {
    super();
    // Default state for the pattern parameters
    this._phraseBars = 4;
    this._subSections = "intro,build,peak,resolve,cadence";
    this._stepsPerBar = 16;
    this._cadenceBeats = 2;
    this._melodicDensity = 0.7;
    this._baseVelocity = 90;
    this._tensionEmbellishProb = 0.2;
  }

  // Override getTitle() to return the modal header text.
  getTitle() {
    return "Phrase Contour Melody Config";
  }

  // Return the HTML for the unique fields for this pattern.
  _getFieldsHTML() {
    return `
      <div class="field">
        <label>phraseBars:</label>
        <input type="number" id="phrase-bars" value="${this._phraseBars}" min="1" max="16">
      </div>
      <div class="field">
        <label>subSections (comma-separated):</label>
        <input type="text" id="sub-sections" value="${this._subSections}">
      </div>
      <div class="field">
        <label>stepsPerBar:</label>
        <input type="number" id="steps-per-bar" value="${this._stepsPerBar}" min="4" max="64">
      </div>
      <div class="field">
        <label>cadenceBeats:</label>
        <input type="number" id="cadence-beats" value="${this._cadenceBeats}" min="0" max="8">
      </div>
      <div class="field">
        <label>melodicDensity (0..1):</label>
        <input type="range" id="melodic-density" value="${this._melodicDensity}" min="0" max="1" step="0.1">
      </div>
      <div class="field">
        <label>baseVelocity (1..127):</label>
        <input type="number" id="base-velocity" value="${this._baseVelocity}" min="1" max="127">
      </div>
      <div class="field">
        <label>tensionEmbellishProb (0..1):</label>
        <input type="range" id="tension-embellish-prob" value="${this._tensionEmbellishProb}" min="0" max="1" step="0.1">
      </div>
    `;
  }

  // Read field values, build a new PhraseContourMelody, update the liveLoop, and close the modal.
  _applyPattern(immediate) {
    const phraseBarsInput = this.shadowRoot.getElementById("phrase-bars");
    const subSectionsInput = this.shadowRoot.getElementById("sub-sections");
    const stepsPerBarInput = this.shadowRoot.getElementById("steps-per-bar");
    const cadenceBeatsInput = this.shadowRoot.getElementById("cadence-beats");
    const melodicDensityInput =
      this.shadowRoot.getElementById("melodic-density");
    const baseVelocityInput = this.shadowRoot.getElementById("base-velocity");
    const tensionEmbellishProbInput = this.shadowRoot.getElementById(
      "tension-embellish-prob"
    );

    this._phraseBars = parseInt(phraseBarsInput.value, 10) || 4;
    this._subSections = subSectionsInput.value;
    this._stepsPerBar = parseInt(stepsPerBarInput.value, 10) || 16;
    this._cadenceBeats = parseFloat(cadenceBeatsInput.value) || 2;
    this._melodicDensity = parseFloat(melodicDensityInput.value);
    this._baseVelocity = parseInt(baseVelocityInput.value, 10) || 90;
    this._tensionEmbellishProb = parseFloat(tensionEmbellishProbInput.value);

    // Split the subSections string into an array, trimming whitespace.
    const subsArray = this._subSections
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const newPattern = new PhraseContourMelody({
      phraseBars: this._phraseBars,
      subSections: subsArray.length ? subsArray : ["build", "peak", "resolve"],
      stepsPerBar: this._stepsPerBar,
      cadenceBeats: this._cadenceBeats,
      melodicDensity: this._melodicDensity,
      baseVelocity: this._baseVelocity,
      tensionEmbellishProb: this._tensionEmbellishProb,
    });

    if (this.liveLoop) {
      this.liveLoop.setPattern(newPattern, immediate);
    }
    this.close();
  }
}

customElements.define(
  "phrase-contour-melody-config",
  PhraseContourMelodyConfig
);
