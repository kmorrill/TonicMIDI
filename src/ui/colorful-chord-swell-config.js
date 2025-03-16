import { BasePatternConfig } from "./base-pattern-config.js";
import { ColorfulChordSwellPattern } from "../patterns/colorful-chord-swell-pattern.js";

export class ColorfulChordSwellConfig extends BasePatternConfig {
  constructor() {
    super();
    // Set up any state unique to this config
    this._color = "warm";
    this._swellDuration = 16;
    this._overlap = 2;
    this._chordComplexity = 0.5;
  }

  getTitle() {
    return "Colorful Chord Swell Config";
  }

  _getFieldsHTML() {
    // Return the HTML for the form fields (inputs, selects, etc.)
    return `
      <div class="field">
        <label>Color:</label>
        <select id="color-select">
          <option value="warm" ${
            this._color === "warm" ? "selected" : ""
          }>warm</option>
          <option value="bright" ${
            this._color === "bright" ? "selected" : ""
          }>bright</option>
          <option value="dark" ${
            this._color === "dark" ? "selected" : ""
          }>dark</option>
          <option value="mysterious" ${
            this._color === "mysterious" ? "selected" : ""
          }>mysterious</option>
        </select>
      </div>
      <div class="field">
        <label>swellDuration (steps):</label>
        <input type="number" id="swell-duration" value="${
          this._swellDuration
        }" min="1" max="64">
      </div>
      <div class="field">
        <label>overlap (steps):</label>
        <input type="number" id="overlap" value="${
          this._overlap
        }" min="-8" max="8">
      </div>
      <div class="field">
        <label>chordComplexity (0..1):</label>
        <input type="range" id="chord-complexity" value="${
          this._chordComplexity
        }" min="0" max="1" step="0.1">
      </div>
    `;
  }

  // Override _applyPattern to create a new ColorfulChordSwellPattern instance with the chosen values.
  _applyPattern(immediate) {
    const colorSelect = this.shadowRoot.getElementById("color-select");
    const swellInput = this.shadowRoot.getElementById("swell-duration");
    const overlapInput = this.shadowRoot.getElementById("overlap");
    const complexityInput = this.shadowRoot.getElementById("chord-complexity");

    // Update internal state from the inputs.
    this._color = colorSelect.value;
    this._swellDuration = parseInt(swellInput.value, 10) || 16;
    this._overlap = parseInt(overlapInput.value, 10) || 2;
    this._chordComplexity = parseFloat(complexityInput.value) || 0.5;

    // Create the new pattern instance.
    const newPattern = new ColorfulChordSwellPattern({
      color: this._color,
      swellDuration: this._swellDuration,
      overlap: this._overlap,
      chordComplexity: this._chordComplexity,
    });

    // Apply to the liveLoop.
    if (this.liveLoop) {
      this.liveLoop.setPattern(newPattern, immediate);
    }
    this.close();
  }
}

customElements.define("colorful-chord-swell-config", ColorfulChordSwellConfig);
