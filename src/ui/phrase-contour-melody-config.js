// File: src/ui/phrase-contour-melody-config.js

import { PhraseContourMelody } from "../patterns/phrase-contour-melody.js";

/**
 * <phrase-contour-melody-config open>
 *
 * Attributes:
 *   - open (boolean): if present, the modal is visible.
 *
 * Properties you can set:
 *   - liveLoop: a LiveLoop instance controlling the PhraseContourMelody pattern
 *   - deviceDefinition: (optional) a DeviceDefinition, though not strictly needed for this pattern.
 *
 * It shows fields for:
 *   - phraseBars (number)
 *   - subSections (text, comma-separated)
 *   - stepsPerBar (number)
 *   - cadenceBeats (number)
 *   - melodicDensity (range 0..1)
 *   - baseVelocity (1..127)
 *   - tensionEmbellishProb (range 0..1)
 *
 * And three buttons:
 *   - Cancel: dismisses the modal without committing changes
 *   - "Update Pattern" => immediate setPattern (true)
 *   - "Enqueue Pattern" => queued setPattern (false)
 *
 * Also, pressing ESC will dismiss the modal without applying any changes.
 */
export class PhraseContourMelodyConfig extends HTMLElement {
  constructor() {
    super();
    this._liveLoop = null;
    this._deviceDefinition = null;

    // Default state for pattern parameters
    this._phraseBars = 4;
    this._subSections = "intro,build,peak,resolve,cadence";
    this._stepsPerBar = 16;
    this._cadenceBeats = 2;
    this._melodicDensity = 0.7;
    this._baseVelocity = 90;
    this._tensionEmbellishProb = 0.2;

    // Bind keydown handler for ESC key
    this._boundHandleKeyDown = this._handleKeyDown.bind(this);

    // Attach shadow root
    this.attachShadow({ mode: "open" });
  }

  set liveLoop(loop) {
    this._liveLoop = loop;
  }
  get liveLoop() {
    return this._liveLoop;
  }

  set deviceDefinition(devDef) {
    this._deviceDefinition = devDef;
  }
  get deviceDefinition() {
    return this._deviceDefinition;
  }

