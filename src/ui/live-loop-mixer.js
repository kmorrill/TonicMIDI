// File: live-loop-mixer.js

import {
  LiveLoop,
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
 * New in this version:
 *   - Sorting indicators now use ▲/△ and ▼/▽ to show active vs inactive sort columns.
 *   - Mute and Solo columns use emoji icons instead of text.
 */

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

    // We expect .system = { transport, deviceManager, midiBus, ... } from outside
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
    // If null, no sorting is applied
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
      // Ascending by name
      loops.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (this._sortColumn === "channel") {
      // Ascending by midiChannel
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
      </style>
    `;

    // 3) Build the table header, including sort "buttons" for Name, Avg Pitch, Ch
    // Arrows based on whether it's active or not.
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
        <th>Device</th>
        <th>
          Ch
          <button class="sort-btn" data-sort="channel">${chArrow}</button>
        </th>
      </tr>
    `;

    // 4) Build the table rows from the sorted array
    const bodyRows = loops
      .map((loop, idx) => {
        // If no _userMuted / _userSolo, set them
        if (typeof loop._userMuted === "undefined") {
          loop._userMuted = loop.muted;
        }
        if (typeof loop._userSolo === "undefined") {
          loop._userSolo = false;
        }

        // If no _octaveOffset, define it
        if (typeof loop._octaveOffset === "undefined") {
          loop._octaveOffset = 0;
        }

        // Build device dropdown
        const deviceOptions = deviceManager.listOutputs().map((o) => {
          const sel = loop.midiOutputId === o.outputId ? "selected" : "";
          return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
        });
        const noneSel = loop.midiOutputId ? "" : "selected";
        deviceOptions.unshift(`<option value="" ${noneSel}>-None-</option>`);

        // Build channel dropdown
        let channelOptions = "";
        for (let c = 1; c <= 16; c++) {
          channelOptions += `<option value="${c}" ${
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
            <a href="#" style="color: blue; text-decoration: underline;" data-action="config" data-ptype="${patternType}">
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
            <select data-action="setDevice">${deviceOptions.join("")}</select>
          </td>
          <td>
            <select data-action="setChannel">${channelOptions}</select>
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

    // 5) Bind sort-button events in the header
    this.shadowRoot.querySelectorAll(".sort-btn").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        const col = evt.target.dataset.sort;
        // set the active column, re-render
        this._sortColumn = col;
        this.render();
      });
    });

    // 6) Bind row-level events
    this._bindRowEvents(transport);
    // 7) Bind add-form events
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
   * Binds row-level events (mute, solo, config, setDevice, setChannel, octave +/-).
   */
  _bindRowEvents(transport) {
    this.shadowRoot.querySelectorAll(".loop-list tbody tr").forEach((rowEl) => {
      const rowId = rowEl.getAttribute("data-uuid");
      // Find the actual loop by matching ID
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

      // Device selection
      rowEl
        .querySelector('select[data-action="setDevice"]')
        .addEventListener("change", (evt) => {
          const val = evt.target.value;
          loop.midiOutputId = val || null;
        });

      // Channel selection
      rowEl
        .querySelector('select[data-action="setChannel"]')
        .addEventListener("change", (evt) => {
          loop.midiChannel = parseInt(evt.target.value, 10) || 1;
        });

      // Config (pattern link)
      const configLink = rowEl.querySelector('[data-action="config"]');
      configLink.addEventListener("click", (evt) => {
        evt.preventDefault();
        this._showPatternConfig(loop);
      });

      // Octave Down
      const btnOctDown = rowEl.querySelector('button[data-action="octDown"]');
      btnOctDown.addEventListener("click", () => {
        loop._octaveOffset -= 1;
        loop.setTranspose(loop._octaveOffset * 12);
        this.render();
      });

      // Octave Up
      const btnOctUp = rowEl.querySelector('button[data-action="octUp"]');
      btnOctUp.addEventListener("click", () => {
        loop._octaveOffset += 1;
        loop.setTranspose(loop._octaveOffset * 12);
        this.render();
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
    newLoop._octaveOffset = 0; // no offset by default
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
   * Opens the appropriate config modal for a loop’s pattern type,
   * appending it to document.body so it can display as an overlay.
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
        const devDef = this._system?.deviceManager?.getDeviceForOutput(
          loop.midiOutputId
        );
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

    // Position it to fill the screen (similar to how modals do)
    configEl.style.position = "fixed";
    configEl.style.inset = "0";
    configEl.style.zIndex = "9999";

    // Mark it open
    configEl.setAttribute("open", "");

    // Assign the target loop so the modal knows which pattern to update
    configEl.liveLoop = loop;

    // Insert into the main document (outside our shadow DOM)
    document.body.appendChild(configEl);
  }

  /**
   * Creates a unique ID to identify the loop's row, so we can find it after sorting.
   */
  _makeLoopId(loop) {
    // simplest is to combine loop.name + channel + a random ID or something
    // you could do a real unique ID if your loops have one
    return `${loop.name}__ch${loop.midiChannel}__${(loop._uuid ||= Math.random()
      .toString(36)
      .slice(2))}`;
  }

  /**
   * Looks up the loop in the liveLoops array by the "uuid" we assigned.
   */
  _findLoopByUuid(liveLoops, rowId) {
    return liveLoops.find((lp) => {
      const cand = this._makeLoopId(lp);
      return cand === rowId;
    });
  }
}

customElements.define("live-loop-mixer", LiveLoopMixer);
