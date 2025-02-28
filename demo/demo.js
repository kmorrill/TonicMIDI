import { MidiBus, RealPlaybackEngine, ExplicitNotePattern } from "../src/index.js";
import { LFO } from "./lfo.js";

// DOM Elements
const statusEl = document.getElementById('status');
const outputsList = document.getElementById('outputs-list');
const midiLog = document.getElementById('midi-log');
const currentStepEl = document.getElementById('current-step');
const patternVisualizationEl = document.getElementById('pattern-visualization');
const transportStatusEl = document.getElementById('transport-status');
const patternSendingStatusEl = document.getElementById('pattern-sending-status');

// Notes & Buttons
const noteCButton = document.getElementById('note-c');
const noteEButton = document.getElementById('note-e');
const noteGButton = document.getElementById('note-g');
const chordCButton = document.getElementById('chord-c');
const stopAllButton = document.getElementById('stop-all');

// Pattern Controls
const enablePatternCheckbox = document.getElementById('enable-pattern');
const patternARadio = document.getElementById('pattern-a');
const patternBRadio = document.getElementById('pattern-b');

// Initialize MIDI
const midiBus = new MidiBus();
const realEngine = new RealPlaybackEngine(midiBus);

// Create pattern instances
const patternA = new ExplicitNotePattern(["C4", "E4", "G4"]);
const patternB = new ExplicitNotePattern([
  { note: "C4", durationStepsOrBeats: 2 },
  { note: "E4" },
  { note: "G4" }
]);

// Pattern playback state
let currentPattern = null;
let currentStep = 0;
let patternInterval = null;
let activeNotes = [];
let isTransportRunning = false;
let isPatternSendingEnabled = false;

// Map note names to MIDI numbers
const noteToMidi = {
  'C4': 60,
  'E4': 64,
  'G4': 67
};

// Log MIDI events to the UI
function logEvent(event, data) {
  const logEntry = document.createElement('div');
  logEntry.textContent = `${new Date().toISOString().substr(11, 8)} - ${event}: ${JSON.stringify(data)}`;
  midiLog.appendChild(logEntry);
  midiLog.scrollTop = midiLog.scrollHeight;
}

// Subscribe to MidiBus events to log them
midiBus.on('noteOn', (data) => logEvent('noteOn', data));
midiBus.on('noteOff', (data) => logEvent('noteOff', data));
midiBus.on('controlChange', (data) => logEvent('controlChange', data));

// Initialize Web MIDI
async function initMidi() {
  try {
    await realEngine.init();
    
    // Update status
    if (realEngine.midiOutputs.length > 0) {
      statusEl.textContent = `MIDI Initialized: ${realEngine.midiOutputs.length} output(s) available`;
      statusEl.style.backgroundColor = '#e6ffe6';
      
      // Update outputs list
      outputsList.innerHTML = '';
      realEngine.midiOutputs.forEach(output => {
        const li = document.createElement('li');
        li.textContent = `${output.name} (${output.id})`;
        outputsList.appendChild(li);
      });
    } else {
      statusEl.textContent = 'No MIDI outputs found. Connect a MIDI device and refresh.';
      statusEl.style.backgroundColor = '#fff0e6';
    }

    // Initialize pattern visualization
    updatePatternVisualization(patternA);
  } catch (error) {
    statusEl.textContent = `MIDI Error: ${error.message}`;
    statusEl.style.backgroundColor = '#ffe6e6';
    console.error('MIDI initialization error:', error);
  }
}

// Update the pattern visualization in the UI
function updatePatternVisualization(pattern) {
  patternVisualizationEl.innerHTML = '';
  
  for (let i = 0; i < pattern.getLength(); i++) {
    const stepEl = document.createElement('div');
    stepEl.className = 'step';
    stepEl.setAttribute('data-step', i);
    
    const notes = pattern.getNotes(i);
    stepEl.textContent = notes.map(n => n.note.replace(/\d+/, '')).join(' ');
    
    patternVisualizationEl.appendChild(stepEl);
  }
}

