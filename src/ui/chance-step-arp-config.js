// src/ui/chance-step-arp-config.js
import { BasePatternConfig } from "./base-pattern-config.js";
import { ChanceStepArp } from "../patterns/chance-step-arp.js";

/**
 * <chance-step-arp-config open>
 *
 * A modal dialog component for configuring the ChanceStepArp pattern.
 * Derived from BasePatternConfig, similar to your other pattern config UIs.
 */
export class ChanceStepArpConfig extends BasePatternConfig {
  constructor() {
    super();
    // Default values (used if there's no existing pattern or it's not ChanceStepArp)
    this._patternLength = 16;
    this._advanceProbability = 0.7;
    this._restProbability = 0.1;
    this._baseVelocity = 90;
    this._tensionApproachProb = 0.2;
  }

  /**
   * Called automatically when the dialog is opened (via the "open" attribute).
   * Reads from the existing LiveLoop's pattern if it’s a ChanceStepArp.
   */
  loadFromLiveLoop() {
    if (!this.liveLoop || !this.liveLoop.pattern) {
      console.log("[ChanceStepArpConfig] No liveLoop or pattern found.");
      return;
    }
    const pat = this.liveLoop.pattern;

    // Only copy fields if the loop’s pattern is actually a ChanceStepArp
    if (pat instanceof ChanceStepArp) {
      this._patternLength = pat.patternLength;
      this._advanceProbability = pat.advanceProbability;
      this._restProbability = pat.restProbability;
      this._baseVelocity = pat.baseVelocity;
      this._tensionApproachProb = pat.tensionApproachProb;
      console.log(
        `[ChanceStepArpConfig] Loaded ChanceStepArp settings:
         patternLength=${this._patternLength},
         advanceProbability=${this._advanceProbability},
         restProbability=${this._restProbability},
         baseVelocity=${this._baseVelocity},
         tensionApproachProb=${this._tensionApproachProb}`
      );
    } else {
      console.log(
        "[ChanceStepArpConfig] Current pattern is not a ChanceStepArp."
      );
    }
  }

  /**
   * The modal title shown in the header bar.
   */
  getTitle() {
    return "Chance Step Arp Config";
  }

  /**
   * Returns the form fields in HTML, using our internal state
   * (_patternLength, _advanceProbability, etc.).
   *
   * Use the same 'field' style you have in your other pattern configs.
   */
  _getFieldsHTML() {
    return `
      <div class="field">
        <label>Pattern Length (steps):</label>
        <input
          type="number"
          id="pattern-length"
          value="${this._patternLength}"
          min="4"
          max="64"
        />
      </div>

      <div class="field">
        <label>Advance Probability (0..1):</label>
        <input
          type="range"
          id="advance-prob"
          value="${this._advanceProbability}"
          min="0"
          max="1"
          step="0.05"
        />
        <span id="advance-prob-display">${this._advanceProbability}</span>
      </div>

      <div class="field">
        <label>Rest Probability (0..1):</label>
        <input
          type="range"
          id="rest-prob"
          value="${this._restProbability}"
          min="0"
          max="1"
          step="0.05"
        />
        <span id="rest-prob-display">${this._restProbability}</span>
      </div>

      <div class="field">
        <label>Base Velocity (1..127):</label>
        <input
          type="number"
          id="base-velocity"
          value="${this._baseVelocity}"
          min="1"
          max="127"
        />
      </div>

      <div class="field">
        <label>Tension Approach Probability (0..1):</label>
        <input
          type="range"
          id="tension-approach-prob"
          value="${this._tensionApproachProb}"
          min="0"
          max="1"
          step="0.05"
        />
        <span id="taprob-display">${this._tensionApproachProb}</span>
      </div>
    `;
  }

  /**
   * Reads form fields, builds a new ChanceStepArp, and applies it
   * to the liveLoop (either immediately or queued for next cycle).
   */
  _applyPattern(immediate) {
    const plInput = this.shadowRoot.getElementById("pattern-length");
    const advProbRange = this.shadowRoot.getElementById("advance-prob");
    const restProbRange = this.shadowRoot.getElementById("rest-prob");
    const baseVelInput = this.shadowRoot.getElementById("base-velocity");
    const taProbRange = this.shadowRoot.getElementById("tension-approach-prob");

    // Update internal state from the UI
    this._patternLength = parseInt(plInput.value, 10) || 16;
    this._advanceProbability = parseFloat(advProbRange.value);
    this._restProbability = parseFloat(restProbRange.value);
    this._baseVelocity = parseInt(baseVelInput.value, 10) || 90;
    this._tensionApproachProb = parseFloat(taProbRange.value);

    // Create the new pattern instance
    const newPattern = new ChanceStepArp({
      patternLength: this._patternLength,
      advanceProbability: this._advanceProbability,
      restProbability: this._restProbability,
      baseVelocity: this._baseVelocity,
      tensionApproachProb: this._tensionApproachProb,
    });

    // Apply to the liveLoop
    if (this.liveLoop) {
      this.liveLoop.setPattern(newPattern, immediate);
    }
    this.close();
  }

  /**
   * Override `render()` to dynamically update numeric display when user moves sliders.
   */
  render() {
    // Call the base modal rendering logic first
    super.render();

    // Now bind extra events for the slider => display
    const advProbRange = this.shadowRoot?.getElementById("advance-prob");
    const advProbDisplay = this.shadowRoot?.getElementById(
      "advance-prob-display"
    );
    if (advProbRange && advProbDisplay) {
      advProbRange.addEventListener("input", () => {
        advProbDisplay.textContent = advProbRange.value;
      });
    }

    const restProbRange = this.shadowRoot?.getElementById("rest-prob");
    const restProbDisplay =
      this.shadowRoot?.getElementById("rest-prob-display");
    if (restProbRange && restProbDisplay) {
      restProbRange.addEventListener("input", () => {
        restProbDisplay.textContent = restProbRange.value;
      });
    }

    const taProbRange = this.shadowRoot?.getElementById(
      "tension-approach-prob"
    );
    const taProbDisplay = this.shadowRoot?.getElementById("taprob-display");
    if (taProbRange && taProbDisplay) {
      taProbRange.addEventListener("input", () => {
        taProbDisplay.textContent = taProbRange.value;
      });
    }
  }
}

// Register custom element
customElements.define("chance-step-arp-config", ChanceStepArpConfig);