  static get observedAttributes() {
    return ["open"];
  }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === "open") {
      this.render();
    }
  }

  connectedCallback() {
    document.addEventListener("keydown", this._boundHandleKeyDown);
    this.render();
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this._boundHandleKeyDown);
  }

  _handleKeyDown(e) {
    if (e.key === "Escape" && this.hasAttribute("open")) {
      this.close();
    }
  }

  render() {
    const root = this.shadowRoot;
    root.innerHTML = "";

    const isOpen = this.hasAttribute("open");

    //--- STYLES ---
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: ${isOpen ? "block" : "none"};
        position: fixed;
        inset: 0;
        z-index: 9999;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.5);
      }
      .modal {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(400px, 90vw);
        max-height: 90vh;
        background: #fff;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
      }
      @media (max-width: 600px) {
        .modal {
          width: 100vw;
          height: 100vh;
          border-radius: 0;
          top: 0;
          left: 0;
          transform: none;
        }
      }
      .modal-header {
        padding: 1rem;
        background: #444;
        color: #fff;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .modal-header h2 {
        margin: 0;
        font-size: 1.2rem;
      }
      .modal-header button {
        background: transparent;
        border: none;
        color: #fff;
        font-size: 1.2rem;
        cursor: pointer;
      }
      .modal-body {
        padding: 1rem;
        flex: 1;
        overflow-y: auto;
      }
      .field {
        display: flex;
        flex-direction: column;
        margin-bottom: 1rem;
      }
      .field label {
        font-weight: 600;
        margin-bottom: 0.2rem;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        padding: 1rem;
        border-top: 1px solid #ccc;
      }
      .modal-footer button {
        padding: 0.5rem 1rem;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        border-radius: 4px;
      }
      .modal-footer button.update {
        background: #0070cc;
        color: #fff;
      }
      .modal-footer button.enqueue {
        background: #11aa44;
        color: #fff;
      }
      .modal-footer button.cancel {
        background: #aaa;
        color: #fff;
      }
    `;
    root.appendChild(style);

    //--- BACKDROP + MODAL ---
    const backdrop = document.createElement("div");
    backdrop.classList.add("backdrop");
    backdrop.addEventListener("click", () => this.close());
    root.appendChild(backdrop);

    const modal = document.createElement("div");
    modal.classList.add("modal");
    root.appendChild(modal);

    // Header
    const header = document.createElement("div");
    header.classList.add("modal-header");
    const title = document.createElement("h2");
    title.textContent = "Phrase Contour Melody Config";
    header.appendChild(title);
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.addEventListener("click", () => this.close());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.classList.add("modal-body");
    modal.appendChild(body);

    // Fields

    // phraseBars
    const pbField = document.createElement("div");
    pbField.classList.add("field");
    const pbLabel = document.createElement("label");
    pbLabel.textContent = "phraseBars:";
    const pbInput = document.createElement("input");
    pbInput.type = "number";
    pbInput.min = "1";
    pbInput.max = "16";
    pbInput.value = String(this._phraseBars);
    pbInput.addEventListener("input", (e) => {
      this._phraseBars = parseInt(e.target.value, 10) || 4;
    });
    pbField.appendChild(pbLabel);
    pbField.appendChild(pbInput);
    body.appendChild(pbField);

    // subSections
    const subsField = document.createElement("div");
    subsField.classList.add("field");
    const subsLabel = document.createElement("label");
    subsLabel.textContent = "subSections (comma-sep):";
    const subsInput = document.createElement("input");
    subsInput.type = "text";
    subsInput.value = this._subSections;
    subsInput.addEventListener("input", (e) => {
      this._subSections = e.target.value;
    });
    subsField.appendChild(subsLabel);
    subsField.appendChild(subsInput);
    body.appendChild(subsField);

    // stepsPerBar
    const spbField = document.createElement("div");
    spbField.classList.add("field");
    const spbLabel = document.createElement("label");
    spbLabel.textContent = "stepsPerBar:";
    const spbInput = document.createElement("input");
    spbInput.type = "number";
    spbInput.min = "4";
    spbInput.max = "64";
    spbInput.value = String(this._stepsPerBar);
    spbInput.addEventListener("input", (e) => {
      this._stepsPerBar = parseInt(e.target.value, 10) || 16;
    });
    spbField.appendChild(spbLabel);
    spbField.appendChild(spbInput);
    body.appendChild(spbField);

    // cadenceBeats
    const cadenceField = document.createElement("div");
    cadenceField.classList.add("field");
    const cadenceLabel = document.createElement("label");
    cadenceLabel.textContent = "cadenceBeats:";
    const cadenceInput = document.createElement("input");
    cadenceInput.type = "number";
    cadenceInput.min = "0";
    cadenceInput.max = "8";
    cadenceInput.value = String(this._cadenceBeats);
    cadenceInput.addEventListener("input", (e) => {
      this._cadenceBeats = parseFloat(e.target.value) || 0;
    });
    cadenceField.appendChild(cadenceLabel);
    cadenceField.appendChild(cadenceInput);
    body.appendChild(cadenceField);

    // melodicDensity
    const densityField = document.createElement("div");
    densityField.classList.add("field");
    const densityLabel = document.createElement("label");
    densityLabel.textContent = "melodicDensity (0..1):";
    const densityRange = document.createElement("input");
    densityRange.type = "range";
    densityRange.min = "0";
    densityRange.max = "1";
    densityRange.step = "0.1";
    densityRange.value = String(this._melodicDensity);
    densityRange.addEventListener("input", (e) => {
      this._melodicDensity = parseFloat(e.target.value);
    });
    densityField.appendChild(densityLabel);
    densityField.appendChild(densityRange);
    body.appendChild(densityField);

    // baseVelocity
    const velField = document.createElement("div");
    velField.classList.add("field");
    const velLabel = document.createElement("label");
    velLabel.textContent = "baseVelocity (1..127):";
    const velInput = document.createElement("input");
    velInput.type = "number";
    velInput.min = "1";
    velInput.max = "127";
    velInput.value = String(this._baseVelocity);
    velInput.addEventListener("input", (e) => {
      this._baseVelocity = parseInt(e.target.value, 10) || 90;
    });
    velField.appendChild(velLabel);
    velField.appendChild(velInput);
    body.appendChild(velField);

    // tensionEmbellishProb
    const teField = document.createElement("div");
    teField.classList.add("field");
    const teLabel = document.createElement("label");
    teLabel.textContent = "tensionEmbellishProb (0..1):";
    const teRange = document.createElement("input");
    teRange.type = "range";
    teRange.min = "0";
    teRange.max = "1";
    teRange.step = "0.1";
    teRange.value = String(this._tensionEmbellishProb);
    teRange.addEventListener("input", (e) => {
      this._tensionEmbellishProb = parseFloat(e.target.value);
    });
    teField.appendChild(teLabel);
    teField.appendChild(teRange);
    body.appendChild(teField);

    // Footer
    const footer = document.createElement("div");
    footer.classList.add("modal-footer");

    // Cancel button (dismisses without committing changes)
    const cancelBtn = document.createElement("button");
    cancelBtn.classList.add("cancel");
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.close());
    footer.appendChild(cancelBtn);

    const enqueueBtn = document.createElement("button");
    enqueueBtn.classList.add("enqueue");
    enqueueBtn.textContent = "Enqueue Pattern";
    enqueueBtn.addEventListener("click", () => this._applyPattern(false));
    footer.appendChild(enqueueBtn);

    const updateBtn = document.createElement("button");
    updateBtn.classList.add("update");
    updateBtn.textContent = "Update Pattern";
    updateBtn.addEventListener("click", () => this._applyPattern(true));
    footer.appendChild(updateBtn);

    modal.appendChild(footer);
  }

  close() {
    this.removeAttribute("open");
    this.style.display = "none";
  }

  _applyPattern(immediate) {
    if (!this._liveLoop) {
      console.warn("<phrase-contour-melody-config> No liveLoop assigned.");
      this.close();
      return;
    }
    // Build a new PhraseContourMelody with current local state
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

    this._liveLoop.setPattern(newPattern, immediate);
    this.close();
  }
}

customElements.define(
  "phrase-contour-melody-config",
  PhraseContourMelodyConfig
);
