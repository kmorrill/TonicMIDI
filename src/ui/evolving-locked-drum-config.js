// File: src/ui/evolving-locked-drum-config.js

import { BasePatternConfig } from "./base-pattern-config.js";
import { EvolvingLockedDrumPattern } from "../patterns/evolving-locked-drum-pattern.js";

/**
 * <evolving-locked-drum-config open>
 *
 * This component extends a common BasePatternConfig class that provides the modal UI
 * (backdrop, header, footer, ESC key handling, etc.). We only supply the unique fields
 * (drumIntensity and flavor) plus code to build/load an EvolvingLockedDrumPattern.
 */
export class EvolvingLockedDrumConfig extends BasePatternConfig {
  constructor() {
    super();
    // Default values for the evolving drum pattern configuration
    this._drumIntensity = 0.5;
    this._flavor = "ambient";
  }

  /**
   * Called automatically when the dialog is opened (via the "open" attribute).
   * Here we read from the existing pattern if it’s an EvolvingLockedDrumPattern.
   */
  loadFromLiveLoop() {
    if (!this.liveLoop || !this.liveLoop.pattern) {
      console.log("loadFromLiveLoop: No liveLoop or pattern found.");
      return;
    }
    const pat = this.liveLoop.pattern;

    // Only copy fields if the loop’s pattern is actually an EvolvingLockedDrumPattern
    if (pat instanceof EvolvingLockedDrumPattern) {
      // read existing drumIntensity, flavor, etc.
      this._drumIntensity = pat.drumIntensity;
      this._flavor = pat.flavor;
      console.log(
        `loadFromLiveLoop: Loaded EvolvingLockedDrumPattern settings: drumIntensity=${this._drumIntensity}, flavor=${this._flavor}`
      );
    } else {
      console.log(
        "loadFromLiveLoop: Pattern is not an EvolvingLockedDrumPattern."
      );
    }
  }

  // Override the modal title.
  getTitle() {
    return "Evolving Drum Pattern";
  }

  /**
   * Return the inner HTML for our custom fields:
   *   - drumIntensity (range)
   *   - flavor (select)
   */
  _getFieldsHTML() {
    return `
      <div class="field">
        <label>drumIntensity (0..1):</label>
        <input
          type="range"
          id="drum-intensity"
          value="${this._drumIntensity}"
          min="0"
          max="1"
          step="0.1"
        />
      </div>
      <div class="field">
        <label>flavor:</label>
        <select id="flavor-select">
          <option value="ambient"    ${
            this._flavor === "ambient" ? "selected" : ""
          }>ambient</option>
          <option value="tribal"     ${
            this._flavor === "tribal" ? "selected" : ""
          }>tribal</option>
          <option value="electronic" ${
            this._flavor === "electronic" ? "selected" : ""
          }>electronic</option>
          <option value="lofi"       ${
            this._flavor === "lofi" ? "selected" : ""
          }>lofi</option>
        </select>
      </div>
    `;
  }

  /**
   * Reads the form fields, builds a new EvolvingLockedDrumPattern,
   * and applies it to the liveLoop (queue or immediate).
   */
  _applyPattern(immediate) {
    const intensityInput = this.shadowRoot.getElementById("drum-intensity");
    const flavorSelect = this.shadowRoot.getElementById("flavor-select");

    this._drumIntensity = parseFloat(intensityInput.value);
    this._flavor = flavorSelect.value;

    // Create the new pattern instance
    const newPattern = new EvolvingLockedDrumPattern({
      patternLength: 16,
      drumIntensity: this._drumIntensity,
      flavor: this._flavor,
      deviceDefinition: this.deviceDefinition || null,
    });

    // Apply to the liveLoop
    if (this.liveLoop) {
      this.liveLoop.setPattern(newPattern, immediate);
    }
    this.close();
  }
}

customElements.define("evolving-locked-drum-config", EvolvingLockedDrumConfig);