// Highlight the current step in the visualization
function highlightCurrentStep(step) {
  // Remove active class from all steps
  document.querySelectorAll('.step').forEach(el => {
    el.classList.remove('active');
  });
  
  // Add active class to current step
  const stepEl = document.querySelector(`.step[data-step="${step}"]`);
  if (stepEl) {
    stepEl.classList.add('active');
  }
  
  // Update current step text
  currentStepEl.textContent = `Current Step: ${step + 1}`;
}

// Play a pattern step
function playPatternStep(pattern, step) {
  // Stop any active notes
  stopActiveNotes();
  
  // Get notes for current step
  const notes = pattern.getNotes(step);
  
  // Play the notes
  notes.forEach(noteObj => {
    // Convert note name to MIDI number
    const midiNote = noteToMidi[noteObj.note];
    if (midiNote !== undefined) {
      midiBus.noteOn({ channel: 1, note: midiNote, velocity: 100 });
      
      // Track active notes
      activeNotes.push(midiNote);
    }
  });
  
  // Update visualization
  highlightCurrentStep(step);
}

// Stop currently active notes
function stopActiveNotes() {
  activeNotes.forEach(note => {
    midiBus.noteOff({ channel: 1, note });
  });
  activeNotes = [];
}

// Handle external transport start
function handleTransportStart() {
  if (!isTransportRunning) {
    isTransportRunning = true;
    currentStep = 0;
    
    // Update UI
    transportStatusEl.textContent = 'Running';
    transportStatusEl.className = 'running';
    
    // Log event
    logEvent('transportStart', {});
    
    // Start pattern if enabled
    if (isPatternSendingEnabled) {
      startPatternClock();
    }
  }
}

// Handle external transport stop
function handleTransportStop() {
  if (isTransportRunning) {
    isTransportRunning = false;
    
    // Stop pattern clock
    stopPatternClock();
    
    // Update UI
    transportStatusEl.textContent = 'Stopped';
    transportStatusEl.className = 'stopped';
    
    // Log event
    logEvent('transportStop', {});
  }
}

// Start the pattern clock
function startPatternClock() {
  // Use the currently selected pattern
  const pattern = patternARadio.checked ? patternA : patternB;
  
  // Set current pattern and update visualization
  currentPattern = pattern;
  updatePatternVisualization(pattern);
  
  // Calculate step duration in ms based on BPM (hardcoded for now)
  // In a real implementation, this would follow the external clock
  const bpm = 120;
  const stepDuration = 60000 / bpm;
  
  // Clear any existing interval
  if (patternInterval) {
    clearInterval(patternInterval);
  }
  
  // Start the pattern playback interval
  patternInterval = setInterval(() => {
    if (isTransportRunning && isPatternSendingEnabled) {
      playPatternStep(pattern, currentStep);
      
      // Increment step
      currentStep = (currentStep + 1) % pattern.getLength();
    }
  }, stepDuration);
  
  // Start immediately
  if (isTransportRunning && isPatternSendingEnabled) {
    playPatternStep(pattern, currentStep);
  }
  
  // Update pattern sending status
  patternSendingStatusEl.textContent = 'Enabled';
  patternSendingStatusEl.className = 'enabled';
}

// Stop the pattern clock
function stopPatternClock() {
  if (patternInterval) {
    clearInterval(patternInterval);
    patternInterval = null;
  }
  
  stopActiveNotes();
  currentStepEl.textContent = 'Current Step: None';
  
  // Remove active class from all steps
  document.querySelectorAll('.step').forEach(el => {
    el.classList.remove('active');
  });
  
  // Update pattern sending status if disabled
  if (!isPatternSendingEnabled) {
    patternSendingStatusEl.textContent = 'Disabled';
    patternSendingStatusEl.className = 'disabled';
  }
}

