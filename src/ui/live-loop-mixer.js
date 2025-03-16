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
 * Behavior:
 *   - Shows a list (table) of existing loops:
 *       [Name] [PatternType + Config Btn] [Avg Pitch] [Oct +/-] [Mute] [Solo] [DeviceDropdown] [ChannelDropdown]
 *     Clicking "Mute" toggles that loop’s `_userMuted`.
 *     Clicking "Solo" toggles that loop’s `_userSolo`.
 *     The "Avg Pitch" column displays the approximate pitch from loop.getApproximatePitch().
 *     The "Oct +/-" column has two buttons to raise/lower the loop by one octave each click.
 *   - If any loop is soloed, only those with `_userSolo = true` remain unmuted.
 *   - Otherwise each loop’s `muted` follows its `_userMuted`.
 *   - "Add New Loop" row: user picks pattern type, name, device, channel => "Add"
 *     => creates & attaches a new LiveLoop to the transport.
 *   - Clicking “Config” tries to open a suitable modal for the pattern:
 *       - <colorful-chord-swell-config> if it’s a ColorfulChordSwellPattern
 *       - <evolving-locked-drum-config> if EvolvingLockedDrumPattern
 *       - <phrase-contour-melody-config> if PhraseContourMelody
 */

// Helper to convert a MIDI note number (float or int) to something like "C#4"
function midiToNoteName(midiVal) {
  if (midiVal == null) return "(none)";

  const clamped = Math.round(midiVal);
  if (clamped < 0 || clamped > 127) return `(out of range)`;

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
  const name = notes[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
}

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

    // The pattern types we offer from the "Add New" row:
    this.patternChoices = [
      { label: "Chord", value: "ColorfulChordSwellPattern" },
      { label: "Drums", value: "EvolvingLockedDrumPattern" },
      { label: "Melody", value: "PhraseContourMelody" },
    ];
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
      </style>
    `;

    // Build the table rows for the existing loops
    const rows = [];
    rows.push(`
      <tr>
        <th>Name</th>
        <th>Pattern</th>
        <th>Avg Pitch</th>
        <th>Oct +/-</th>
        <th>M</th>
        <th>S</th>
        <th>Device</th>
        <th>Ch</th>
      </tr>
    `);

    transport.liveLoops.forEach((loop, idx) => {
      // Track user-level Mute / Solo if not present
      if (typeof loop._userMuted === "undefined") {
        loop._userMuted = loop.muted;
      }
      if (typeof loop._userSolo === "undefined") {
        loop._userSolo = false;
      }

      // We'll also track a custom property for how many octaves we've shifted
      // (0 => no shift, 1 => +12 semitones, etc.).
      if (typeof loop._octaveOffset === "undefined") {
        loop._octaveOffset = 0;
      }

      // Build device dropdown
      const deviceOptions = deviceManager.listOutputs().map((o) => {
        const sel = loop.midiOutputId === o.outputId ? "selected" : "";
        return `<option value="${o.outputId}" ${sel}>${o.deviceName}</option>`;
      });
      // Add an empty option for "no device"
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
      // Mute / Solo button labels
      const muteLabel = loop._userMuted ? "UnMute" : "Mute";
      const soloLabel = loop._userSolo ? "UnSolo" : "Solo";

      // Display the approximate pitch
      let avgPitchDisplay = "(none)";
      if (typeof loop.getApproximatePitch === "function") {
        const avgPitch = loop.getApproximatePitch();
        if (avgPitch !== null) {
          avgPitchDisplay = `${avgPitch.toFixed(1)} (${midiToNoteName(
            avgPitch
          )})`;
        }
      }

      rows.push(`
        <tr data-idx="${idx}">
          <td>${loop.name || "Loop"}</td>
          <td>
            ${patternType}
            <button data-action="config" data-ptype="${patternType}">Config</button>
          </td>
          <td>${avgPitchDisplay}</td>
          <td>
            <button data-action="octDown">Oct -</button>
            <button data-action="octUp">Oct +</button>
          </td>
          <td><button data-action="mute">${muteLabel}</button></td>
          <td><button data-action="solo">${soloLabel}</button></td>
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

    // Wire up row-level handlers
    this.shadowRoot
      .querySelectorAll(".loop-list tr[data-idx]")
      .forEach((rowEl) => {
        const idx = parseInt(rowEl.getAttribute("data-idx"), 10);
        const loop = transport.liveLoops[idx];

        // Mute
        rowEl
          .querySelector('button[data-action="mute"]')
          .addEventListener("click", () => {
            loop._userMuted = !loop._userMuted;
            this._applySoloMuteLogic();
            this.render();
          });

        // Solo
        rowEl
          .querySelector('button[data-action="solo"]')
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

        // "Config" button
        const configBtn = rowEl.querySelector('button[data-action="config"]');
        configBtn.addEventListener("click", () => {
          this._showPatternConfig(loop);
        });

        // Octave Down
        const btnOctDown = rowEl.querySelector('button[data-action="octDown"]');
        btnOctDown.addEventListener("click", () => {
          // Decrement the stored offset, apply transpose
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

    // "Add new" form
    const addForm = this.shadowRoot.querySelector(".add-form");
    if (addForm) {
      // name
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
      // add button
      addForm
        .querySelector('button[data-action="add"]')
        .addEventListener("click", () => this._handleAddNewLoop());
    }
  }

  /**
   * Called when user clicks “Add” on the bottom form:
   * creates a new pattern & LiveLoop, adds it to transport.
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
    // Also set the custom octave offset to 0 initially
    newLoop._octaveOffset = 0;
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

    // Position it to fill the screen (similar to how the modals do natively)
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
}

customElements.define("live-loop-mixer", LiveLoopMixer);
