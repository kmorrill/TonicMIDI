// demo/live-loop-demo.js
import { MidiBus } from "../src/midi-bus.js";
// or import from your "index.js" if it re-exports these
import { MockPlaybackEngine } from "../src/engines/mock-playback-engine.js";
// or RealPlaybackEngine if you want actual MIDI
import { ExplicitNotePattern } from "../src/patterns/explicit-note-pattern.js";
import { LFO } from "../src/lfo.js";
import { LiveLoop } from "../src/live-loop.js";

////////////////////////////////////////////////////////////////////////////////
// 1) Setup: MIDI Bus & Playback Engine
////////////////////////////////////////////////////////////////////////////////
const midiBus = new MidiBus();
const playbackEngine = new MockPlaybackEngine(midiBus);
// If you want real MIDI, replace with RealPlaybackEngine and call await realEngine.init() etc.

// Simple logging function for the UI
function logEvent(type, data) {
  const logEl = document.getElementById("midi-log");
  const p = document.createElement("p");
  p.textContent = `[${type}] ${JSON.stringify(data)}`;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

// Subscribe to MIDI Bus events to display them
midiBus.on("noteOn", (data) => logEvent("noteOn", data));
midiBus.on("noteOff", (data) => logEvent("noteOff", data));
midiBus.on("controlChange", (data) => logEvent("controlChange", data));

////////////////////////////////////////////////////////////////////////////////
// 2) Create Patterns
////////////////////////////////////////////////////////////////////////////////
const patternA = new ExplicitNotePattern([
  "C4",
  "E4",
  "G4",
  "C4",
  "E4",
  "G4",
  "F4",
  "D4",
]);
const patternB = new ExplicitNotePattern([
  { note: "C4" },
  { note: "C4" },
  { note: "E4" },
  { note: "E4" },
  { note: "G4" },
  { note: "G4" },
  { note: "G4" },
  { note: "B4" },
]);

////////////////////////////////////////////////////////////////////////////////
// 3) Create an LFO (optional)
////////////////////////////////////////////////////////////////////////////////
const myLFO = new LFO({
  frequency: 1.0, // 1 cycle/sec
  amplitude: 1.0,
  offset: 0.0,
  shape: "sine",
});

////////////////////////////////////////////////////////////////////////////////
// 4) Create the LiveLoop
////////////////////////////////////////////////////////////////////////////////
const liveLoop = new LiveLoop(midiBus, {
  pattern: patternA,
  lfos: [], // start with no LFO
  midiChannel: 1,
  context: {},
});

////////////////////////////////////////////////////////////////////////////////
// 5) Fake Transport Logic
////////////////////////////////////////////////////////////////////////////////
let stepIndex = 0;
let transportInterval = null;
let transportRunning = false;

// We'll run "tick()" every 200ms = 5 ticks/sec
// This is arbitrary, but enough to show off LFO updates more frequently than an 8-step pattern.
function startTransport() {
  if (transportRunning) return;
  transportRunning = true;
  document.getElementById("current-step").textContent = String(stepIndex);

  transportInterval = setInterval(() => {
    // deltaTime in seconds between ticks
    const deltaTime = 0.2; // each tick is 0.2s
    liveLoop.tick(stepIndex, deltaTime);
    stepIndex++;
    // update UI
    document.getElementById("current-step").textContent = String(stepIndex);
  }, 200);
}

function stopTransport() {
  if (!transportRunning) return;
  transportRunning = false;
  clearInterval(transportInterval);
  transportInterval = null;
  // We do NOT call noteOff here, since transport manager might do that in a real scenario
}

////////////////////////////////////////////////////////////////////////////////
// 6) Wire up DOM UI
////////////////////////////////////////////////////////////////////////////////
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-transport");
  const stopBtn = document.getElementById("stop-transport");
  const patternSelect = document.getElementById("pattern-select");
  const patternEnqueuedCheckbox = document.getElementById("pattern-enqueued");
  const enableLfoCheckbox = document.getElementById("enable-lfo");

  startBtn.addEventListener("click", () => startTransport());
  stopBtn.addEventListener("click", () => stopTransport());

  // Switch patterns (immediate or enqueued)
  patternSelect.addEventListener("change", () => {
    const val = patternSelect.value; // 'A' or 'B'
    const newPattern = val === "A" ? patternA : patternB;
    const immediate = !patternEnqueuedCheckbox.checked;
    liveLoop.setPattern(newPattern, immediate);
    logEvent("setPattern", { pattern: val, immediate });
  });

  // Enable/Disable LFO
  enableLfoCheckbox.addEventListener("change", () => {
    if (enableLfoCheckbox.checked) {
      // Add the LFO if not already present
      if (!liveLoop.lfos.includes(myLFO)) {
        liveLoop.addLFO(myLFO);
      }
      logEvent("LFO enabled", {});
    } else {
      // Remove the LFO. (We don't have a built-in remove method, but let's do it manually.)
      // In a real system, you'd implement a removeLFO(index) on LiveLoop.
      const idx = liveLoop.lfos.indexOf(myLFO);
      if (idx >= 0) {
        liveLoop.lfos.splice(idx, 1);
      }
      logEvent("LFO disabled", {});
    }
  });
});
