// File: live-loop-mixer.js

import {
  LiveLoop, // you need it for creating new loops on "Add"
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
 *      transport, // must have a .liveLoops array
 *      deviceManager, // must have .listOutputs() => array of {outputId, deviceName}
 *      midiBus // optional if adding new loops
 *   };
 *
 * Behavior:
 *   - Shows a list (table) of existing loops:
 *     - [Name] [PatternType] [Mute] [Solo] [DeviceDropdown] [ChannelDropdown]
 *     - M = Mute toggle
 *     - S = Solo
 *   - "Add New Loop" row: user picks pattern type, name, device, channel => "Add" => creates & attaches new LiveLoop
 *
 * Keep it small & tight with short text.
 */
export class LiveLoopMixer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    /**
     * We'll expect the user to assign `this.system` or `this.transport` + `this.deviceManager`.
     */
    this.system = null; // user sets { transport, deviceManager, midiBus } etc.

    // Local state for "Add New" form
    this.newLoopName = "NewLoop";
    this.newPatternType = "Chord";
    this.newDeviceId = "";
    this.newChannel = 1;

    // Known pattern types for "Add new"
    this.patternChoices = [
      { label: "Chord", value: "ColorfulChordSwellPattern" },
      { label: "Drums", value: "EvolvingLockedDrumPattern" },
      { label: "Melody", value: "PhraseContourMelody" },
    ];
  }

  /**
   * Called after the element is placed in DOM or whenever user sets .system
   */
  set system(sys) {
    this._system = sys;
    this.render();
  }
  get system() {
    return this._system;
  }

  /**
   * Re-renders the entire UI. Called whenever something changes.
   */
  render() {
    if (!this.shadowRoot) return;
    const { transport, deviceManager } = this._system || {};
    // If transport or deviceManager is missing, show a placeholder
    if (!transport || !deviceManager) {
      this.shadowRoot.innerHTML = `<p style="color:red;">LiveLoopMixer: No system/transport/deviceManager found.</p>`;
      return;
    }

    // Minimal styling
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

    // Render existing loops
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
      const deviceOptions = deviceManager.listOutputs().map((o) => {
        const sel = loop.midiOutputId === o.outputId ? "selected" : "";
        return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
      });
      // If no device set, we add a blank option
      const blankSel = loop.midiOutputId ? "" : "selected";
      deviceOptions.unshift(`<option value="" ${blankSel}>-None-</option>`);

      // Channels 1..16
      let channelOptions = "";
      for (let c = 1; c <= 16; c++) {
        channelOptions += `<option value="${c}" ${
          c === loop.midiChannel ? "selected" : ""
        }>${c}</option>`;
      }

      rows.push(`
        <tr data-idx="${idx}">
          <td>${loop.name || "Loop"}</td>
          <td>${loop.pattern ? loop.pattern.constructor.name : "?"}</td>
          <td>
            <button data-action="mute">${
              loop.muted ? "UnMute" : "Mute"
            }</button>
          </td>
          <td>
            <button data-action="solo">Solo</button>
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

    // "Add new" form
    // Gather device options again
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

    this.shadowRoot.innerHTML = `
      ${style}
      <table class="loop-list">
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>

      <div class="add-form">
        <span style="font-weight:bold;">Add:</span>
        <input style="width:60px;" type="text" value="${
          this.newLoopName
        }" data-addfield="name" placeholder="Name"/>
        <select data-addfield="pattern" title="PatternType">
          ${patternOpts}
        </select>
        <select data-addfield="device" title="Device">
          ${devOptions.join("")}
        </select>
        <select data-addfield="channel" title="MIDI Channel">
          ${channelOpts}
        </select>
        <button data-action="add">+</button>
      </div>
    `;

    // Add event listeners
    this.shadowRoot
      .querySelectorAll(".loop-list tr[data-idx]")
      .forEach((rowEl) => {
        const idx = parseInt(rowEl.getAttribute("data-idx"), 10);
        const loop = transport.liveLoops[idx];

        // Mute
        rowEl
          .querySelector('button[data-action="mute"]')
          .addEventListener("click", () => {
            const newMuted = !loop.muted;
            loop.setMuted(newMuted);
            this.render(); // re-render to update label
          });

        // Solo
        rowEl
          .querySelector('button[data-action="solo"]')
          .addEventListener("click", () => {
            // Mute all except this one
            transport.liveLoops.forEach((l) => {
              l.setMuted(l !== loop);
            });
            this.render();
          });

        // Device
        rowEl
          .querySelector('select[data-action="setDevice"]')
          .addEventListener("change", (evt) => {
            const val = evt.target.value; // outputId
            if (val) {
              loop.midiOutputId = val;
            } else {
              loop.midiOutputId = null;
            }
          });

        // Channel
        rowEl
          .querySelector('select[data-action="setChannel"]')
          .addEventListener("change", (evt) => {
            loop.midiChannel = parseInt(evt.target.value, 10) || 1;
          });
      });

    // Add new form
    const addForm = this.shadowRoot.querySelector(".add-form");
    if (addForm) {
      // text input for name
      addForm
        .querySelector('input[data-addfield="name"]')
        .addEventListener("input", (evt) => {
          this.newLoopName = evt.target.value;
        });
      // pattern
      addForm
        .querySelector('select[data-addfield="pattern"]')
        .addEventListener("change", (evt) => {
          this.newPatternType = evt.target.value;
        });
      // device
      addForm
        .querySelector('select[data-addfield="device"]')
        .addEventListener("change", (evt) => {
          this.newDeviceId = evt.target.value;
        });
      // channel
      addForm
        .querySelector('select[data-addfield="channel"]')
        .addEventListener("change", (evt) => {
          this.newChannel = parseInt(evt.target.value, 10) || 1;
        });

      // Add button
      addForm
        .querySelector('button[data-action="add"]')
        .addEventListener("click", () => this._handleAddNewLoop());
    }
  }

  /**
   * Called when user clicks the "+" button to add a new loop.
   */
  _handleAddNewLoop() {
    if (!this._system || !this._system.transport || !this._system.midiBus) {
      alert("Missing system.transport or system.midiBus. Cannot create loop.");
      return;
    }
    let pattern = null;
    // create a pattern instance
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

    // Create a new LiveLoop
    const newLoop = new LiveLoop(this._system.midiBus, {
      pattern,
      name: this.newLoopName,
      midiChannel: this.newChannel,
      muted: false,
      // If user selected a device
      midiOutputId: this.newDeviceId || null,
    });

    // Add to the transport
    this._system.transport.addLiveLoop(newLoop);

    // reset name
    this.newLoopName = "NewLoop";
    this.render();
  }
}

customElements.define("live-loop-mixer", LiveLoopMixer);
