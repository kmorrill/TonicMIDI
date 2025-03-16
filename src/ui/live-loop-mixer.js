// File: live-loop-mixer.js

import {
  LiveLoop,
  ColorfulChordSwellPattern,
  EvolvingLockedDrumPattern,
  PhraseContourMelody,
} from "../index.js";

// Helper to convert a MIDI note (float or int) to e.g. "C#4"
function midiToNoteName(midiVal) {
  if (midiVal == null) return "(none)";
  const rounded = Math.round(midiVal);
  if (rounded < 0 || rounded > 127) return "(out of range)";
  const notes = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const name = notes[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export class LiveLoopMixer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // We expect .system = { transport, deviceManager, midiBus, ... }
    this._system = null;

    // "Add New" form local state
    this.newLoopName = "NewLoop";
    this.newPatternType = "ColorfulChordSwellPattern";
    this.newDeviceId = "";
    this.newChannel = 1;

    // The pattern types we offer in "Add New" row
    this.patternChoices = [
      { label: "Chord", value: "ColorfulChordSwellPattern" },
      { label: "Drums", value: "EvolvingLockedDrumPattern" },
      { label: "Melody", value: "PhraseContourMelody" },
    ];

    // Current active sort column: "name", "avgPitch", or "channel"
    this._sortColumn = null;
  }

  /**
   * The system must contain at least:
   *   { transport, deviceManager, midiBus }.
   */
  set system(sys) {
    this._system = sys;
    this.render();
  }
  get system() {
    return this._system;
  }

  /**
   * Renders the mixer UI as a table + an "Add new" form.
   */
  render() {
    if (!this.shadowRoot) return;
    const { transport, deviceManager } = this._system || {};
    if (!transport || !deviceManager) {
      this.shadowRoot.innerHTML = `
        <p style="color:red;">
          LiveLoopMixer: No system/transport/deviceManager set.
        </p>`;
      return;
    }

    // 1) Copy the liveLoops array so we can sort without mutating original
    const loops = [...transport.liveLoops];

    // 2) Apply sorting if _sortColumn is set
    if (this._sortColumn === "name") {
      loops.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (this._sortColumn === "channel") {
      loops.sort((a, b) => a.midiChannel - b.midiChannel);
    } else if (this._sortColumn === "avgPitch") {
      // Descending by average pitch
      loops.sort((a, b) => {
        const aPitch =
          (a.getApproximatePitch && a.getApproximatePitch()) ?? null;
        const bPitch =
          (b.getApproximatePitch && b.getApproximatePitch()) ?? null;
        const aVal = aPitch == null ? -999 : aPitch;
        const bVal = bPitch == null ? -999 : bPitch;
        return bVal - aVal; // descending
      });
    }

    // Some minimal styling
    const style = `
      <style>
        :host {
          display: block;
          font-family: sans-serif;
          background: #fff;
          border: 1px solid #ccc;
          padding: 0.5rem;
        }
        .loop-list {
          border-collapse: collapse;
          width: 100%;
          font-size: 0.85rem;
        }
        .loop-list th,
        .loop-list td {
          border: 1px solid #ddd;
          padding: 0.3rem 0.5rem;
          text-align: left;
        }
        .loop-list th {
          background: #f2f2f2;
        }
        select,
        input {
          font-size: 0.85rem;
          padding: 0.1rem;
        }
        button {
          font-size: 0.8rem;
          cursor: pointer;
        }
        .add-form {
          display: flex;
          gap: 0.3rem;
          margin-top: 0.5rem;
          align-items: center;
        }
        .add-form > * {
          flex-shrink: 0;
        }
        .sort-btn {
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 1rem;
          margin-left: 0.3rem;
        }
        .icon-btn {
          cursor: pointer;
          user-select: none;
        }
        input[type="range"] {
          width: 80px;
        }
      </style>
    `;

    // 3) Build the table header, including sort "buttons" for Name, Avg Pitch, Ch
    const isSortedByName = this._sortColumn === "name";
    const isSortedByPitch = this._sortColumn === "avgPitch";
    const isSortedByCh = this._sortColumn === "channel";

    const nameArrow = isSortedByName ? "&#9650;" : "&#9651;"; // ▲ / △
    const pitchArrow = isSortedByPitch ? "&#9660;" : "&#9661;"; // ▼ / ▽
    const chArrow = isSortedByCh ? "&#9650;" : "&#9651;"; // ▲ / △

    const headerRow = `
      <tr>
        <th>
          Name
          <button class="sort-btn" data-sort="name">${nameArrow}</button>
        </th>
        <th>Pattern</th>
        <th>
          Avg Pitch
          <button class="sort-btn" data-sort="avgPitch">${pitchArrow}</button>
        </th>
        <th>Oct +/-</th>
        <th>Mute</th>
        <th>Solo</th>
        <th>Volume</th>
        <th>Pan</th>
        <th>Device</th>
        <th>
          Ch
          <button class="sort-btn" data-sort="channel">${chArrow}</button>
        </th>
      </tr>
    `;

    // 4) Build the table rows from the sorted array
    const bodyRows = loops
      .map((loop) => {
        // Initialize user flags if not present
        if (typeof loop._userMuted === "undefined")
          loop._userMuted = loop.muted;
        if (typeof loop._userSolo === "undefined") loop._userSolo = false;
        if (typeof loop._octaveOffset === "undefined") loop._octaveOffset = 0;
        if (typeof loop._volume === "undefined") loop._volume = 100;
        if (typeof loop._pan === "undefined") loop._pan = 64;

        // Build device dropdown
        const devOptions = deviceManager.listOutputs().map((o) => {
          const sel = loop.midiOutputId === o.outputId ? "selected" : "";
          return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
        });
        const noneSel = loop.midiOutputId ? "" : "selected";
        devOptions.unshift(`<option value="" ${noneSel}>-None-</option>`);

        // Channel dropdown
        let chOptions = "";
        for (let c = 1; c <= 16; c++) {
          chOptions += `<option value="${c}" ${
            c === loop.midiChannel ? "selected" : ""
          }>${c}</option>`;
        }

        // Pattern name (constructor)
        const patternType = loop.pattern ? loop.pattern.constructor.name : "?";

        // Mute / Solo icons
        const muteIcon = loop._userMuted ? "&#128263;" : "&#128266;"; // 🔇 / 🔊
        const soloIcon = loop._userSolo ? "&#127911;" : "&#9898;"; // 🎧 / ⚪️

        // Average pitch display
        let avgPitchDisplay = "(none)";
        if (typeof loop.getApproximatePitch === "function") {
          const avgPitch = loop.getApproximatePitch();
          if (avgPitch !== null) {
            avgPitchDisplay = `${avgPitch.toFixed(1)} (${midiToNoteName(
              avgPitch
            )})`;
          }
        }

        return `
        <tr data-uuid="${this._makeLoopId(loop)}">
          <td>${loop.name || "Loop"}</td>
          <td>
            <a href="#" style="color: blue; text-decoration: underline;" data-action="config"
               data-ptype="${patternType}">
              ${patternType}
            </a>
          </td>
          <td>${avgPitchDisplay}</td>
          <td>
            <button data-action="octDown">-</button>
            <button data-action="octUp">+</button>
          </td>
          <td>
            <span data-action="mute" class="icon-btn">${muteIcon}</span>
          </td>
          <td>
            <span data-action="solo" class="icon-btn">${soloIcon}</span>
          </td>
          <td>
            <input type="range" min="0" max="127" data-action="volume"
                   value="${loop._volume}" />
          </td>
          <td>
            <input type="range" min="0" max="127" data-action="pan"
                   value="${loop._pan}" />
          </td>
          <td>
            <select data-action="setDevice">${devOptions.join("")}</select>
          </td>
          <td>
            <select data-action="setChannel">${chOptions}</select>
          </td>
        </tr>
      `;
      })
      .join("");

    // Build final HTML
    this.shadowRoot.innerHTML = `
      ${style}
      <table class="loop-list">
        <thead>
          ${headerRow}
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>

      ${this._buildAddNewRowHTML(deviceManager)}
    `;

    // Bind header sort-button events
    this.shadowRoot.querySelectorAll(".sort-btn").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        const col = evt.target.dataset.sort;
        this._sortColumn = col;
        this.render();
      });
    });

    // Bind row-level events
    this._bindRowEvents(transport);

    // Bind add-form events
    this._bindAddFormEvents();
  }

  /**
   * Build the HTML for the "Add new loop" row
   */
  _buildAddNewRowHTML(deviceManager) {
    const devs = deviceManager.listOutputs();
    const devOptions = devs.map((o) => {
      const sel = o.outputId === this.newDeviceId ? "selected" : "";
      return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
    });
    devOptions.unshift(
      `<option value="" ${this.newDeviceId ? "" : "selected"}>-None-</option>`
    );

    let channelOpts = "";
    for (let c = 1; c <= 16; c++) {
      channelOpts += `<option value="${c}" ${
        c === this.newChannel ? "selected" : ""
      }>${c}</option>`;
    }

    let patternOpts = this.patternChoices
      .map((pc) => {
        const sel = pc.value === this.newPatternType ? "selected" : "";
        return `<option value="${pc.value}" ${sel}>${pc.label}</option>`;
      })
      .join("");

    return `
      <div class="add-form">
        <span style="font-weight:bold;">Add:</span>
        <input
          style="width:60px;"
          type="text"
          value="${this.newLoopName}"
          data-addfield="name"
          placeholder="Name"
        />
        <select data-addfield="pattern">
          ${patternOpts}
        </select>
        <select data-addfield="device">
          ${devOptions.join("")}
        </select>
        <select data-addfield="channel">
          ${channelOpts}
        </select>
        <button data-action="add">+</button>
      </div>
    `;
  }

  /**
   * Binds row-level events (mute, solo, config, device, channel, oct +/-, volume, pan).
   */
  _bindRowEvents(transport) {
    const { midiBus } = this._system || {};

    this.shadowRoot.querySelectorAll(".loop-list tbody tr").forEach((rowEl) => {
      const rowId = rowEl.getAttribute("data-uuid");
      const loop = this._findLoopByUuid(transport.liveLoops, rowId);
      if (!loop) return;

      // Mute
      rowEl
        .querySelector('[data-action="mute"]')
        .addEventListener("click", () => {
          loop._userMuted = !loop._userMuted;
          this._applySoloMuteLogic();
          this.render();
        });

      // Solo
      rowEl
        .querySelector('[data-action="solo"]')
        .addEventListener("click", () => {
          loop._userSolo = !loop._userSolo;
          this._applySoloMuteLogic();
          this.render();
        });

      // Device
      rowEl
        .querySelector('select[data-action="setDevice"]')
        .addEventListener("change", (evt) => {
          loop.midiOutputId = evt.target.value || null;
        });

      // Channel
      rowEl
        .querySelector('select[data-action="setChannel"]')
        .addEventListener("change", (evt) => {
          loop.midiChannel = parseInt(evt.target.value, 10) || 1;
        });

      // Pattern config link
      const configLink = rowEl.querySelector('[data-action="config"]');
      configLink.addEventListener("click", (evt) => {
        evt.preventDefault();
        this._showPatternConfig(loop);
      });

      // Octave +/- buttons
      rowEl
        .querySelector('button[data-action="octDown"]')
        .addEventListener("click", () => {
          loop._octaveOffset -= 1;
          loop.setTranspose(loop._octaveOffset * 12);
          this.render();
        });
      rowEl
        .querySelector('button[data-action="octUp"]')
        .addEventListener("click", () => {
          loop._octaveOffset += 1;
          loop.setTranspose(loop._octaveOffset * 12);
          this.render();
        });

      // Volume fader
      rowEl
        .querySelector('input[data-action="volume"]')
        .addEventListener("input", (evt) => {
          const val = parseInt(evt.target.value, 10);
          loop._volume = val; // store for display
          // If there's a device, get the trackVolume CC
          const dev = this._getDeviceForLoop(loop);
          if (dev && this._system?.midiBus) {
            const ccNum = dev.getCC("trackVolume", loop.midiChannel);
            if (ccNum !== null) {
              midiBus.controlChange({
                outputId: loop.midiOutputId,
                channel: loop.midiChannel,
                cc: ccNum,
                value: val,
              });
            }
          }
        });

      // Pan fader
      rowEl
        .querySelector('input[data-action="pan"]')
        .addEventListener("input", (evt) => {
          const val = parseInt(evt.target.value, 10);
          loop._pan = val; // store for display
          // If there's a device, get the trackPan CC
          const dev = this._getDeviceForLoop(loop);
          if (dev && this._system?.midiBus) {
            const ccNum = dev.getCC("trackPan", loop.midiChannel);
            if (ccNum !== null) {
              midiBus.controlChange({
                outputId: loop.midiOutputId,
                channel: loop.midiChannel,
                cc: ccNum,
                value: val,
              });
            }
          }
        });
    });
  }

  /**
   * Binds the "Add new" form events
   */
  _bindAddFormEvents() {
    const addForm = this.shadowRoot.querySelector(".add-form");
    if (!addForm) return;

    addForm
      .querySelector('input[data-addfield="name"]')
      .addEventListener("input", (evt) => {
        this.newLoopName = evt.target.value;
      });
    addForm
      .querySelector('select[data-addfield="pattern"]')
      .addEventListener("change", (evt) => {
        this.newPatternType = evt.target.value;
      });
    addForm
      .querySelector('select[data-addfield="device"]')
      .addEventListener("change", (evt) => {
        this.newDeviceId = evt.target.value;
      });
    addForm
      .querySelector('select[data-addfield="channel"]')
      .addEventListener("change", (evt) => {
        this.newChannel = parseInt(evt.target.value, 10) || 1;
      });
    addForm
      .querySelector('button[data-action="add"]')
      .addEventListener("click", () => this._handleAddNewLoop());
  }

  /**
   * Creates a new loop based on the form fields, adds it to transport, re-renders.
   */
  _handleAddNewLoop() {
    const { transport, midiBus } = this._system || {};
    if (!transport || !midiBus) {
      alert("Missing system.transport or system.midiBus. Cannot create loop.");
      return;
    }

    // Create the chosen pattern
    let pattern;
    switch (this.newPatternType) {
      case "ColorfulChordSwellPattern":
        pattern = new ColorfulChordSwellPattern();
        break;
      case "EvolvingLockedDrumPattern":
        pattern = new EvolvingLockedDrumPattern();
        break;
      case "PhraseContourMelody":
        pattern = new PhraseContourMelody();
        break;
      default:
        alert("Unrecognized pattern type: " + this.newPatternType);
        return;
    }

    // Build new LiveLoop
    const newLoop = new LiveLoop(midiBus, {
      pattern,
      name: this.newLoopName,
      midiChannel: this.newChannel,
      muted: false,
      midiOutputId: this.newDeviceId || null,
    });

    // Initialize user flags
    newLoop._userMuted = false;
    newLoop._userSolo = false;
    newLoop._octaveOffset = 0;
    newLoop._volume = 100; // default volume
    newLoop._pan = 64; // default pan
    newLoop.setTranspose(0);

    // Add to transport
    transport.addLiveLoop(newLoop);

    // Reset the "name" input
    this.newLoopName = "NewLoop";
    this.render();
  }

  /**
   * If any loop is _userSolo=true, only those loops remain unmuted; all others are muted.
   * Otherwise each loop just follows its _userMuted.
   */
  _applySoloMuteLogic() {
    const { transport } = this._system || {};
    if (!transport) return;

    const loops = transport.liveLoops;
    const anySolo = loops.some((l) => l._userSolo);

    loops.forEach((l) => {
      if (anySolo) {
        l.muted = !l._userSolo;
      } else {
        l.muted = l._userMuted;
      }
    });
  }

  /**
   * Opens the appropriate config modal for a loop’s pattern type.
   */
  _showPatternConfig(loop) {
    const ptype = loop.pattern?.constructor?.name;
    let configEl = null;

    switch (ptype) {
      case "ColorfulChordSwellPattern": {
        configEl = document.createElement("colorful-chord-swell-config");
        break;
      }
      case "EvolvingLockedDrumPattern": {
        configEl = document.createElement("evolving-locked-drum-config");
        // If you want to set deviceDefinition for the drum config:
        const devDef = this._getDeviceForLoop(loop);
        if (devDef) {
          configEl.deviceDefinition = devDef;
        }
        break;
      }
      case "PhraseContourMelody": {
        configEl = document.createElement("phrase-contour-melody-config");
        break;
      }
      default:
        alert("No config UI for pattern type: " + ptype);
        return;
    }

    // Position it to fill the screen
    configEl.style.position = "fixed";
    configEl.style.inset = "0";
    configEl.style.zIndex = "9999";
    configEl.setAttribute("open", "");
    configEl.liveLoop = loop;
    document.body.appendChild(configEl);
  }

  /**
   * Utility: retrieve deviceDefinition if loop.midiOutputId is set.
   */
  _getDeviceForLoop(loop) {
    const { deviceManager } = this._system || {};
    if (!deviceManager || !loop.midiOutputId) return null;
    return deviceManager.getDeviceForOutput(loop.midiOutputId);
  }

  /**
   * Creates a unique ID to identify the loop's row, so we can find it after sorting.
   */
  _makeLoopId(loop) {
    return `${loop.name}__ch${loop.midiChannel}__${(loop._uuid ||= Math.random()
      .toString(36)
      .slice(2))}`;
  }

  /**
   * Looks up the loop in the liveLoops array by the "uuid" we assigned.
   */
  _findLoopByUuid(liveLoops, rowId) {
    return liveLoops.find((lp) => this._makeLoopId(lp) === rowId);
  }
}

customElements.define("live-loop-mixer", LiveLoopMixer);
