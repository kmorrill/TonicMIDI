// main.js
import { initWebMidi } from "./midiWebAccess.js";
import {
  midiData,
  segments,
  totalBars,
  currentPlayheadBar,
  transportState,
} from "./state.js";
import {
  buildBarRuler,
  renderSegments,
  movePlayhead,
  splitAtPlayhead,
  updatePlayheadPosition,
} from "./timeline.js";
import { showTrackInfo } from "./tracks.js";
import {
  startTransport,
  stopTransport,
  updateTransportDisplay,
} from "./transport.js";

// Initialize Web MIDI as soon as possible
initWebMidi();

// On DOMContentLoaded, set up event handlers, default UI
window.addEventListener("DOMContentLoaded", () => {
  // Possibly show a message
  const appDiv = document.getElementById("app");
  if (appDiv) {
    appDiv.innerText = "MIDI parser loaded. Select a .mid file.";
  }

  // Build initial timeline
  buildBarRuler();
  renderSegments();
  updatePlayheadPosition();
  updateTransportDisplay();
});

// Expose certain functions to the window for onclick in HTML
window.movePlayhead = movePlayhead;
window.splitAtPlayhead = splitAtPlayhead;
window.startTransport = startTransport;
window.stopTransport = stopTransport;

import { handleFileSelect } from "./fileSelect.js";

window.addEventListener("DOMContentLoaded", () => {
  // ...
  const midiFileInput = document.getElementById("midiFileInput");
  if (midiFileInput) {
    midiFileInput.addEventListener("change", handleFileSelect, false);
  }
});