// Set up button event handlers
noteCButton.addEventListener('click', () => {
  midiBus.noteOn({ channel: 1, note: 60, velocity: 100 });
  // Automatically turn the note off after 500ms
  setTimeout(() => {
    midiBus.noteOff({ channel: 1, note: 60 });
  }, 500);
});

noteEButton.addEventListener('click', () => {
  midiBus.noteOn({ channel: 1, note: 64, velocity: 100 });
  setTimeout(() => {
    midiBus.noteOff({ channel: 1, note: 64 });
  }, 500);
});

noteGButton.addEventListener('click', () => {
  midiBus.noteOn({ channel: 1, note: 67, velocity: 100 });
  setTimeout(() => {
    midiBus.noteOff({ channel: 1, note: 67 });
  }, 500);
});

chordCButton.addEventListener('click', () => {
  // Play C Major chord (C, E, G)
  midiBus.noteOn({ channel: 1, note: 60, velocity: 100 }); // C
  midiBus.noteOn({ channel: 1, note: 64, velocity: 100 }); // E
  midiBus.noteOn({ channel: 1, note: 67, velocity: 100 }); // G
  
  // Turn off after 1 second
  setTimeout(() => {
    midiBus.noteOff({ channel: 1, note: 60 });
    midiBus.noteOff({ channel: 1, note: 64 });
    midiBus.noteOff({ channel: 1, note: 67 });
  }, 1000);
});

stopAllButton.addEventListener('click', () => {
  midiBus.stopAllNotes();
  logEvent('stopAllNotes', {});
});

// Pattern sending checkbox handler
enablePatternCheckbox.addEventListener('change', () => {
  isPatternSendingEnabled = enablePatternCheckbox.checked;
  
  if (isPatternSendingEnabled) {
    patternSendingStatusEl.textContent = 'Enabled';
    patternSendingStatusEl.className = 'enabled';
    
    // Start pattern if transport is running
    if (isTransportRunning) {
      startPatternClock();
    }
    
    logEvent('patternSendingEnabled', {});
  } else {
    patternSendingStatusEl.textContent = 'Disabled';
    patternSendingStatusEl.className = 'disabled';
    stopPatternClock();
    logEvent('patternSendingDisabled', {});
  }
});

// Pattern type radio button handlers
patternARadio.addEventListener('change', () => {
  if (patternARadio.checked && isPatternSendingEnabled) {
    currentPattern = patternA;
    updatePatternVisualization(patternA);
    logEvent('patternChanged', { type: 'A', notes: ["C4", "E4", "G4"] });
  }
});

patternBRadio.addEventListener('change', () => {
  if (patternBRadio.checked && isPatternSendingEnabled) {
    currentPattern = patternB;
    updatePatternVisualization(patternB);
    logEvent('patternChanged', { type: 'B', notes: [
      { note: "C4", durationStepsOrBeats: 2 },
      { note: "E4" },
      { note: "G4" }
    ]});
  }
});

// Subscribe to MIDI messages
function setupTransportListeners() {
  // For the demo, we'll use some keyboard keys to simulate transport messages
  // In a real implementation, this would receive actual MIDI messages
  
  // Listen for key events to simulate MIDI transport messages
  document.addEventListener('keydown', (event) => {
    // Space = Toggle transport
    if (event.code === 'Space') {
      if (isTransportRunning) {
        handleTransportStop();
      } else {
        handleTransportStart();
      }
    }
    
    // Enter = Start transport
    if (event.code === 'Enter') {
      handleTransportStart();
    }
    
    // Escape = Stop transport
    if (event.code === 'Escape') {
      handleTransportStop();
    }
  });
  
  // In a real implementation, you would listen for MIDI messages like this:
  // The TransportManager component would handle this in the full implementation
  /*
  realEngine.subscribeToMidiMessages(msg => {
    // Check for MIDI Start message (0xFA)
    if (msg.data[0] === 0xFA) {
      handleTransportStart();
    }
    // Check for MIDI Stop message (0xFC)
    else if (msg.data[0] === 0xFC) {
      handleTransportStop();
    }
  });
  */
}

