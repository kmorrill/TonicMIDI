// File: src/ui/live-loop-connector.js

import {
  LiveLoop,
  ColorfulChordSwellPattern,
  EvolvingLockedDrumPattern,
  PhraseContourMelody,
  SyncopatedBass,
  ChanceStepArp,
} from "../index.js";

/**
 * live-loop-connector.js
 *
 * A lightweight UI component that displays a list of currently active LiveLoops
 * and allows the user to:
 *   - Add new loops (by name, pattern type, device, and MIDI channel).
 *   - Remove loops (which stops them from playing).
 *
 * Columns:
 *   - Name
 *   - Pattern Type
 *   - Device
 *   - MIDI Channel
 *   - Remove (button)
 *
 * REQUIRED: You must provide a `system` property containing at least:
 *   { transport, deviceManager, midiBus }
 */
export class LiveLoopConnector extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // We store references to the system, which must have transport, deviceManager, midiBus
    this._system = null;

    // For adding new loops:
    this.newLoopName = "NewLoop";
    this.newPatternType = "ColorfulChordSwellPattern";
    this.newDeviceId = "";
    this.newChannel = 1;

    // Pattern types we let the user pick from:
    this.patternChoices = [
      { label: "Chord Swell", value: "ColorfulChordSwellPattern" },
      { label: "Evolving Drums", value: "EvolvingLockedDrumPattern" },
      { label: "Contour Melody", value: "PhraseContourMelody" },
      { label: "Syncopated Bass", value: "SyncopatedBass" },
      { label: "Chance Arp", value: "ChanceStepArp" },
    ];
  }

  /**
   * The system must be an object with at least:
   *   - system.transport   (TransportManager)
   *   - system.deviceManager (DeviceManager)
   *   - system.midiBus     (MidiBus)
   */
  set system(sys) {
    this._system = sys;
    this.render();
  }
  get system() {
    return this._system;
  }

  connectedCallback() {
    this.render();
  }

  /**
   * Render a table showing each LiveLoop’s name, pattern type, device, channel,
   * plus a remove button. Below that, a small form for adding new loops.
   */
  render() {
    if (!this.shadowRoot) return;

    const { transport, deviceManager } = this._system || {};
    if (!transport || !deviceManager) {
      this.shadowRoot.innerHTML = `
        <p style="color:red;">
          LiveLoopConnector: No valid system.transport or system.deviceManager found.
        </p>`;
      return;
    }

    const loops = transport.liveLoops || [];

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
        table {
          border-collapse: collapse;
          width: 100%;
          font-size: 0.85rem;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 0.3rem 0.5rem;
          text-align: left;
        }
        th {
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
          margin-top: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .add-form > * {
          flex-shrink: 0;
        }
        .remove-btn {
          color: #c00;
          font-weight: bold;
        }
      </style>
    `;

    // Build table rows from the loops
    const bodyRows = loops
      .map((loop) => {
        // pattern type name
        const patternType = loop.pattern ? loop.pattern.constructor.name : "–";

        // Build device dropdown
        const devOptions = deviceManager.listOutputs().map((o) => {
          const sel = loop.midiOutputId === o.outputId ? "selected" : "";
          return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
        });
        // Optional "None" if no device is selected
        const noneSel = loop.midiOutputId ? "" : "selected";
        devOptions.unshift(`<option value="" ${noneSel}>-None-</option>`);

        // Channel dropdown
        let chOptions = "";
        for (let c = 1; c <= 16; c++) {
          chOptions += `<option value="${c}" ${
            c === loop.midiChannel ? "selected" : ""
          }>${c}</option>`;
        }

        return `
          <tr data-uuid="${this._makeLoopId(loop)}">
            <td>${loop.name || "Loop"}</td>
            <td>${patternType}</td>
            <td>
              <select data-action="setDevice">${devOptions.join("")}</select>
            </td>
            <td>
              <select data-action="setChannel">${chOptions}</select>
            </td>
            <td>
              <button class="remove-btn" data-action="removeTrack">Remove</button>
            </td>
          </tr>
        `;
      })
      .join("");

    // Build the "Add New" row
    const devList = deviceManager.listOutputs();
    const devOptions = devList.map((o) => {
      const sel = this.newDeviceId === o.outputId ? "selected" : "";
      return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
    });
    devOptions.unshift(
      `<option value="" ${this.newDeviceId ? "" : "selected"}>-None-</option>`
    );

    let chOptions = "";
    for (let c = 1; c <= 16; c++) {
      chOptions += `<option value="${c}" ${
        c === this.newChannel ? "selected" : ""
      }>${c}</option>`;
    }

    const patternOpts = this.patternChoices
      .map((pc) => {
        const sel = pc.value === this.newPatternType ? "selected" : "";
        return `<option value="${pc.value}" ${sel}>${pc.label}</option>`;
      })
      .join("");

    // The main table
    this.shadowRoot.innerHTML = `
      ${style}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Pattern Type</th>
            <th>Device</th>
            <th>Ch</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>

      <div class="add-form">
        <strong>Add New:</strong>
        <input
          type="text"
          style="width:100px;"
          data-addfield="name"
          value="${this.newLoopName}"
          placeholder="Name"
        />
        <select data-addfield="pattern">
          ${patternOpts}
        </select>
        <select data-addfield="device">
          ${devOptions.join("")}
        </select>
        <select data-addfield="channel">
          ${chOptions}
        </select>
        <button data-action="addNew">Add</button>
      </div>
    `;

    // Bind row events
    this._bindRowEvents();

    // Bind add-form events
    this._bindAddFormEvents();
  }

  /**
   * For each row, we wire up:
   *   - setDevice
   *   - setChannel
   *   - removeTrack
   */
  _bindRowEvents() {
    const { transport } = this._system || {};
    if (!transport) return;

    this.shadowRoot.querySelectorAll("tbody tr").forEach((rowEl) => {
      const rowId = rowEl.getAttribute("data-uuid");
      const loop = this._findLoopByUuid(transport.liveLoops, rowId);
      if (!loop) return;

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

      // Remove track
      rowEl
        .querySelector('[data-action="removeTrack"]')
        .addEventListener("click", () => {
          this._removeLoop(loop);
        });
    });
  }

  /**
   * Handle the "Add New" form inputs and button
   */
  _bindAddFormEvents() {
    const addFormEl = this.shadowRoot.querySelector(".add-form");
    if (!addFormEl) return;

    // Name
    addFormEl
      .querySelector('input[data-addfield="name"]')
      .addEventListener("input", (evt) => {
        this.newLoopName = evt.target.value;
      });

    // Pattern
    addFormEl
      .querySelector('select[data-addfield="pattern"]')
      .addEventListener("change", (evt) => {
        this.newPatternType = evt.target.value;
      });

    // Device
    addFormEl
      .querySelector('select[data-addfield="device"]')
      .addEventListener("change", (evt) => {
        this.newDeviceId = evt.target.value;
      });

    // Channel
    addFormEl
      .querySelector('select[data-addfield="channel"]')
      .addEventListener("change", (evt) => {
        this.newChannel = parseInt(evt.target.value, 10) || 1;
      });

    // Add button
    addFormEl
      .querySelector('button[data-action="addNew"]')
      .addEventListener("click", () => {
        this._handleAddNewLoop();
      });
  }

  /**
   * Actually create the new LiveLoop with chosen pattern, add to transport,
   * and re-render the table.
   */
  _handleAddNewLoop() {
    const { transport, midiBus } = this._system || {};
    if (!transport || !midiBus) {
      alert(
        "Cannot create new loop because system.transport or system.midiBus is missing."
      );
      return;
    }

    // Create pattern instance based on chosen type
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
      case "SyncopatedBass":
        pattern = new SyncopatedBass();
        break;
      case "ChanceStepArp":
        pattern = new ChanceStepArp();
        break;
      default:
        alert("Unrecognized pattern type: " + this.newPatternType);
        return;
    }

    // Create the LiveLoop
    const newLoop = new LiveLoop(midiBus, {
      pattern,
      name: this.newLoopName,
      midiChannel: this.newChannel,
      muted: false,
      midiOutputId: this.newDeviceId || null,
    });

    // Add to the transport
    transport.addLiveLoop(newLoop);

    // Reset the "Name" field for a next addition if desired
    this.newLoopName = "NewLoop";
    this.render();
  }

  /**
   * Removes a loop from the transport and stops it.
   */
  _removeLoop(loop) {
    const { transport, midiBus } = this._system || {};
    if (!transport || !midiBus) return;

    // Force noteOff on any notes from this loop
    // (We can also do midiBus.stopAllNotes(), but that stops everything.)
    // Here, we can loop over loop.activeNotes if you prefer to noteOff them individually.
    for (const noteObj of loop.activeNotes || []) {
      midiBus.noteOff({
        outputId: loop.midiOutputId,
        channel: noteObj.channel,
        note: noteObj.note,
      });
    }

    // Remove from transport.liveLoops
    const idx = transport.liveLoops.indexOf(loop);
    if (idx >= 0) {
      transport.liveLoops.splice(idx, 1);
    }

    // Re-render
    this.render();
  }

  /**
   * Helper to make a unique row ID for each loop
   */
  _makeLoopId(loop) {
    // store a hidden property if not already
    if (!loop._uuid) {
      loop._uuid = Math.random().toString(36).substring(2);
    }
    return loop._uuid;
  }

  /**
   * Find a loop by the row ID we assigned
   */
  _findLoopByUuid(liveLoops, rowId) {
    return liveLoops.find((lp) => lp._uuid === rowId);
  }
}

customElements.define("live-loop-connector", LiveLoopConnector);
