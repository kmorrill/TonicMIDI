// fileSelect.js
import { Midi } from "@tonejs/midi";
import { midiData, totalBars, segments, currentPlayheadBar } from "./state.js";
import {
  buildBarRuler,
  renderSegments,
  updatePlayheadPosition,
} from "./timeline.js";
import { showTrackInfo } from "./tracks.js";

/**
 * Handle file input changes for loading a new MIDI file.
 */
export async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Show the file name somewhere
  const fileNameDisplay = document.getElementById("fileNameDisplay");
  if (fileNameDisplay) {
    fileNameDisplay.innerText = file.name;
  }

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Parse with Tone.js Midi
  midiData.value = new Midi(arrayBuffer);

  // Calculate total bars based on durationTicks, PPQ, etc.
  const totalTicks = midiData.value.durationTicks;
  const ppq = midiData.value.header.ppq;

  const barsFloat = totalTicks / (4 * ppq);
  totalBars.value = Math.ceil(barsFloat);

  // Reset segments and playhead
  segments.value = [{ startBar: 1, endBar: totalBars.value }];
  currentPlayheadBar.value = 1;

  // Update timeline visuals
  buildBarRuler();
  renderSegments();
  updatePlayheadPosition();

  // Show track info
  showTrackInfo();
}
