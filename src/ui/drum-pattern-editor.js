import { DrumPattern } from "../index.js"; // Adjust path to your library

/**
 * <drum-editor
 *    deviceDefinition="{some DeviceDefinition instance}"
 *    liveLoop="{a LiveLoop instance}">
 *
 * Renders a dynamic drum pattern grid. Four "essential" voices (kick, snare, closed_hat, open_hat)
 * appear at the top. All other voices are hidden in a collapsible <details> labeled "More Drums."
 */
export class DrumPatternEditor extends HTMLElement {
  constructor() {
    super();
    this._deviceDefinition = null;
    this._liveLoop = null;

    this.attachShadow({ mode: "open" });
  }

  set deviceDefinition(dev) {
    this._deviceDefinition = dev;
    this.render();
  }
  get deviceDefinition() {
    return this._deviceDefinition;
  }

  set liveLoop(loop) {
    this._liveLoop = loop;
  }
  get liveLoop() {
    return this._liveLoop;
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const root = this.shadowRoot;
    root.innerHTML = "";

    if (!this._deviceDefinition) {
      const placeholder = document.createElement("p");
      placeholder.textContent = "No deviceDefinition assigned yet.";
      root.appendChild(placeholder);
      return;
    }

    // Basic styling
    const style = document.createElement("style");
    style.textContent = `
      .container {
        border: 1px solid #ccc;
        border-radius: 6px;
        padding: 1rem;
        background: #fff;
        font-family: sans-serif;
      }
      h3 {
        margin-top: 0;
      }
      .step-row {
        display: flex;
        align-items: center;
        margin: 0.75rem 0;
      }
      .voice-label {
        width: 160px;
        font-weight: 600;
        text-transform: capitalize;
      }
      .step-grid {
        display: grid;
        grid-template-columns: repeat(16, 1.6rem);
        gap: 0.4rem;
      }
      .step-grid input[type="checkbox"] {
        width: 1.6rem;
        height: 1.6rem;
        accent-color: #0077cc;
        cursor: pointer;
      }
      .step-grid input[type="checkbox"]:nth-child(4n) {
        box-shadow: 2px 0 0 #bbb;
        margin-right: 0.5rem;
      }
      .scroll-wrap {
        max-height: 400px;
        overflow-y: auto;
        border: 1px solid #ddd;
        padding: 0.5rem;
        margin-top: 0.5rem;
        border-radius: 6px;
      }
    `;
    root.appendChild(style);

    // Container
    const container = document.createElement("div");
    container.classList.add("container");

    // Title
    const header = document.createElement("h3");
    header.textContent = "Drum Editor";
    container.appendChild(header);

    // We'll separate "essential" vs "extra" voices
    const voices = this._deviceDefinition.listDrumVoices(); // e.g. {name, note}
    const essentialSet = new Set(["kick", "snare", "closed_hat", "open_hat"]);

    // Partition
    const essentialVoices = [];
    const extraVoices = [];
    voices.forEach((v) => {
      if (essentialSet.has(v.name)) {
        essentialVoices.push(v);
      } else {
        extraVoices.push(v);
      }
    });

    // 1) Always show essential voices in a <div>
    const essentialWrap = document.createElement("div");
    essentialWrap.classList.add("scroll-wrap");
    container.appendChild(essentialWrap);

    if (!essentialVoices.length) {
      const msg = document.createElement("p");
      msg.textContent =
        "No essential voices found (kick, snare, closed_hat, open_hat).";
      essentialWrap.appendChild(msg);
    } else {
      essentialVoices.forEach((voice) => {
        const row = this.buildVoiceRow(voice);
        essentialWrap.appendChild(row);
      });
    }

    // 2) All other voices go in a <details> block with a <summary>More Drums</summary>
    if (extraVoices.length) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "More Drums";
      details.appendChild(summary);

      // a scrollWrap inside details
      const extraWrap = document.createElement("div");
      extraWrap.classList.add("scroll-wrap");
      details.appendChild(extraWrap);

      extraVoices.forEach((voice) => {
        const row = this.buildVoiceRow(voice);
        extraWrap.appendChild(row);
      });

      container.appendChild(details);
    }

    root.appendChild(container);

    // Listen for changes in both essentialWrap and any <details> extraWrap
    container.addEventListener("change", (evt) => {
      if (evt.target instanceof HTMLInputElement) {
        this.updatePattern();
      }
    });
  }

  buildVoiceRow(voice) {
    // create a row for voice e.g. { name:"kick_alt", note:54 }
    const row = document.createElement("div");
    row.classList.add("step-row");

    const label = document.createElement("div");
    label.classList.add("voice-label");
    // e.g. "kick_alt" => "Kick Alt"
    label.textContent = this.prettyLabel(voice.name);
    row.appendChild(label);

    const stepGrid = document.createElement("div");
    stepGrid.classList.add("step-grid");
    row.appendChild(stepGrid);

    // 16 checkboxes
    for (let i = 0; i < 16; i++) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.voiceName = voice.name;
      cb.dataset.stepIndex = i.toString();
      stepGrid.appendChild(cb);
    }
    return row;
  }

  // e.g. "kick_alt" => "Kick Alt"
  prettyLabel(originalName) {
    return originalName
      .split("_")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ");
  }

  updatePattern() {
    if (!this._liveLoop || !this._deviceDefinition) return;

    const voices = this._deviceDefinition.listDrumVoices();
    const mediumPattern = {};

    // Find all checkboxes in shadow root
    const allCbs = this.shadowRoot.querySelectorAll("input[type='checkbox']");

    // Build an array of 16 hits for each voice
    // e.g. mediumPattern[voiceName] = [0|1, 16 entries]
    voices.forEach((v) => {
      const hits = new Array(16).fill(0);
      // find all cbs for this voice
      allCbs.forEach((cb) => {
        if (cb.dataset.voiceName === v.name) {
          const stepIndex = parseInt(cb.dataset.stepIndex, 10);
          hits[stepIndex] = cb.checked ? 1 : 0;
        }
      });
      mediumPattern[v.name] = hits;
    });

    // We'll pass deviceDefinition so we can map voice name => note at playback
    const newPattern = new DeviceAwareDrumPattern({
      mediumPattern,
      patternLength: 16,
      deviceDefinition: this._deviceDefinition,
    });

    this._liveLoop.setPattern(newPattern, false);
  }
}

/**
 * A helper subclass that ensures each voice uses deviceDefinition.getDrumNote(drumName).
 */
class DeviceAwareDrumPattern extends DrumPattern {
  constructor(options) {
    super(options);
    this.deviceDefinition = options.deviceDefinition || null;
  }

  getNotes(stepIndex, context) {
    const hits = [];
    const { mediumPattern = {} } = this.options;

    for (const [drumName, stepsArr] of Object.entries(mediumPattern)) {
      if (stepsArr[stepIndex % stepsArr.length] === 1) {
        let noteNum = 60;
        if (this.deviceDefinition) {
          const found = this.deviceDefinition.getDrumNote(drumName);
          if (found !== null) noteNum = found;
        }
        hits.push({
          note: noteNum,
          velocity: 100,
          durationSteps: 1,
        });
      }
    }
    return hits;
  }
}

customElements.define("drum-editor", DrumPatternEditor);
