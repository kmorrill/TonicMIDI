// File: src/ui/syncopated-bass-config.js

import { BasePatternConfig } from "./base-pattern-config.js";
import { SyncopatedBass } from "../patterns/syncopated-bass.js";

/**
 * <syncopated-bass-config open>
 *
 * Extends BasePatternConfig for modal UI. We supply unique fields:
 *   (patternLength, genre, octave, density)
 * plus code to build or load a SyncopatedBass pattern.
 */
export class SyncopatedBassConfig extends BasePatternConfig {
  constructor() {
    super();
    // Default state for the pattern parameters
    this._patternLength = 16;
    this._genre = "funk";
    this._octave = 2;
    this._density = 0.5;

    // For convenience, define a list of genre options for the dropdown
    this._genreOptions = [
      "funk",
      "latin",
      "reggae",
      "hiphop",
      "rock",
      "house",
      "afrobeat",
    ];
  }

  /**
   * Called automatically when the dialog is opened (via the "open" attribute).
   * Reads from the existing pattern if it's a SyncopatedBass.
   */
  loadFromLiveLoop() {
    if (!this.liveLoop || !this.liveLoop.pattern) {
      console.log("[SyncopatedBassConfig] No liveLoop or pattern found.");
      return;
    }
    const pat = this.liveLoop.pattern;

    // Only copy fields if the loop’s pattern is actually a SyncopatedBass
    if (pat instanceof SyncopatedBass) {
      this._patternLength = pat.patternLength;
      this._genre = pat.genre;
      this._octave = pat.octave;
      this._density = pat.density;
      console.log(
        `[SyncopatedBassConfig] Loaded existing pattern fields:
         patternLength=${this._patternLength},
         genre=${this._genre},
         octave=${this._octave},
         density=${this._density}`
      );
    } else {
      console.log("[SyncopatedBassConfig] Pattern is not a SyncopatedBass.");
    }
  }

  // Override getTitle() to return the modal header text.
  getTitle() {
    return "Syncopated Bass Config";
  }

  /**
   * Return the HTML for the unique fields for this pattern.
   */
  _getFieldsHTML() {
    // Build the <option> list for genre
    const genreOptionsHtml = this._genreOptions
      .map((g) => {
        const selected = g === this._genre ? "selected" : "";
        return `<option value="${g}" ${selected}>${g}</option>`;
      })
      .join("");

    return `
      <div class="field">
        <label>patternLength:</label>
        <input
          type="number"
          id="pattern-length"
          value="${this._patternLength}"
          min="4"
          max="64"
        />
      </div>
      <div class="field">
        <label>genre:</label>
        <select id="genre-select">
          ${genreOptionsHtml}
        </select>
      </div>
      <div class="field">
        <label>octave:</label>
        <input
          type="number"
          id="octave"
          value="${this._octave}"
          min="0"
          max="6"
        />
      </div>
      <div class="field">
        <label>density (0..1):</label>
        <input
          type="range"
          id="density-range"
          value="${this._density}"
          min="0"
          max="1"
          step="0.1"
        />
        <span id="density-value">${this._density}</span>
      </div>
    `;
  }

  /**
   * Reads the form fields, builds a new SyncopatedBass,
   * and applies it to the liveLoop (queue or immediate).
   */
  _applyPattern(immediate) {
    // Grab elements from shadow DOM
    const lengthInput = this.shadowRoot.getElementById("pattern-length");
    const genreSelect = this.shadowRoot.getElementById("genre-select");
    const octaveInput = this.shadowRoot.getElementById("octave");
    const densityRange = this.shadowRoot.getElementById("density-range");

    // Parse field values
    this._patternLength = parseInt(lengthInput.value, 10) || 16;
    this._genre = genreSelect.value;
    this._octave = parseInt(octaveInput.value, 10) || 2;
    this._density = parseFloat(densityRange.value);

    // Create the new pattern instance
    const newPattern = new SyncopatedBass({
      patternLength: this._patternLength,
      genre: this._genre,
      octave: this._octave,
      density: this._density,
      // randomFn is optional; if we want deterministic, we could pass a seeded RNG here
      // or just let it be the default
    });

    // Apply to the liveLoop
    if (this.liveLoop) {
      this.liveLoop.setPattern(newPattern, immediate);
    }

    // Close the dialog
    this.close();
  }

  /**
   * We override render() so we can also live-update the density label
   * when the user moves the range slider (optional).
   */
  render() {
    super.render();

    // After the default modal structure is in place, bind an event listener
    const densityRange = this.shadowRoot?.getElementById("density-range");
    const densityValue = this.shadowRoot?.getElementById("density-value");
    if (densityRange && densityValue) {
      densityRange.addEventListener("input", () => {
        densityValue.textContent = densityRange.value;
      });
    }
  }
}

customElements.define("syncopated-bass-config", SyncopatedBassConfig);
