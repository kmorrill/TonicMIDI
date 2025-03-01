/* harmony-demo.js */

import {
  MidiBus,
  RealPlaybackEngine,
  ChordManager,
  ChordPattern,
  ExplicitNotePattern,
  LiveLoop,
  TransportManager,
} from "../src/index.js";

window.addEventListener("load", async () => {
  console.log("[DEBUG] window.load event fired, DOM is ready.");

  /* -----------------------------------------
     1) GRAB DOM ELEMENTS (WITH SAFETY CHECKS)
  ----------------------------------------- */

  const transportStatusEl = document.getElementById("transport-status") || null;
  const midiOutputSelect =
    document.getElementById("midi-output-select") || null;
  const midiLogEl = document.getElementById("midi-log") || null;

  // CHORD UI
  const chordProgressionSelect =
    document.getElementById("chord-progression") || null;
  const chordVoicingSelect = document.getElementById("chord-voicing") || null;
  const chordOctaveSelect = document.getElementById("chord-octave") || null;
  const chordChannelInput = document.getElementById("chord-channel") || null;
  const chordVisualizationEl =
    document.getElementById("chord-visualization") || null;
  const currentChordEl = document.getElementById("current-chord") || null;

  // MELODY UI
  const melodyStyleSelect = document.getElementById("melody-style") || null;
  const melodyDurationSelect =
    document.getElementById("melody-duration") || null;
  const melodyOctaveSelect = document.getElementById("melody-octave") || null;
  const melodyChannelInput = document.getElementById("melody-channel") || null;
  const melodyVisualizationEl =
    document.getElementById("melody-visualization") || null;

  // LOOP/PERCUSSION UI
  const loopPatternSelect = document.getElementById("loop-pattern") || null;
  const loopChannelInput = document.getElementById("loop-channel") || null;
  const loopVisualizationEl =
    document.getElementById("loop-visualization") || null;

  // If any are null, just warn. This means the HTML is missing that ID.
  if (!chordChannelInput) {
    console.warn("WARNING: No element with id='chord-channel' found.");
  }
  if (!melodyChannelInput) {
    console.warn("WARNING: No element with id='melody-channel' found.");
  }
  if (!loopChannelInput) {
    console.warn("WARNING: No element with id='loop-channel' found.");
  }

  /* -----------------------------------------
     2) CREATE MIDI BUS & PLAYBACK ENGINE
  ----------------------------------------- */

  const midiBus = new MidiBus();

  // Listen for noteOn/off for debugging
  midiBus.on("noteOn", (data) => {
    logToUI(
      `noteOn(ch=${data.channel}, note=${data.note}, vel=${data.velocity})`
    );
  });
  midiBus.on("noteOff", (data) => {
    logToUI(`noteOff(ch=${data.channel}, note=${data.note})`);
  });
  midiBus.on("controlChange", (data) => {
    logToUI(`CC(ch=${data.channel}, cc=${data.cc}, val=${data.value})`);
  });

  // Log some raw "midiMessage" events (but not every 0xF8 clock pulse)
  midiBus.on("midiMessage", (msg) => {
    const byte0 = msg?.data?.[0];
    if (byte0 === 0xfa) {
      console.log("[DEBUG] midiMessage: Start (0xFA)");
    } else if (byte0 === 0xfc) {
      console.log("[DEBUG] midiMessage: Stop (0xFC)");
    } else if (byte0 === 0xf2) {
      console.log("[DEBUG] midiMessage: Song Position Pointer (0xF2)");
    }
  });

  // For output
  const realPlaybackEngine = new RealPlaybackEngine(midiBus);

  console.log("[DEBUG] initPlaybackEngine() start");
  await realPlaybackEngine.init();
  console.log(
    "[DEBUG] RealPlaybackEngine: MIDI outputs=",
    realPlaybackEngine.midiOutputs
  );
  populateMidiOutputs(realPlaybackEngine.midiOutputs);

  // Setup MIDI inputs for external clock
  await setupMidiInputs();

  function populateMidiOutputs(outputs) {
    if (!midiOutputSelect) return;
    midiOutputSelect.innerHTML = `<option value="">Select MIDI Output</option>`;
    outputs.forEach((output, idx) => {
      const opt = document.createElement("option");
      opt.value = idx.toString();
      opt.textContent = output.name || `MIDI Device #${idx}`;
      midiOutputSelect.appendChild(opt);
    });
  }

  async function setupMidiInputs() {
    console.log("[DEBUG] setupMidiInputs()");
    if (!navigator.requestMIDIAccess) {
      console.warn("Browser does not support Web MIDI API");
      logToUI("Browser doesn't support Web MIDI API.");
      return;
    }
    const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    if (midiAccess.inputs.size === 0) {
      console.warn("No MIDI inputs found. Can't receive external clock.");
      logToUI("No MIDI inputs found. External clock won't be received.");
    }
    midiAccess.inputs.forEach((input) => {
      console.log(`[DEBUG] Found input device: ${input.name} (id=${input.id})`);
      input.onmidimessage = (event) => {
        // Forward raw data to midiBus
        midiBus.emit("midiMessage", { data: event.data });
      };
    });
  }

  if (midiOutputSelect) {
    midiOutputSelect.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx)) {
        const selectedOutput = realPlaybackEngine.midiOutputs[idx];
        console.log("Using MIDI output:", selectedOutput?.name);
        // If you want to limit the engine to only that device:
        // realPlaybackEngine.setOutput(selectedOutput);
      }
    });
  }

  /* -----------------------------------------
     3) CHORD MANAGER + PATTERN (64 steps)
  ----------------------------------------- */

  const chordManager = new ChordManager();
  const chordPattern = new ChordPattern({ length: 64 });

  // Each chord is assigned a "duration" in steps.
  // The chordPattern + LiveLoop will hold the chord that many steps before noteOff.
  // Summaries:
  //  - "simple" has 2 chords, each 32 steps => total 64 steps
  //  - "pop", "jazz", "tension" each have 4 chords, each 16 steps => total 64 steps
  const chordProgressionsMap = {
    simple: [
      { root: "C", type: "maj7", duration: 32 },
      { root: "F", type: "maj7", duration: 32 },
    ],
    pop: [
      { root: "C", type: "maj", duration: 16 },
      { root: "G", type: "maj", duration: 16 },
      { root: "A", type: "min", duration: 16 },
      { root: "F", type: "maj", duration: 16 },
    ],
    jazz: [
      { root: "C", type: "maj7", duration: 16 },
      { root: "D", type: "min7", duration: 16 },
      { root: "G", type: "7", duration: 16 },
      { root: "C", type: "maj7", duration: 16 },
    ],
    tension: [
      { root: "C", type: "maj7", duration: 16 },
      { root: "D", type: "7#11", duration: 16 },
      { root: "Eb", type: "maj7#5", duration: 16 },
      { root: "G", type: "7b9", duration: 16 },
    ],
  };

  function applyChordProgression(progKey) {
    const chords = chordProgressionsMap[progKey] || chordProgressionsMap.simple;
    chordManager.setProgression(chords);
  }

  // Hook up chord progression dropdowns
  if (chordProgressionSelect) {
    chordProgressionSelect.addEventListener("change", () => {
      applyChordProgression(chordProgressionSelect.value);
    });
  }
  if (chordVoicingSelect) {
    chordVoicingSelect.addEventListener("change", () => {
      chordPattern.setVoicingType(chordVoicingSelect.value);
    });
  }
  if (chordOctaveSelect) {
    chordOctaveSelect.addEventListener("change", () => {
      chordPattern.octave = parseInt(chordOctaveSelect.value, 10);
    });
  }

  // Keep UI label updated so the user sees the current chord
  function updateCurrentChordUI(chordObj) {
    if (!currentChordEl) return;
    if (!chordObj) {
      currentChordEl.textContent = "No chord";
      return;
    }
    currentChordEl.textContent = `${chordObj.root} ${chordObj.type}`;
  }

  // Override chordPattern.getNotes so we can update UI on each step
  const origChordGetNotes = chordPattern.getNotes.bind(chordPattern);
  chordPattern.getNotes = function (stepIndex, context) {
    const notes = origChordGetNotes(stepIndex, context);
    const chord = chordManager.getChord(stepIndex);
    updateCurrentChordUI(chord);
    return notes;
  };

  /* -----------------------------------------
     4) MELODY PATTERN
  ----------------------------------------- */

  let melodyPattern = null;
  function buildMelodyPattern() {
    const style = melodyStyleSelect?.value || "arpeggio";
    const chordCount = chordManager.progression.length || 1;
    const userDuration = parseInt(melodyDurationSelect?.value || "1", 10);
    const userOctave = parseInt(melodyOctaveSelect?.value || "4", 10);
    const noteArray = [];

    for (let i = 0; i < chordCount; i++) {
      const c = chordManager.progression[i];
      const chordRoot = c.root || "C";
      const chordType = c.type || "maj";
      const segment = createMelodySegment(
        chordRoot,
        chordType,
        style,
        userOctave,
        userDuration
      );
      noteArray.push(...segment);
    }
    melodyPattern = new ExplicitNotePattern(noteArray);
  }

  function createMelodySegment(root, chordType, style, octave, dur) {
    // Very naive approach for example
    const majorScale = ["C", "D", "E", "F", "G", "A", "B"];
    const chordIntervals = {
      maj: [0, 4, 7],
      min: [0, 3, 7],
      7: [0, 4, 7, 10],
      maj7: [0, 4, 7, 11],
    };
    const intervals = chordIntervals[chordType] || chordIntervals["maj"];
    const seg = new Array(16).fill(null);

    if (style === "arpeggio") {
      for (let i = 0; i < 16; i++) {
        const intv = intervals[i % intervals.length];
        const noteName = transposeNote(root, intv);
        seg[i] = [{ note: noteName + octave, durationSteps: dur }];
      }
    } else if (style === "scale") {
      for (let i = 0; i < 16; i++) {
        seg[i] = [
          {
            note: majorScale[i % majorScale.length] + octave,
            durationSteps: dur,
          },
        ];
      }
    } else {
      // "harmonized" - add a second note a third above
      for (let i = 0; i < 16; i++) {
        const base = majorScale[i % majorScale.length];
        const harmony = majorScale[(i + 2) % majorScale.length];
        seg[i] = [
          { note: base + octave, durationSteps: dur },
          { note: harmony + octave, durationSteps: dur },
        ];
      }
    }
    return seg;
  }

  function transposeNote(root, semitones) {
    const map = {
      C: 0,
      "C#": 1,
      Db: 1,
      D: 2,
      "D#": 3,
      Eb: 3,
      E: 4,
      F: 5,
      "F#": 6,
      Gb: 6,
      G: 7,
      "G#": 8,
      Ab: 8,
      A: 9,
      "A#": 10,
      Bb: 10,
      B: 11,
    };
    const m = root.match(/^([A-G][b#]?)/i);
    if (!m) return "C";
    const baseVal = map[m[1]] ?? 0;
    let newVal = baseVal + semitones;
    while (newVal < 0) newVal += 12;
    newVal = newVal % 12;
    const revMap = [
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
    return revMap[newVal];
  }

  // If user changes melody UI:
  if (melodyStyleSelect)
    melodyStyleSelect.addEventListener("change", handleMelodyChange);
  if (melodyDurationSelect)
    melodyDurationSelect.addEventListener("change", handleMelodyChange);
  if (melodyOctaveSelect)
    melodyOctaveSelect.addEventListener("change", handleMelodyChange);

  function handleMelodyChange() {
    buildMelodyPattern();
    createOrUpdateLoops();
    updateMelodyVisualization();
  }

  /* -----------------------------------------
     5) LOOP/PERCUSSION PATTERN (16 steps)
  ----------------------------------------- */

  let loopPattern = null;
  function buildLoopPattern() {
    const choice = loopPatternSelect?.value || "kick";
    if (choice === "kick") {
      loopPattern = new ExplicitNotePattern([
        { note: 36, durationSteps: 1 },
        null,
        null,
        null,
        { note: 36, durationSteps: 1 },
        null,
        null,
        null,
        { note: 36, durationSteps: 1 },
        null,
        null,
        null,
        { note: 36, durationSteps: 1 },
        null,
        null,
        null,
      ]);
    } else if (choice === "hihat") {
      loopPattern = new ExplicitNotePattern(
        Array(16).fill({ note: 42, durationSteps: 1 })
      );
    } else {
      // "percussion"
      loopPattern = new ExplicitNotePattern([
        { note: 60, durationSteps: 1 },
        null,
        { note: 62, durationSteps: 1 },
        null,
        { note: 64, durationSteps: 1 },
        null,
        { note: 67, durationSteps: 1 },
        null,
        null,
        { note: 60, durationSteps: 1 },
        null,
        { note: 65, durationSteps: 1 },
        null,
        { note: 67, durationSteps: 1 },
        null,
        null,
      ]);
    }
  }

  if (loopPatternSelect) {
    loopPatternSelect.addEventListener("change", () => {
      buildLoopPattern();
      createOrUpdateLoops();
      updateLoopVisualization();
    });
  }

  /* -----------------------------------------
     6) CUSTOM TRANSPORT MANAGER
       (throttled console logs for clock)
  ----------------------------------------- */

  class ThrottledClockTransportManager extends TransportManager {
    constructor(midiBus, opts) {
      super(midiBus, opts);
      this.clockTickCounter = 0;
      this.lastClockLogTime = performance.now();
      this.clockLogInterval = 30000; // 30 seconds
    }

    _handleIncomingClock(message) {
      const byte0 = message?.data?.[0];
      // If start, stop, SPP -> log immediately
      if (byte0 === 0xfa) {
        console.log(
          `TransportManager got Start (0xFA) - isRunning=${this.isRunning}`
        );
      } else if (byte0 === 0xfc) {
        console.log(
          `TransportManager got Stop (0xFC) - isRunning=${this.isRunning}`
        );
      } else if (byte0 === 0xf2) {
        console.log(
          `TransportManager got SPP (0xF2) - isRunning=${this.isRunning}`
        );
      } else if (byte0 === 0xf8) {
        // Keep track of clock pulses, only log every 30s
        this.clockTickCounter++;
        const now = performance.now();
        if (now - this.lastClockLogTime > this.clockLogInterval) {
          console.log(
            `Received ${this.clockTickCounter} clock ticks in last 30s`
          );
          this.clockTickCounter = 0;
          this.lastClockLogTime = now;
        }
      }
      super._handleIncomingClock(message);
    }
  }

  const transportManager = new ThrottledClockTransportManager(midiBus, {
    liveLoops: [],
    pulsesPerStep: 6, // 6 pulses = 1 "step" at standard MIDI clock (24 PPQ => 4 steps per quarter).
  });

  /* -----------------------------------------
     7) CREATE LIVELOOPS & HOOK INTO TRANSPORT
  ----------------------------------------- */

  let chordLoop, melodyLoop, percussionLoop;

  function createOrUpdateLoops() {
    chordLoop = new LiveLoop(midiBus, {
      pattern: chordPattern,
      midiChannel: parseInt(chordChannelInput?.value || "7", 10),
      name: "Chord",
      // Provide chordManager in context so ChordPattern has it:
      context: {
        chordManager: chordManager,
      },
    });

    melodyLoop = new LiveLoop(midiBus, {
      pattern: melodyPattern,
      midiChannel: parseInt(melodyChannelInput?.value || "5", 10),
      name: "Melody",
    });

    percussionLoop = new LiveLoop(midiBus, {
      pattern: loopPattern,
      midiChannel: parseInt(loopChannelInput?.value || "10", 10),
      name: "Percussion",
    });

    console.log("chordLoop.midiChannel:", chordLoop.midiChannel);
    console.log("melodyLoop.midiChannel:", melodyLoop.midiChannel);
    console.log("percussionLoop.midiChannel:", percussionLoop.midiChannel);

    transportManager.liveLoops = [chordLoop, melodyLoop, percussionLoop];
  }

  // If user changes any channel input
  chordChannelInput?.addEventListener("change", createOrUpdateLoops);
  melodyChannelInput?.addEventListener("change", createOrUpdateLoops);
  loopChannelInput?.addEventListener("change", createOrUpdateLoops);

  /* -----------------------------------------
     8) INIT DEMO & VISUALIZATION
  ----------------------------------------- */

  function initDemo() {
    // Default chord progression
    applyChordProgression(chordProgressionSelect?.value || "simple");
    buildMelodyPattern();
    buildLoopPattern();
    createOrUpdateLoops();

    updateChordVisualization();
    updateMelodyVisualization();
    updateLoopVisualization();
  }

  initDemo(); // run once

  function updateChordVisualization() {
    if (!chordVisualizationEl) return;
    chordVisualizationEl.innerHTML = "";
    const length = chordPattern.getLength();
    for (let i = 0; i < length; i++) {
      const div = document.createElement("div");
      div.className = "step";
      if (i % 16 === 0) {
        // Just for a bit of highlighting
        div.style.borderColor = "#0078d7";
      }
      div.textContent = i;
      chordVisualizationEl.appendChild(div);
    }
  }

  function updateMelodyVisualization() {
    if (!melodyVisualizationEl || !melodyPattern) return;
    melodyVisualizationEl.innerHTML = "";
    const length = melodyPattern.getLength();
    for (let i = 0; i < length; i++) {
      const div = document.createElement("div");
      div.className = "step";
      div.textContent = i;
      melodyVisualizationEl.appendChild(div);
    }
  }

  function updateLoopVisualization() {
    if (!loopVisualizationEl || !loopPattern) return;
    loopVisualizationEl.innerHTML = "";
    const length = loopPattern.getLength();
    for (let i = 0; i < length; i++) {
      const div = document.createElement("div");
      div.className = "step";
      div.textContent = i;
      loopVisualizationEl.appendChild(div);
    }
  }

  function logToUI(msg) {
    if (!midiLogEl) return;
    const line = document.createElement("div");
    line.textContent = msg;
    midiLogEl.appendChild(line);
    midiLogEl.scrollTop = midiLogEl.scrollHeight;
  }
});