// LFO Demo Implementation
const lfoFrequencySlider = document.getElementById('lfo-frequency');
const lfoFrequencyValue = document.getElementById('lfo-frequency-value');
const lfoAmplitudeSlider = document.getElementById('lfo-amplitude');
const lfoAmplitudeValue = document.getElementById('lfo-amplitude-value');
const lfoOffsetSlider = document.getElementById('lfo-offset');
const lfoOffsetValue = document.getElementById('lfo-offset-value');
const lfoShapeSelect = document.getElementById('lfo-shape');
const lfoCurrentValue = document.getElementById('lfo-current-value');
const lfoToMidiCheckbox = document.getElementById('lfo-to-midi');
const lfoCcNumberSelect = document.getElementById('lfo-cc-number');
const lfoCanvas = document.getElementById('lfo-canvas');
const lfoCanvasCtx = lfoCanvas.getContext('2d');

// Create an LFO with 2 cycles/second, amplitude = 0.5, offset = 0.5, sine shape
const lfo = new LFO({ 
  frequency: parseFloat(lfoFrequencySlider.value), 
  amplitude: parseFloat(lfoAmplitudeSlider.value), 
  offset: parseFloat(lfoOffsetSlider.value), 
  shape: lfoShapeSelect.value 
});

// Animation and update variables
let animationFrameId = null;
let lastFrameTime = 0;
const historyPoints = 100;
const lfoHistory = Array(historyPoints).fill(lfo.offset);
let sendLfoToMidi = false;

// Update LFO parameters based on UI controls
function updateLfoParameters() {
  const frequency = parseFloat(lfoFrequencySlider.value);
  const amplitude = parseFloat(lfoAmplitudeSlider.value);
  const offset = parseFloat(lfoOffsetSlider.value);
  const shape = lfoShapeSelect.value;
  
  lfo.setFrequency(frequency);
  lfo.setAmplitude(amplitude);
  lfo.setOffset(offset);
  lfo.setShape(shape);
  
  // Update display values
  lfoFrequencyValue.textContent = `${frequency.toFixed(1)} Hz`;
  lfoAmplitudeValue.textContent = amplitude.toFixed(2);
  lfoOffsetValue.textContent = offset.toFixed(2);
}

// Draw the LFO waveform on the canvas
function drawLfoVisualization() {
  const { width, height } = lfoCanvas;
  
  // Clear the canvas
  lfoCanvasCtx.clearRect(0, 0, width, height);
  
  // Draw the center line
  lfoCanvasCtx.beginPath();
  lfoCanvasCtx.strokeStyle = '#ccc';
  lfoCanvasCtx.moveTo(0, height / 2);
  lfoCanvasCtx.lineTo(width, height / 2);
  lfoCanvasCtx.stroke();
  
  // Draw min/max lines
  lfoCanvasCtx.beginPath();
  lfoCanvasCtx.strokeStyle = '#eee';
  lfoCanvasCtx.moveTo(0, 10);
  lfoCanvasCtx.lineTo(width, 10);
  lfoCanvasCtx.moveTo(0, height - 10);
  lfoCanvasCtx.lineTo(width, height - 10);
  lfoCanvasCtx.stroke();
  
  // Draw the LFO waveform
  lfoCanvasCtx.beginPath();
  lfoCanvasCtx.strokeStyle = '#0078d7';
  lfoCanvasCtx.lineWidth = 2;
  
  for (let i = 0; i < historyPoints; i++) {
    const x = (i / (historyPoints - 1)) * width;
    // Map value from 0-1 to canvas height
    const y = height - ((lfoHistory[i] * 0.8 * height) + 0.1 * height);
    
    if (i === 0) {
      lfoCanvasCtx.moveTo(x, y);
    } else {
      lfoCanvasCtx.lineTo(x, y);
    }
  }
  
  lfoCanvasCtx.stroke();
  
  // Draw the current value point
  const currentValue = lfoHistory[lfoHistory.length - 1];
  const x = width - 5;
  const y = height - ((currentValue * 0.8 * height) + 0.1 * height);
  
  lfoCanvasCtx.beginPath();
  lfoCanvasCtx.fillStyle = '#ff4500';
  lfoCanvasCtx.arc(x, y, 6, 0, Math.PI * 2);
  lfoCanvasCtx.fill();
}

