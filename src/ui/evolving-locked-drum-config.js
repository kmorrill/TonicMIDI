// File: src/ui/evolving-locked-drum-config.js

import { BasePatternConfig } from "./base-pattern-config.js";
import { EvolvingLockedDrumPattern } from "../patterns/evolving-locked-drum-pattern.js";

/**
 * <evolving-locked-drum-config open>
 *
 * This component now extends a common BasePatternConfig class that
 * implements the modal UI (backdrop, header, footer, ESC key handling, etc.).
 * This component only needs to supply its unique fields (drumIntensity and flavor)
 * and the pattern creation logic.
 */
export class EvolvingLockedDrumConfig extends BasePatternConfig {
  constructor() {
    super();
    // Set default values for the evolving drum pattern configuration.
    this._drumIntensity = 0.5;
    this._flavor = "ambient";
  }

  // Override the modal title.
  getTitle() {
    return "Evolving Drum Pattern";
  }

  // Return the inner HTML for the unique fields for this pattern.
  _getFieldsHTML() {
    return `
      <div class="field">
        <label>drumIntensity (0..1):</label>
        <input type="range" id="drum-intensity" value="${
          this._drumIntensity
        }" min="0" max="1" step="0.1">
      </div>
      <div class="field">
        <label>flavor:</label>
        <select id="flavor-select">
          <option value="ambient" ${
            this._flavor === "ambient" ? "selected" : ""
          }>ambient</option>
          <option value="tribal" ${
            this._flavor === "tribal" ? "selected" : ""
          }>tribal</option>
          <option value="electronic" ${
            this._flavor === "electronic" ? "selected" : ""
          }>electronic</option>
          <option value="lofi" ${
            this._flavor === "lofi" ? "selected" : ""
          }>lofi</option>
        </select>
      </div>
    `;
  }

  // Build a new EvolvingLockedDrumPattern using the current field values
  // and apply it to the connected liveLoop.
  _applyPattern(immediate) {
    const intensityInput = this.shadowRoot.getElementById("drum-intensity");
    const flavorSelect = this.shadowRoot.getElementById("flavor-select");

    this._drumIntensity = parseFloat(intensityInput.value);
    this._flavor = flavorSelect.value;

    const newPattern = new EvolvingLockedDrumPattern({
      patternLength: 16,
      drumIntensity: this._drumIntensity,
      flavor: this._flavor,
      deviceDefinition: this.deviceDefinition || null,
    });

    if (this.liveLoop) {
      this.liveLoop.setPattern(newPattern, immediate);
    }
    this.close();
  }
}

customElements.define("evolving-locked-drum-config", EvolvingLockedDrumConfig);
