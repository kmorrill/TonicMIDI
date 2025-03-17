// File: src/ui/live-loop-mixer.js

import {
  ColorfulChordSwellPattern,
  EvolvingLockedDrumPattern,
  PhraseContourMelody,
  SyncopatedBass,
  ChanceStepArp,
} from "../index.js";

/**
 * Helper: Convert a MIDI note number (float/int) to e.g. "C#4".
 */
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

/**
 * A scaled-back LiveLoopMixer component that displays each active LiveLoop
 * with columns: Name (clickable -> config), Avg Pitch, Oct+/-, Mute, Solo,
 * Volume, Pan, Delay, Reverb. Allows sorting by Name (asc) or Pitch (desc).
 * No device/channel columns or add/remove track features.
 */
export class LiveLoopMixer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // We expect `this.system = { transport, deviceManager, midiBus }` from outside
    this._system = null;

    // Which column is used for sorting? "name" (asc) or "avgPitch" (desc).
    this._sortColumn = null; // "name" or "avgPitch"
  }

  /**
   * The system must contain at least { transport, deviceManager, midiBus }.
   */
  set system(sys) {
    this._system = sys;
    this.render();
  }
  get system() {
    return this._system;
  }

  /**
   * Renders the mixer UI as a table. No device/channel columns, no add/remove tracks.
   */
  render() {
    if (!this.shadowRoot) return;
    const { transport, deviceManager } = this._system || {};
    if (!transport || !deviceManager) {
      this.shadowRoot.innerHTML = `
        <p style="color:red;">
          LiveLoopMixer: No valid system.transport or system.deviceManager found.
        </p>`;
      return;
    }

    // 1) Get all loops from transport, copy them for sorting
    const loops = [...transport.liveLoops];

    // 2) Sorting logic
    if (this._sortColumn === "name") {
      // Sort by loop.name (asc)
      loops.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (this._sortColumn === "avgPitch") {
      // Sort by average pitch (desc)
      loops.sort((a, b) => {
        const aPitch =
          (a.getApproximatePitch && a.getApproximatePitch()) ?? -999;
        const bPitch =
          (b.getApproximatePitch && b.getApproximatePitch()) ?? -999;
        return bPitch - aPitch; // descending
      });
    }

    // 3) Basic styling
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
          width: 100%;
          border-collapse: collapse;
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
        a[data-action="config"] {
          color: blue;
          text-decoration: underline;
          cursor: pointer;
        }
      </style>
    `;

    // 4) Build the table header
    const isSortedByName = this._sortColumn === "name";
    const isSortedByPitch = this._sortColumn === "avgPitch";

    const nameArrow = isSortedByName ? "&#9650;" : "&#9651;"; // ▲ / △
    const pitchArrow = isSortedByPitch ? "&#9660;" : "&#9661;"; // ▼ / ▽

    const headerHTML = `
      <thead>
        <tr>
          <th>
            Name
            <button class="sort-btn" data-sort="name">${nameArrow}</button>
          </th>
          <th>
            Avg Pitch
            <button class="sort-btn" data-sort="avgPitch">${pitchArrow}</button>
          </th>
          <th>Oct +/-</th>
          <th>Mute</th>
          <th>Solo</th>
          <th>Volume</th>
          <th>Pan</th>
          <th>Delay</th>
          <th>Reverb</th>
        </tr>
      </thead>
    `;

    // 5) Build table rows
    const bodyRows = loops
      .map((loop) => {
        // Ensure user-defined tracking props exist
        if (typeof loop._userMuted === "undefined")
          loop._userMuted = loop.muted;
        if (typeof loop._userSolo === "undefined") loop._userSolo = false;
        if (typeof loop._octaveOffset === "undefined") loop._octaveOffset = 0;
        if (typeof loop._volume === "undefined") loop._volume = 100;
        if (typeof loop._pan === "undefined") loop._pan = 64;
        if (typeof loop._delay === "undefined") loop._delay = 0;
        if (typeof loop._reverb === "undefined") loop._reverb = 0;

        const dev = this._getDeviceForLoop(loop);
        const ccDelay = dev ? dev.getCC("send_to_fx1", loop.midiChannel) : null;
        const ccReverb = dev
          ? dev.getCC("send_to_fx2", loop.midiChannel)
          : null;

        // Mute / Solo icons
        const muteIcon = loop._userMuted ? "&#128263;" : "&#128266;"; // 🔇 / 🔊
        const soloIcon = loop._userSolo ? "&#127911;" : "&#9898;"; // 🎧 / ⚪️

        // Avg Pitch
        let avgPitchDisplay = "(none)";
        if (typeof loop.getApproximatePitch === "function") {
          const avgPitch = loop.getApproximatePitch();
          if (avgPitch !== null) {
            avgPitchDisplay = `${avgPitch.toFixed(1)} (${midiToNoteName(
              avgPitch
            )})`;
          }
        }

        // Delay / Reverb cells
        const delayCell =
          ccDelay != null
            ? `<input type="range" min="0" max="127" data-action="delay" value="${loop._delay}" />`
            : `<em>-</em>`;
        const reverbCell =
          ccReverb != null
            ? `<input type="range" min="0" max="127" data-action="reverb" value="${loop._reverb}" />`
            : `<em>-</em>`;

        return `
        <tr data-uuid="${this._makeLoopId(loop)}"
            data-cc-delay="${ccDelay == null ? "" : ccDelay}"
            data-cc-reverb="${ccReverb == null ? "" : ccReverb}">
          <td>
            <a href="#" data-action="config">
              ${loop.name || "Loop"}
            </a>
          </td>
          <td>${avgPitchDisplay}</td>
          <td>
            <button data-action="octDown">-</button>
            <button data-action="octUp">+</button>
          </td>
          <td>
            <span class="icon-btn" data-action="mute">${muteIcon}</span>
          </td>
          <td>
            <span class="icon-btn" data-action="solo">${soloIcon}</span>
          </td>
          <td>
            <input type="range" min="0" max="127" data-action="volume"
                   value="${loop._volume}" />
          </td>
          <td>
            <input type="range" min="0" max="127" data-action="pan"
                   value="${loop._pan}" />
          </td>
          <td>${delayCell}</td>
          <td>${reverbCell}</td>
        </tr>
      `;
      })
      .join("");

    const tableHTML = `
      <table>
        ${headerHTML}
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    `;

    // 6) Combine all into shadowRoot
    this.shadowRoot.innerHTML = `${style} ${tableHTML}`;

    // 7) Bind events
    this._bindHeaderSortEvents();
    this._bindRowEvents();
  }

  /**
   * Allows sorting by name or pitch on header button click.
   */
  _bindHeaderSortEvents() {
    this.shadowRoot.querySelectorAll(".sort-btn").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        const col = evt.target.dataset.sort; // "name" or "avgPitch"
        this._sortColumn = col;
        this.render();
      });
    });
  }

  /**
   * For each row, wire up Mute, Solo, Config link, Oct+/-, Volume, Pan, Delay, Reverb.
   */
  _bindRowEvents() {
    const { transport, midiBus } = this._system || {};
    if (!transport || !midiBus) return;

    const rows = this.shadowRoot.querySelectorAll("tbody tr");
    rows.forEach((rowEl) => {
      const rowId = rowEl.getAttribute("data-uuid");
      const loop = this._findLoopByUuid(transport.liveLoops, rowId);
      if (!loop) return;

      // Mute
      rowEl
        .querySelector('[data-action="mute"]')
        ?.addEventListener("click", () => {
          loop._userMuted = !loop._userMuted;
          this._applySoloMuteLogic();
          this.render();
        });

      // Solo
      rowEl
        .querySelector('[data-action="solo"]')
        ?.addEventListener("click", () => {
          loop._userSolo = !loop._userSolo;
          this._applySoloMuteLogic();
          this.render();
        });

      // Pattern config link
      rowEl
        .querySelector('[data-action="config"]')
        ?.addEventListener("click", (evt) => {
          evt.preventDefault();
          this._showPatternConfig(loop);
        });

      // Octave +/-
      rowEl
        .querySelector('[data-action="octDown"]')
        ?.addEventListener("click", () => {
          loop._octaveOffset -= 1;
          loop.setTranspose(loop._octaveOffset * 12);
          this.render();
        });
      rowEl
        .querySelector('[data-action="octUp"]')
        ?.addEventListener("click", () => {
          loop._octaveOffset += 1;
          loop.setTranspose(loop._octaveOffset * 12);
          this.render();
        });

      // Volume
      rowEl
        .querySelector('input[data-action="volume"]')
        ?.addEventListener("input", (evt) => {
          const val = parseInt(evt.target.value, 10);
          loop._volume = val;
          const dev = this._getDeviceForLoop(loop);
          if (dev) {
            const ccNum = dev.getCC("trackVolume", loop.midiChannel);
            if (ccNum != null) {
              midiBus.controlChange({
                outputId: loop.midiOutputId,
                channel: loop.midiChannel,
                cc: ccNum,
                value: val,
              });
            }
          }
        });

      // Pan
      rowEl
        .querySelector('input[data-action="pan"]')
        ?.addEventListener("input", (evt) => {
          const val = parseInt(evt.target.value, 10);
          loop._pan = val;
          const dev = this._getDeviceForLoop(loop);
          if (dev) {
            const ccNum = dev.getCC("trackPan", loop.midiChannel);
            if (ccNum != null) {
              midiBus.controlChange({
                outputId: loop.midiOutputId,
                channel: loop.midiChannel,
                cc: ccNum,
                value: val,
              });
            }
          }
        });

      // Delay
      const delayFader = rowEl.querySelector('input[data-action="delay"]');
      if (delayFader) {
        delayFader.addEventListener("input", (evt) => {
          const val = parseInt(evt.target.value, 10);
          loop._delay = val;
          const dev = this._getDeviceForLoop(loop);
          if (dev) {
            const ccStr = rowEl.getAttribute("data-cc-delay");
            if (ccStr) {
              const ccNum = parseInt(ccStr, 10);
              midiBus.controlChange({
                outputId: loop.midiOutputId,
                channel: loop.midiChannel,
                cc: ccNum,
                value: val,
              });
            }
          }
        });
      }

      // Reverb
      const reverbFader = rowEl.querySelector('input[data-action="reverb"]');
      if (reverbFader) {
        reverbFader.addEventListener("input", (evt) => {
          const val = parseInt(evt.target.value, 10);
          loop._reverb = val;
          const dev = this._getDeviceForLoop(loop);
          if (dev) {
            const ccStr = rowEl.getAttribute("data-cc-reverb");
            if (ccStr) {
              const ccNum = parseInt(ccStr, 10);
              midiBus.controlChange({
                outputId: loop.midiOutputId,
                channel: loop.midiChannel,
                cc: ccNum,
                value: val,
              });
            }
          }
        });
      }
    });
  }

  /**
   * If any loop is in solo mode, only those remain unmuted; all others are muted.
   * Otherwise each loop is muted if _userMuted is true.
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
   * If the user clicks the link in the Name cell, open the config UI for that pattern.
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
        // Optionally pass deviceDefinition
        const dev = this._getDeviceForLoop(loop);
        if (dev) {
          configEl.deviceDefinition = dev;
        }
        break;
      }
      case "PhraseContourMelody": {
        configEl = document.createElement("phrase-contour-melody-config");
        break;
      }
      case "SyncopatedBass": {
        configEl = document.createElement("syncopated-bass-config");
        break;
      }
      case "ChanceStepArp": {
        configEl = document.createElement("chance-step-arp-config");
        break;
      }
      default:
        alert("No config UI for pattern type: " + ptype);
        return;
    }

    // Position & open the config
    configEl.style.position = "fixed";
    configEl.style.inset = "0";
    configEl.style.zIndex = "9999";
    configEl.liveLoop = loop;
    configEl.setAttribute("open", "");
    document.body.appendChild(configEl);
  }

  /**
   * Looks up the deviceDefinition if loop.midiOutputId is set.
   */
  _getDeviceForLoop(loop) {
    const { deviceManager } = this._system || {};
    if (!deviceManager || !loop.midiOutputId) return null;
    return deviceManager.getDeviceForOutput(loop.midiOutputId);
  }

  /**
   * Create a unique ID for each loop row so we can find it after sorting.
   */
  _makeLoopId(loop) {
    if (!loop._uuid) {
      loop._uuid = Math.random().toString(36).slice(2);
    }
    return loop._uuid;
  }

  /**
   * Find the corresponding loop from transport.liveLoops by that row ID.
   */
  _findLoopByUuid(liveLoops, rowId) {
    return liveLoops.find((lp) => lp._uuid === rowId);
  }
}

customElements.define("live-loop-mixer", LiveLoopMixer);
