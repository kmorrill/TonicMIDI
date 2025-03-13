// File: src/ui/evolving-locked-drum-config.js

import { EvolvingLockedDrumPattern } from "../patterns/evolving-locked-drum-pattern.js";

/**
 * <evolving-locked-drum-config open>
 *
 * Usage example:
 *   <evolving-locked-drum-config
 *       id="myDrumConfig"
 *       loopref="myLoop"
 *   ></evolving-locked-drum-config>
 *
 * Attributes:
 *   - open (boolean): if present, the modal is visible.
 *
 * Properties you can set:
 *   - liveLoop: a LiveLoop instance controlling the EvolvingLockedDrumPattern
 *   - deviceDefinition: an optional DeviceDefinition to pass when building the pattern
 *
 * It shows two controls:
 *   - drumIntensity (0..1 range)
 *   - flavor (select)
 *
 * And three buttons:
 *   - Close: hides the modal
 *   - Update Now: calls loop.setPattern(newPattern, true)
 *   - Enqueue Update: calls loop.setPattern(newPattern, false)
 */

export class EvolvingLockedDrumConfig extends HTMLElement {
  constructor() {
    super();
    this._liveLoop = null;
    this._deviceDefinition = null;

    // Attach a shadow root
    this.attachShadow({ mode: "open" });

    // Basic internal state
    this._drumIntensity = 0.5;
    this._flavor = "ambient";
  }

  // Expose a property to set the connected LiveLoop from outside
  set liveLoop(loop) {
    this._liveLoop = loop;
  }
  get liveLoop() {
    return this._liveLoop;
  }

  // Optionally set the deviceDefinition
  set deviceDefinition(devDef) {
    this._deviceDefinition = devDef;
  }
  get deviceDefinition() {
    return this._deviceDefinition;
  }

  // Reflect "open" attribute => we can show/hide the modal
  static get observedAttributes() {
    return ["open"];
  }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === "open") {
      this.render();
    }
  }

  connectedCallback() {
    // On first insert into DOM
    this.render();
  }

  render() {
    // Wipe out old contents
    const root = this.shadowRoot;
    root.innerHTML = "";

    // Determine if we are "open"
    const isOpen = this.hasAttribute("open");

    //--- STYLES ---
    const style = document.createElement("style");
    style.textContent = `
      :host {
        /* no display by default */
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
        overflow: hidden;
      }

      /* On small screens (mobile), we can take over the full screen */
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
      .field input[type="range"] {
        width: 100%;
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

    //--- BACKDROP + MODAL structure ---
    const backdrop = document.createElement("div");
    backdrop.classList.add("backdrop");
    backdrop.addEventListener("click", (e) => this.close());
    root.appendChild(backdrop);

    const modal = document.createElement("div");
    modal.classList.add("modal");
    root.appendChild(modal);

    // Header
    const header = document.createElement("div");
    header.classList.add("modal-header");
    const title = document.createElement("h2");
    title.textContent = "Evolving Drum Pattern";
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

    // Fields: drumIntensity + flavor
    const intensityField = document.createElement("div");
    intensityField.classList.add("field");
    const intensityLabel = document.createElement("label");
    intensityLabel.textContent = "drumIntensity (0..1):";
    const intensityRange = document.createElement("input");
    intensityRange.type = "range";
    intensityRange.min = "0";
    intensityRange.max = "1";
    intensityRange.step = "0.1";
    intensityRange.value = String(this._drumIntensity);
    intensityRange.addEventListener("input", (e) => {
      this._drumIntensity = parseFloat(e.target.value);
    });
    intensityField.appendChild(intensityLabel);
    intensityField.appendChild(intensityRange);

    body.appendChild(intensityField);

    const flavorField = document.createElement("div");
    flavorField.classList.add("field");
    const flavorLabel = document.createElement("label");
    flavorLabel.textContent = "flavor:";
    const flavorSelect = document.createElement("select");
    // Some example options:
    ["ambient", "tribal", "electronic", "lofi"].forEach((fl) => {
      const opt = document.createElement("option");
      opt.value = fl;
      opt.textContent = fl;
      if (fl === this._flavor) {
        opt.selected = true;
      }
      flavorSelect.appendChild(opt);
    });
    flavorSelect.addEventListener("change", (e) => {
      this._flavor = e.target.value;
    });
    flavorField.appendChild(flavorLabel);
    flavorField.appendChild(flavorSelect);

    body.appendChild(flavorField);

    // Footer
    const footer = document.createElement("div");
    footer.classList.add("modal-footer");

    const enqueueBtn = document.createElement("button");
    enqueueBtn.classList.add("enqueue");
    enqueueBtn.textContent = "Enqueue Update";
    enqueueBtn.addEventListener("click", () => this._applyPattern(false));

    const updateBtn = document.createElement("button");
    updateBtn.classList.add("update");
    updateBtn.textContent = "Update Pattern";
    updateBtn.addEventListener("click", () => this._applyPattern(true));

    footer.appendChild(enqueueBtn);
    footer.appendChild(updateBtn);

    modal.appendChild(footer);
  }

  // Helper to close/hide
  close() {
    this.removeAttribute("open");
    this.style.display = "none";
  }

  // Build the EvolvingLockedDrumPattern and apply to the liveLoop
  _applyPattern(immediate) {
    if (!this._liveLoop) {
      console.warn(
        "<evolving-locked-drum-config>: No liveLoop assigned. Cannot update."
      );
      this.close();
      return;
    }
    // Construct a new EvolvingLockedDrumPattern
    const newPattern = new EvolvingLockedDrumPattern({
      patternLength: 16,
      drumIntensity: this._drumIntensity,
      flavor: this._flavor,
      deviceDefinition: this._deviceDefinition || null,
    });

    this._liveLoop.setPattern(newPattern, immediate);

    // Then close the modal
    this.close();
  }
}

// Register the custom element
customElements.define("evolving-locked-drum-config", EvolvingLockedDrumConfig);
