// src/ui/base-pattern-config.js
export class BasePatternConfig extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    // common internal state if needed
    this._liveLoop = null;
    this._deviceDefinition = null;
    // other common state...
    this._boundHandleKeyDown = this._handleKeyDown.bind(this);
  }

  // Called when the element is added to the DOM.
  connectedCallback() {
    document.addEventListener("keydown", this._boundHandleKeyDown);
    this.render();
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this._boundHandleKeyDown);
  }

  // The common render method builds the backdrop, modal container, header and footer.
  render() {
    const isOpen = this.hasAttribute("open");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: ${
          isOpen ? "block" : "none"
        }; position: fixed; inset: 0; z-index: 9999; }
        .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
        .modal { position: absolute; top: 50%; left: 50%;
                 transform: translate(-50%, -50%);
                 width: min(400px, 90vw); background: #fff; border-radius: 8px;
                 display: flex; flex-direction: column; }
        .modal-header, .modal-footer { padding: 1rem; background: #444; color: #fff; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; }
        .modal-header h2 { margin: 0; font-size: 1.2rem; }
        .modal-header button { background: transparent; border: none; color: #fff; font-size: 1.2rem; cursor: pointer; }
        .modal-body { padding: 1rem; flex: 1; overflow-y: auto; }
        .modal-footer { justify-content: flex-end; gap: 1rem; border-top: 1px solid #ccc; }
        .modal-footer button { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
      </style>
      <div class="backdrop"></div>
      <div class="modal">
        <div class="modal-header">
          <h2>${this.getTitle()}</h2>
          <button data-action="close">✕</button>
        </div>
        <div class="modal-body">
          ${this._getFieldsHTML()}
        </div>
        <div class="modal-footer">
          <button data-action="cancel">Cancel</button>
          <button data-action="enqueue">Enqueue Pattern</button>
          <button data-action="update">Update Pattern</button>
        </div>
      </div>
    `;
    // Attach event listeners to common buttons:
    this.shadowRoot
      .querySelector('[data-action="close"]')
      .addEventListener("click", () => this.close());
    this.shadowRoot
      .querySelector('[data-action="cancel"]')
      .addEventListener("click", () => this.close());
    this.shadowRoot
      .querySelector('[data-action="enqueue"]')
      .addEventListener("click", () => this._applyPattern(false));
    this.shadowRoot
      .querySelector('[data-action="update"]')
      .addEventListener("click", () => this._applyPattern(true));
    // Close when clicking backdrop
    this.shadowRoot
      .querySelector(".backdrop")
      .addEventListener("click", () => this.close());
  }

  // Default title; subclasses can override if desired.
  getTitle() {
    return "Pattern Config";
  }

  // Subclasses must override to provide the inner HTML for the modal body.
  _getFieldsHTML() {
    throw new Error("_getFieldsHTML() must be implemented by subclass.");
  }

  // Subclasses must override to build a new pattern and apply it.
  _applyPattern(immediate) {
    throw new Error("_applyPattern() must be implemented by subclass.");
  }

  _handleKeyDown(e) {
    if (e.key === "Escape" && this.hasAttribute("open")) {
      this.close();
    }
  }

  close() {
    this.removeAttribute("open");
    this.style.display = "none";
  }

  // Getters and setters for liveLoop and deviceDefinition
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
}

customElements.define("base-pattern-config", BasePatternConfig);
