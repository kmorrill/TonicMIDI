// tracks.js

import { midiData } from "./state.js";

/**
 * Build the channel select dropdown from 1..16
 */
function buildChannelOptionsHTML() {
  let opts = "";
  for (let i = 1; i <= 16; i++) {
    opts += `<option value="${i}">${i}</option>`;
  }
  return opts;
}

/**
 * Show track info: track name, instrument, channel, etc.
 */
export function showTrackInfo() {
  const tracksInfoDiv = document.getElementById("midiTracksInfo");
  const tracksContainer = document.getElementById("tracksContainer");
  if (!tracksInfoDiv || !tracksContainer) return;

  tracksContainer.innerHTML = ""; // Clear any previous listing

  if (!midiData.value || !midiData.value.tracks.length) {
    tracksInfoDiv.style.display = "none";
    return;
  }
  tracksInfoDiv.style.display = "block";

  // For each track, build UI
  midiData.value.tracks.forEach((track, idx) => {
    const trackName = track.name || `Track ${idx + 1}`;
    const instrumentName = track.instrument.name || "Unknown Instrument";
    const midiChannel = track.channel >= 0 ? track.channel : "N/A";
    const eventCount = track.notes.length; // # of note events

    const div = document.createElement("div");
    div.className = "track-item";
    div.innerHTML = `
      <label>Track ${idx + 1}:</label>
      <strong>${trackName}</strong><br/>
      <em>Instrument:</em> ${instrumentName}<br/>
      <em>Original Channel:</em> ${midiChannel} <br/>
      <div style="margin-top: 5px;">
        <label>Muted? 
          <input type="checkbox" class="mute-checkbox" checked />
        </label>
      </div>
      <label>Outbound Channel:</label>
      <select class="channel-select">
        ${buildChannelOptionsHTML()}
      </select>
      <br/>
      <small>Metadata: ${eventCount} note events.</small>
    `;
    tracksContainer.appendChild(div);
  });
}
