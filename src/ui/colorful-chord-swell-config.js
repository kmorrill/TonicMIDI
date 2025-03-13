// File: src/ui/colorful-chord-swell-config.js

import { ColorfulChordSwellPattern } from "../patterns/colorful-chord-swell-pattern.js";

/**
 * <colorful-chord-swell-config open>
 *
 * Attributes:
 *   - open (boolean): if present, the modal is visible.
 *
 * Properties you can set:
 *   - liveLoop: a LiveLoop instance controlling the ColorfulChordSwellPattern
 *   - deviceDefinition: (optional) a DeviceDefinition for consistency if you want,
 *       though ColorfulChordSwellPattern doesn't strictly need it.
 *
 * It shows fields to edit:
 *   - color (select)
 *   - swellDuration (number)
 *   - overlap (number, steps, can be negative)
 *   - chordComplexity (range 0..1)
 *
 * And two buttons:
 *   - "Update Pattern" => immediate setPattern (true)
 *   - "Enqueue Pattern" => queued setPattern (false)
 */
export class ColorfulChordSwellConfig extends HTMLElement {
  constructor() {
    super();
    this._liveLoop = null;
    this._deviceDefinition = null;

    // Default local state for the pattern parameters
    this._color = "warm";
    this._swellDuration = 16;
    this._overlap = 2;
    this._chordComplexity = 0.5;

    // Attach a shadow root
    this.attachShadow({ mode: "open" });
  }

  // Expose a property to set the connected LiveLoop from outside
  set liveLoop(loop) {
    this._liveLoop = loop;
  }
  get liveLoop() {
    return this._liveLoop;
  }

  // Optionally store a deviceDefinition if you want to keep consistency,
  // though ColorfulChordSwellPattern doesn't strictly need it.
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
    this.render();
  }

  render() {
    // Wipe out old contents
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
    title.textContent = "Colorful Chord Swell Config";
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
    // 1) color
    const colorField = document.createElement("div");
    colorField.classList.add("field");
    const colorLabel = document.createElement("label");
    colorLabel.textContent = "color:";
    const colorSelect = document.createElement("select");
    ["warm", "bright", "dark", "mysterious"].forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (c === this._color) {
        opt.selected = true;
      }
      colorSelect.appendChild(opt);
    });
    colorSelect.addEventListener("change", (e) => {
      this._color = e.target.value;
    });
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorSelect);
    body.appendChild(colorField);

    // 2) swellDuration
    const swellField = document.createElement("div");
    swellField.classList.add("field");
    const swellLabel = document.createElement("label");
    swellLabel.textContent = "swellDuration (steps):";
    const swellInput = document.createElement("input");
    swellInput.type = "number";
    swellInput.min = "1";
    swellInput.max = "64";
    swellInput.value = String(this._swellDuration);
    swellInput.addEventListener("input", (e) => {
      this._swellDuration = parseInt(e.target.value, 10) || 16;
    });
    swellField.appendChild(swellLabel);
    swellField.appendChild(swellInput);
    body.appendChild(swellField);

    // 3) overlap
    const overlapField = document.createElement("div");
    overlapField.classList.add("field");
    const overlapLabel = document.createElement("label");
    overlapLabel.textContent = "overlap (steps):";
    const overlapInput = document.createElement("input");
    overlapInput.type = "number";
    overlapInput.min = "-8";
    overlapInput.max = "8";
    overlapInput.value = String(this._overlap);
    overlapInput.addEventListener("input", (e) => {
      this._overlap = parseInt(e.target.value, 10) || 0;
    });
    overlapField.appendChild(overlapLabel);
    overlapField.appendChild(overlapInput);
    body.appendChild(overlapField);

    // 4) chordComplexity
    const compField = document.createElement("div");
    compField.classList.add("field");
    const compLabel = document.createElement("label");
    compLabel.textContent = "chordComplexity (0..1):";
    const compRange = document.createElement("input");
    compRange.type = "range";
    compRange.min = "0";
    compRange.max = "1";
    compRange.step = "0.1";
    compRange.value = String(this._chordComplexity);
    compRange.addEventListener("input", (e) => {
      this._chordComplexity = parseFloat(e.target.value);
    });
    compField.appendChild(compLabel);
    compField.appendChild(compRange);
    body.appendChild(compField);

    // Footer
    const footer = document.createElement("div");
    footer.classList.add("modal-footer");

    const enqueueBtn = document.createElement("button");
    enqueueBtn.classList.add("enqueue");
    enqueueBtn.textContent = "Enqueue Pattern";
    enqueueBtn.addEventListener("click", () => this._applyPattern(false));

    const updateBtn = document.createElement("button");
    updateBtn.classList.add("update");
    updateBtn.textContent = "Update Pattern";
    updateBtn.addEventListener("click", () => this._applyPattern(true));

    footer.appendChild(enqueueBtn);
    footer.appendChild(updateBtn);
    modal.appendChild(footer);
  }

  close() {
    this.removeAttribute("open");
    this.style.display = "none";
  }

  _applyPattern(immediate) {
    if (!this._liveLoop) {
      console.warn("<colorful-chord-swell-config> No liveLoop assigned.");
      this.close();
      return;
    }
    // Build a new ColorfulChordSwellPattern with current local state
    const newPattern = new ColorfulChordSwellPattern({
      color: this._color,
      swellDuration: this._swellDuration,
      overlap: this._overlap,
      chordComplexity: this._chordComplexity,
    });

    this._liveLoop.setPattern(newPattern, immediate);
    this.close();
  }
}

customElements.define("colorful-chord-swell-config", ColorfulChordSwellConfig);