// Animation loop for the LFO
function lfoAnimationLoop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  
  // Calculate delta time in seconds
  const deltaTime = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;
  
  // Update LFO
  const currentValue = lfo.update(deltaTime);
  
  // Update history array (shift values to the left and add new value at the end)
  lfoHistory.shift();
  lfoHistory.push(currentValue);
  
  // Update display
  lfoCurrentValue.textContent = currentValue.toFixed(3);
  drawLfoVisualization();
  
  // Send to MIDI if enabled
  if (sendLfoToMidi) {
    const ccValue = Math.round(currentValue * 127); // Scale to 0-127 MIDI range
    const ccNumber = parseInt(lfoCcNumberSelect.value);
    
    midiBus.controlChange({ 
      channel: 1,
      controller: ccNumber,
      value: Math.min(127, Math.max(0, ccValue)) // Ensure within MIDI range
    });
  }
  
  // Continue animation
  animationFrameId = requestAnimationFrame(lfoAnimationLoop);
}

// Start LFO animation
function startLfoAnimation() {
  if (!animationFrameId) {
    lastFrameTime = 0;
    animationFrameId = requestAnimationFrame(lfoAnimationLoop);
  }
}

// Stop LFO animation
function stopLfoAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// Setup LFO event listeners
function setupLfoControls() {
  // Frequency slider
  lfoFrequencySlider.addEventListener('input', updateLfoParameters);
  
  // Amplitude slider
  lfoAmplitudeSlider.addEventListener('input', updateLfoParameters);
  
  // Offset slider
  lfoOffsetSlider.addEventListener('input', updateLfoParameters);
  
  // Shape select
  lfoShapeSelect.addEventListener('change', updateLfoParameters);
  
  // MIDI CC checkbox
  lfoToMidiCheckbox.addEventListener('change', () => {
    sendLfoToMidi = lfoToMidiCheckbox.checked;
    logEvent('lfoToMidi', { enabled: sendLfoToMidi, cc: lfoCcNumberSelect.value });
  });
  
  // CC Number select
  lfoCcNumberSelect.addEventListener('change', () => {
    if (sendLfoToMidi) {
      logEvent('lfoMidiCcChanged', { cc: lfoCcNumberSelect.value });
    }
  });
}

// Initialize when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize MIDI and setup UI elements
  initMidi();
  
  // Setup transport listeners
  setupTransportListeners();
  
  // Set initial states
  transportStatusEl.textContent = 'Stopped';
  transportStatusEl.className = 'stopped';
  patternSendingStatusEl.textContent = 'Disabled';
  patternSendingStatusEl.className = 'disabled';
  
  // Initialize pattern visualization
  updatePatternVisualization(patternA);
  
  // Setup LFO controls
  setupLfoControls();
  
  // Start LFO animation
  startLfoAnimation();
  
  // Example usage code in console
  console.log('LFO Example Usage:');
  console.log(`
import { LFO } from './lfo.js';

// Create an LFO with 2 cycles/second, amplitude = 0.5, offset = 0.5, sine shape
const lfo = new LFO({ frequency: 2, amplitude: 0.5, offset: 0.5, shape: 'sine' });

// Suppose we call update every 1/60th of a second in a render loop
const deltaTime = 1/60;
const currentValue = lfo.update(deltaTime);
console.log('Current LFO value:', currentValue); 
// ~ 0..1 range because amplitude=0.5, offset=0.5
`);
});