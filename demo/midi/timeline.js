// timeline.js

import { segments, totalBars, currentPlayheadBar } from "./state.js";

// Some color array for segments
const segmentColors = [
  "#2980b9",
  "#27ae60",
  "#e74c3c",
  "#9b59b6",
  "#f1c40f",
  "#2ecc71",
  "#8e44ad",
];

// Build the bar ruler lines
export function buildBarRuler() {
  const barRulerDiv = document.getElementById("barRuler");
  if (!barRulerDiv) return;

  barRulerDiv.innerHTML = "";

  // Label bars in increments of 4
  for (let b = 1; b <= totalBars.value; b += 4) {
    const lbl = document.createElement("div");
    lbl.className = "bar-label";
    lbl.innerText = b;
    const leftPercent = ((b - 1) / totalBars.value) * 100;
    lbl.style.left = leftPercent + "%";
    barRulerDiv.appendChild(lbl);
  }
}

// Render the segments in the track lane
export function renderSegments() {
  const trackLane = document.getElementById("trackLane");
  if (!trackLane) return;

  trackLane.innerHTML = "";

  segments.value.forEach((seg, idx) => {
    const segDiv = document.createElement("div");
    segDiv.className = "segment";
    segDiv.innerText = `Bars ${seg.startBar}-${seg.endBar}`;

    const color = segmentColors[idx % segmentColors.length];
    segDiv.style.background = color;

    const totalSegBars = seg.endBar - seg.startBar + 1;
    const leftPercent = ((seg.startBar - 1) / totalBars.value) * 100;
    const widthPercent = (totalSegBars / totalBars.value) * 100;

    segDiv.style.left = leftPercent + "%";
    segDiv.style.width = widthPercent + "%";
    trackLane.appendChild(segDiv);
  });
}

// Move the red playhead line
export function updatePlayheadPosition() {
  const playheadDiv = document.getElementById("playhead");
  if (!playheadDiv) return;

  const leftPercent = ((currentPlayheadBar.value - 1) / totalBars.value) * 100;
  playheadDiv.style.left = leftPercent + "%";
}

// Split the current segment at the playhead
export function splitAtPlayhead() {
  const bar = currentPlayheadBar.value;
  if (bar <= 1 || bar >= totalBars.value) {
    alert("Cannot split at the extreme ends.");
    return;
  }

  for (let i = 0; i < segments.value.length; i++) {
    const seg = segments.value[i];
    if (bar > seg.startBar && bar <= seg.endBar) {
      if (bar === seg.startBar) {
        alert("Already a boundary here.");
        return;
      }
      const oldEnd = seg.endBar;
      seg.endBar = bar - 1;
      const newSeg = { startBar: bar, endBar: oldEnd };
      segments.value.splice(i + 1, 0, newSeg);
      break;
    }
  }
  renderSegments();
}

// Exported function to move the playhead by +/- bars
export function movePlayhead(increment) {
  let newBar = currentPlayheadBar.value + increment;
  if (newBar < 1) newBar = 1;
  if (newBar > totalBars.value) newBar = totalBars.value;
  currentPlayheadBar.value = newBar;
  updatePlayheadPosition();
}
