// src/ui/base-pattern-config.js

export class BasePatternConfig extends HTMLElement {
  /**
   * We observe the "open" attribute so we can perform actions when
   * the dialog is shown or hidden (e.g. load pattern state).
   */
  static get observedAttributes() {
    return ["open"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    // common internal state if needed
    this._liveLoop = null;
    this._deviceDefinition = null;

    // for ESC key closing
    this._boundHandleKeyDown = this._handleKeyDown.bind(this);
  }

  connectedCallback() {
    document.addEventListener("keydown", this._boundHandleKeyDown);
    this.render(); // initial render (in case 'open' was set before connect)
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this._boundHandleKeyDown);
  }

  /**
   * Whenever the "open" attribute changes, we show/hide the dialog
   * and, if opening, call loadFromLiveLoop() so child classes can read current pattern fields.
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === "open") {
      const isOpen = this.hasAttribute("open");
      if (isOpen) {
        // show
        this.style.display = "block";
        // load current pattern state
        this.loadFromLiveLoop();
        // then re-render to populate the fields with the newly loaded values
        this.render();
      } else {
        // hide
        this.style.display = "none";
      }
    }
  }

  /**
   * Called by attributeChangedCallback() whenever the dialog is opened.
   * Subclasses should override this to copy the current pattern’s fields
   * into local variables so the form can reflect them.
   */
  loadFromLiveLoop() {
    // Default is no-op. Subclasses override if they need to read from
    // this.liveLoop.pattern
  }

  /**
   * The common render method builds the backdrop, modal container, header, and footer.
   */
  render() {
    const isOpen = this.hasAttribute("open");
    this.shadowRoot.innerHTML = `
      <style>
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
          background: #fff;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
        }
        .modal-header,
        .modal-footer {
          padding: 1rem;
          background: #444;
          color: #fff;
        }
        .modal-header {
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
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          border-top: 1px solid #ccc;
        }
        .modal-footer button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
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
    const closeBtn = this.shadowRoot.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.close());
    }

    const cancelBtn = this.shadowRoot.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.close());
    }

    const enqueueBtn = this.shadowRoot.querySelector('[data-action="enqueue"]');
    if (enqueueBtn) {
      enqueueBtn.addEventListener("click", () => this._applyPattern(false));
    }

    const updateBtn = this.shadowRoot.querySelector('[data-action="update"]');
    if (updateBtn) {
      updateBtn.addEventListener("click", () => this._applyPattern(true));
    }

    // Close if backdrop clicked
    const backdropEl = this.shadowRoot.querySelector(".backdrop");
    if (backdropEl) {
      backdropEl.addEventListener("click", () => this.close());
    }
  }

  /**
   * Subclasses can override to provide a custom dialog title.
   */
  getTitle() {
    return "Pattern Config";
  }

  /**
   * Subclasses must override to provide the inner HTML for the modal body.
   */
  _getFieldsHTML() {
    throw new Error("_getFieldsHTML() must be implemented by subclass.");
  }

  /**
   * Subclasses must override to build a new pattern and apply it to this.liveLoop.
   * If `immediate` = true, do immediate; else queue for next loop boundary.
   */
  _applyPattern(immediate) {
    throw new Error("_applyPattern() must be implemented by subclass.");
  }

  /**
   * Closes the dialog if Escape is pressed and the dialog is open.
   */
  _handleKeyDown(e) {
    if (e.key === "Escape" && this.hasAttribute("open")) {
      this.close();
    }
  }

  /**
   * Remove the "open" attribute to hide, and style display=none.
   */
  close() {
    this.removeAttribute("open");
    this.style.display = "none";
  }

  /**
   * Basic getters/setters for the associated liveLoop and deviceDefinition
   */
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
