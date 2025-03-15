// File: live-loop-mixer.js

import {
  LiveLoop, // needed if creating new loops on "Add"
  ColorfulChordSwellPattern,
  EvolvingLockedDrumPattern,
  PhraseContourMelody,
} from "../index.js";

/**
 * <live-loop-mixer> usage:
 *
 *   <live-loop-mixer></live-loop-mixer>
 *
 *   document.querySelector("live-loop-mixer").system = {
 *      transport,     // must have a .liveLoops array
 *      deviceManager, // must have .listOutputs() => array of {outputId, deviceName}
 *      midiBus,       // optional if adding new loops
 *   };
 *
 * Behavior:
 *   - Shows a list (table) of existing loops:
 *       [Name] [PatternType] [ Mute ] [ Solo ] [DeviceDropdown] [ChannelDropdown]
 *     Clicking "Mute" toggles that loop’s `_userMuted`.
 *     Clicking "Solo" toggles that loop’s `_userSolo`.
 *   - If any loop is soloed, only those with `_userSolo = true` remain unmuted.
 *   - Otherwise each loop’s `muted` follows its `_userMuted`.
 *   - "Add New Loop" row: user picks pattern type, name, device, channel => "Add"
 *     => creates & attaches a new LiveLoop to the transport.
 */
export class LiveLoopMixer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // We expect .system to be set from outside:
    // { transport, deviceManager, midiBus, ... }
    this._system = null;

    // "Add New" form local state
    this.newLoopName = "NewLoop";
    this.newPatternType = "ColorfulChordSwellPattern";
    this.newDeviceId = "";
    this.newChannel = 1;

    // Recognized pattern types
    this.patternChoices = [
      { label: "Chord", value: "ColorfulChordSwellPattern" },
      { label: "Drums", value: "EvolvingLockedDrumPattern" },
      { label: "Melody", value: "PhraseContourMelody" },
    ];
  }

  // Exposed property: system = { transport, deviceManager, midiBus, ... }
  set system(sys) {
    this._system = sys;
    this.render();
  }
  get system() {
    return this._system;
  }

  /**
   * Renders the mixer UI: a table of loops + an "Add new" row.
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

    // Minimal CSS
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
        .loop-list th, .loop-list td {
          border: 1px solid #ddd;
          padding: 0.3rem 0.5rem;
          text-align: left;
        }
        .loop-list th {
          background: #f2f2f2;
        }
        select, input {
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
      </style>
    `;

    // Build the table rows for existing loops
    const rows = [];
    rows.push(`
      <tr>
        <th>Name</th>
        <th>Pattern</th>
        <th>M</th>
        <th>S</th>
        <th>Dev</th>
        <th>Ch</th>
      </tr>
    `);

    transport.liveLoops.forEach((loop, idx) => {
      // Initialize _userMuted / _userSolo if not set
      if (typeof loop._userMuted === "undefined") {
        loop._userMuted = loop.muted; // start from its current
      }
      if (typeof loop._userSolo === "undefined") {
        loop._userSolo = false;
      }

      // Device dropdown
      const deviceOptions = deviceManager.listOutputs().map((o) => {
        const sel = loop.midiOutputId === o.outputId ? "selected" : "";
        return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
      });
      // add a blank "None" if we want no device
      const blankSel = loop.midiOutputId ? "" : "selected";
      deviceOptions.unshift(`<option value="" ${blankSel}>-None-</option>`);

      // Channel dropdown
      let channelOptions = "";
      for (let c = 1; c <= 16; c++) {
        channelOptions += `<option value="${c}" ${
          c === loop.midiChannel ? "selected" : ""
        }>${c}</option>`;
      }

      const patternType = loop.pattern ? loop.pattern.constructor.name : "?";
      const muteLabel = loop._userMuted ? "UnMute" : "Mute";
      const soloLabel = loop._userSolo ? "UnSolo" : "Solo";

      rows.push(`
        <tr data-idx="${idx}">
          <td>${loop.name || "Loop"}</td>
          <td>${patternType}</td>
          <td>
            <button data-action="mute">${muteLabel}</button>
          </td>
          <td>
            <button data-action="solo">${soloLabel}</button>
          </td>
          <td>
            <select data-action="setDevice">${deviceOptions.join("")}</select>
          </td>
          <td>
            <select data-action="setChannel">${channelOptions}</select>
          </td>
        </tr>
      `);
    });

    // Build the "Add new" row
    const devs = deviceManager.listOutputs();
    const devOptions = devs.map((o) => {
      const sel = o.outputId === this.newDeviceId ? "selected" : "";
      return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
    });
    devOptions.unshift(`<option value="">-None-</option>`);

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

    // Combine everything into HTML
    this.shadowRoot.innerHTML = `
      ${style}
      <table class="loop-list">
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>

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

    // Wire up all row-level handlers
    this.shadowRoot
      .querySelectorAll(".loop-list tr[data-idx]")
      .forEach((rowEl) => {
        const idx = parseInt(rowEl.getAttribute("data-idx"), 10);
        const loop = transport.liveLoops[idx];

        // Mute button
        rowEl
          .querySelector('button[data-action="mute"]')
          .addEventListener("click", () => {
            loop._userMuted = !loop._userMuted;
            this._applySoloMuteLogic();
            this.render();
          });

        // Solo button
        rowEl
          .querySelector('button[data-action="solo"]')
          .addEventListener("click", () => {
            loop._userSolo = !loop._userSolo;
            this._applySoloMuteLogic();
            this.render();
          });

        // Device select
        rowEl
          .querySelector('select[data-action="setDevice"]')
          .addEventListener("change", (evt) => {
            const val = evt.target.value;
            loop.midiOutputId = val || null; // allow unsetting
          });

        // Channel select
        rowEl
          .querySelector('select[data-action="setChannel"]')
          .addEventListener("change", (evt) => {
            loop.midiChannel = parseInt(evt.target.value, 10) || 1;
          });
      });

    // "Add new" form handlers
    const addForm = this.shadowRoot.querySelector(".add-form");
    if (addForm) {
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
  }

  /**
   * Called when user clicks “Add” on the "Add new" form
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

    // Build a new LiveLoop
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

    // Add to transport
    transport.addLiveLoop(newLoop);

    // Reset the "name" field
    this.newLoopName = "NewLoop";
    this.render();
  }

  /**
   * Applies final muted states based on user’s Solo and Mute settings:
   * - If ANY loop is solo, only those with `_userSolo = true` are unmuted.
   * - Otherwise, each loop’s `muted = _userMuted`.
   */
  _applySoloMuteLogic() {
    const { transport } = this._system;
    if (!transport) return;

    const loops = transport.liveLoops;
    const anySolo = loops.some((l) => l._userSolo);

    loops.forEach((l) => {
      if (anySolo) {
        // If there's at least one solo, everything else is muted
        l.muted = !l._userSolo;
      } else {
        // No solos => follow each loop’s personal `_userMuted` flag
        l.muted = l._userMuted;
      }
    });
  }
}

customElements.define("live-loop-mixer", LiveLoopMixer);
