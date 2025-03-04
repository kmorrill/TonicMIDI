// transport.js
import { currentOutput } from "./midiWebAccess.js";
import {
  midiData,
  playbackTimeouts,
  currentPlayheadBar,
  transportState,
  totalBars,
} from "./state.js";
import { updatePlayheadPosition } from "./timeline.js";

/**
 * Top-level state for transport and playback.
 */
let clockInterval = null; // existing: handles MIDI clock pulses
let playheadInterval = null; // NEW: interval for updating the playhead in real time
let transportStartTime = 0; // NEW: the time (performance.now) when playback started
let startBarAtPlayback = 1; // NEW: which bar we started on when hitting "Play"

/**
 * Called when user clicks "Play" button
 */
export function startTransport() {
  if (!midiData.value) {
    alert("No MIDI loaded.");
    return;
  }
  if (!currentOutput) {
    alert("No MIDI output available.");
    return;
  }

  // Check if there's a tempo event
  let chosenBPM = 120;
  if (midiData.value.header.tempos && midiData.value.header.tempos.length > 0) {
    chosenBPM = midiData.value.header.tempos[0].bpm;
  }

  // Update the transport state
  transportState.value = `Playing from bar ${currentPlayheadBar.value} at BPM ${chosenBPM}`;
  updateTransportDisplay();

  // Record the time we pressed "Play" and the bar we start on
  transportStartTime = performance.now();
  startBarAtPlayback = currentPlayheadBar.value;

  // Send MIDI Start
  currentOutput.send([0xfa]); // 0xFA: Start

  // Start a MIDI clock at 24 PPQN
  startClock(chosenBPM);

  // Schedule all note events
  scheduleNotes(chosenBPM);

  // [NEW] Set up a small interval to move the playhead in real time
  if (!playheadInterval) {
    const secondsPerBar = 4 * (60 / chosenBPM); // 4 beats per bar
    playheadInterval = setInterval(() => {
      const elapsedSec = (performance.now() - transportStartTime) / 1000;
      const barsPassed = elapsedSec / secondsPerBar;
      let newBar = startBarAtPlayback + barsPassed; // fractional bar index

      // If we've gone beyond the total bars, auto-stop (or clamp as you like)
      if (newBar >= totalBars.value) {
        stopTransport();
        return;
      }

      // Don’t go below bar 1
      if (newBar < 1) {
        newBar = 1;
      }

      // If you want integer bars only, floor and add 1
      currentPlayheadBar.value = Math.floor(newBar) + 1;

      // Move the red playhead line in the UI
      updatePlayheadPosition();
    }, 100); // update ~10x/second
  }
}

/**
 * Called when user clicks "Stop" button
 */
export function stopTransport() {
  if (currentOutput) {
    // Send MIDI Stop
    currentOutput.send([0xfc]); // 0xFC: Stop
  }

  // Stop the MIDI clock
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }

  // Clear any scheduled note timeouts
  playbackTimeouts.value.forEach((t) => clearTimeout(t));
  playbackTimeouts.value = [];

  // [NEW] Clear the playhead interval
  if (playheadInterval) {
    clearInterval(playheadInterval);
    playheadInterval = null;
  }

  // Transport is stopped
  transportState.value = "Stopped";
  updateTransportDisplay();
}

/**
 * Start a regular MIDI clock pulse at 24 PPQN (times per quarter note).
 */
function startClock(bpm) {
  if (!currentOutput) return;
  // 24 pulses per quarter note => compute ms between pulses
  const intervalMs = (60 / bpm / 24) * 1000;
  clockInterval = setInterval(() => {
    currentOutput.send([0xf8]); // 0xF8: MIDI Clock
  }, intervalMs);
}

/**
 * Schedule note-on/off messages for all tracks.
 * Takes into account the user’s selected channel/mute for each track.
 */
function scheduleNotes(bpm) {
  if (!midiData.value) return;

  const ppq = midiData.value.header.ppq;
  // Convert ticks to seconds at the chosen BPM
  const ticksToSeconds = (ticks) => ticks * (60 / (bpm * ppq));

  // If we're at bar X, that's an offset in time
  const barOffsetSec = (currentPlayheadBar.value - 1) * 4 * (60 / bpm);

  const tracksContainer = document.getElementById("tracksContainer");
  if (!tracksContainer) return;

  midiData.value.tracks.forEach((track, trackIdx) => {
    track.notes.forEach((note) => {
      const startSec = ticksToSeconds(note.ticks);
      const durationSec = ticksToSeconds(note.durationTicks);
      const endSec = startSec + durationSec;

      // Adjust to start at the current bar
      const playOnSec = startSec - barOffsetSec;
      const playOffSec = endSec - barOffsetSec;

      // If the note ends before our playback start, skip
      if (playOffSec < 0) return;

      // Note-On
      const onTO = setTimeout(() => {
        const trackItem =
          tracksContainer.querySelectorAll(".track-item")[trackIdx];
        if (!trackItem) return;

        // If muted => skip noteOn
        const muteCheckbox = trackItem.querySelector(".mute-checkbox");
        if (muteCheckbox && muteCheckbox.checked) {
          return;
        }

        // Outbound channel
        const channelSelect = trackItem.querySelector(".channel-select");
        let channel = 0; // default
        if (channelSelect) {
          channel = parseInt(channelSelect.value) - 1; // 1..16 => 0..15
        }

        const noteOnStatus = 0x90 + channel; // 0x90 = Note On, plus channel
        const velocity = Math.round(note.velocity * 127);
        currentOutput.send([noteOnStatus, note.midi, velocity]);
      }, playOnSec * 1000);
      playbackTimeouts.value.push(onTO);

      // Note-Off
      const offTO = setTimeout(() => {
        const trackItem =
          tracksContainer.querySelectorAll(".track-item")[trackIdx];
        if (!trackItem) return;

        // Always send note-off (avoid stuck notes)
        const channelSelect = trackItem.querySelector(".channel-select");
        let channel = 0;
        if (channelSelect) {
          channel = parseInt(channelSelect.value) - 1;
        }
        const noteOffStatus = 0x80 + channel; // 0x80 = Note Off, plus channel
        currentOutput.send([noteOffStatus, note.midi, 0]);
      }, playOffSec * 1000);
      playbackTimeouts.value.push(offTO);
    });
  });
}

/**
 * Show/update transport status in the DOM.
 */
export function updateTransportDisplay() {
  const transportStateEl = document.getElementById("transportState");
  if (transportStateEl) {
    transportStateEl.innerText = "Transport: " + transportState.value;
  }
}
