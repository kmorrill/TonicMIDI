// harmony-demo.js
import { MidiBus } from '../src/midi-bus.js';
import { ChordManager } from '../src/chord-manager.js';
import { ChordPattern } from '../src/patterns/chord-pattern.js';
import { ExplicitNotePattern } from '../src/patterns/explicit-note-pattern.js';
import { LiveLoop } from '../src/live-loop.js';
import { TransportManager } from '../src/transport/transport-manager.js';
import { RealPlaybackEngine } from '../src/engines/real-playback-engine.js';

// Initialize MidiBus and PlaybackEngine
const midiBus = new MidiBus();

// Create a custom method on the MidiBus to handle raw MIDI messages
midiBus.midiMessage = (message) => {
  // Emit the message to all subscribers
  midiBus.emit('midiMessage', message);
};

// Setup UI references
const midiOutputSelect = document.getElementById('midi-output-select');
const transportStatus = document.getElementById('transport-status');

const chordProgressionSelect = document.getElementById('chord-progression');
const chordVoicingSelect = document.getElementById('chord-voicing');
const chordOctaveSelect = document.getElementById('chord-octave');
const chordChannelInput = document.getElementById('chord-channel');
const chordVisualization = document.getElementById('chord-visualization');
const currentChordDisplay = document.getElementById('current-chord');

const melodyStyleSelect = document.getElementById('melody-style');
const melodyOctaveSelect = document.getElementById('melody-octave');
const melodyChannelInput = document.getElementById('melody-channel');
const melodyVisualization = document.getElementById('melody-visualization');

const loopPatternSelect = document.getElementById('loop-pattern');
const loopChannelInput = document.getElementById('loop-channel');
const loopVisualization = document.getElementById('loop-visualization');

const midiLog = document.getElementById('midi-log');

// Initialize visualizations (16 steps each)
initializeVisualization(chordVisualization, 16);
initializeVisualization(melodyVisualization, 16);
initializeVisualization(loopVisualization, 16);

// Define chord progressions
const chordProgressions = {
  'simple': [
    { root: 'C', type: 'maj7' },
    { root: 'F', type: 'maj7' }
  ],
  'pop': [
    { root: 'C', type: 'maj' },
    { root: 'G', type: 'maj' },
    { root: 'A', type: 'min' },
    { root: 'F', type: 'maj' }
  ],
  'jazz': [
    { root: 'C', type: 'maj7' },
    { root: 'D', type: 'min7' },
    { root: 'G', type: '7' },
    { root: 'C', type: 'maj7' }
  ],
  'tension': [
    { root: 'C', type: 'maj7' },
    { root: 'D', type: '7#11' },
    { root: 'Eb', type: 'maj7#5' },
    { root: 'G', type: '7b9' }
  ]
};

// Drum MIDI note mapping constants for OP-1 Field device
const DRUMS = {
  KICK: "53",
  KICK_ALT: "54",
  SNARE: "55",
  SNARE_ALT: "56",
  RIM: "57",
  CLAP: "58",
  TAMBOURINE: "59",
  SHAKER: "60",
  CLOSED_HAT: "61",
  OPEN_HAT: "62",
  PEDAL_HAT: "63",
  LOW_TOM: "65",
  CRASH: "66",
  MID_TOM: "67",
  RIDE: "68",
  HIGH_TOM: "69",
  CONGA_LOW: "71",
  CONGA_HIGH: "72",
  COWBELL: "73",
  GUIRO: "74",
  METAL: "75",
  CHI: "76",
};

// Define percussion patterns
const percussionPatterns = {
  'kick': new ExplicitNotePattern([
    { note: DRUMS.KICK, velocity: 120 }, // Kick on beat 1
    null,
    { note: DRUMS.KICK, velocity: 80 },  // Lighter kick on beat 2
    null,
    { note: DRUMS.KICK, velocity: 100 }, // Kick on beat 3
    null,
    null,
    null,
    { note: DRUMS.KICK, velocity: 120 }, // Kick on beat 1 again
    null,
    null,
    null,
    { note: DRUMS.KICK, velocity: 100 }, // Kick on beat 3 again
    null,
    { note: DRUMS.KICK, velocity: 80 },  // Lighter kick before beat 1
    null,
  ]),
  'hihat': new ExplicitNotePattern([
    { note: DRUMS.CLOSED_HAT, velocity: 100 }, // Closed hi-hat
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
    { note: DRUMS.CLOSED_HAT, velocity: 90 },
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
    { note: DRUMS.CLOSED_HAT, velocity: 100 },
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
    { note: DRUMS.CLOSED_HAT, velocity: 90 },
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
    { note: DRUMS.CLOSED_HAT, velocity: 100 },
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
    { note: DRUMS.CLOSED_HAT, velocity: 90 },
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
    { note: DRUMS.OPEN_HAT, velocity: 100 },
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
    { note: DRUMS.CLOSED_HAT, velocity: 90 },
    { note: DRUMS.CLOSED_HAT, velocity: 60 },
  ]),
  'percussion': new ExplicitNotePattern([
    { note: DRUMS.KICK, velocity: 100 }, // Kick
    null,
    { note: DRUMS.SNARE, velocity: 80 },  // Snare
    null,
    { note: DRUMS.KICK, velocity: 90 },  // Kick
    null,
    { note: DRUMS.SNARE, velocity: 80 },  // Snare
    null,
    { note: DRUMS.KICK, velocity: 100 }, // Kick
    null,
    { note: DRUMS.SNARE, velocity: 80 },  // Snare
    null,
    { note: DRUMS.KICK, velocity: 90 },  // Kick
    { note: DRUMS.RIM, velocity: 60 },   // Rim (ghost)
    { note: DRUMS.SNARE, velocity: 100 }, // Snare
    { note: DRUMS.COWBELL, velocity: 80 }, // Cowbell
  ])
};

// Initialize ChordManager with default progression
const chordManager = new ChordManager({
  progression: chordProgressions['simple'],
  tensionLevel: 'none'
});

// Create global context for patterns
const globalContext = {
  chordManager: chordManager,
  additionalContext: {}
};

// Initialize patterns with safe default values
const chordPattern = new ChordPattern({
  length: 16,
  voicingType: 'close',
  octave: parseInt(chordOctaveSelect.value || 4, 10) || 4
});

// Create a melody pattern that follows the chord
class HarmonizedMelodyPattern {
  constructor({ 
    length = 16, 
    style = 'arpeggio', 
    octave = 5,
    harmonize = false
  }) {
    this.length = length;
    this.style = style;
    this.octave = octave;
    this.harmonize = harmonize;
    
    // Create arpeggio patterns
    this.arpeggioPatterns = {
      'up': [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 1],
      'down': [3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0],
      'updown': [0, 1, 2, 3, 2, 1, 0, -1, 0, 1, 2, 3, 2, 1, 0, -1]
    };
    
    // Current arpeggio type
    this.arpeggioType = 'up';
  }
  
  getLength() {
    return this.length;
  }
  
  getNotes(stepIndex, context) {
    if (!context || !context.chordManager) {
      // Return empty to avoid errors
      return [];
    }
    
    const { chordManager } = context;
    const chord = chordManager.getChord(stepIndex);
    
    if (!chord) {
      // Return empty to avoid errors
      return [];
    }
    
    try {
      // Base velocity with some variation
      const velocity = 80 + Math.floor(Math.random() * 20);
      
      // Get chord intervals based on chord type
      const intervals = this._getIntervalsForChordType(chord.type || 'maj');
      
      // Choose style
      switch(this.style) {
        case 'arpeggio':
          return this._generateArpeggio(chord, intervals, stepIndex, velocity);
        case 'scale':
          return this._generateScaleRun(chord, intervals, stepIndex, velocity);
        case 'harmonized':
          return this._generateHarmonizedMelody(chord, intervals, stepIndex, velocity);
        default:
          return this._generateArpeggio(chord, intervals, stepIndex, velocity);
      }
    } catch (err) {
      console.warn('Error generating melody notes:', err);
      // Return empty instead of erroring
      return [];
    }
  }
  
  _generateArpeggio(chord, intervals, stepIndex, velocity) {
    try {
      const pattern = this.arpeggioPatterns[this.arpeggioType || 'up'];
      const patternIndex = stepIndex % pattern.length;
      const arpeggioIndex = pattern[patternIndex];
      
      // Skip this step if arpeggioIndex is -1 (rest)
      if (arpeggioIndex < 0) return [];
      
      if (!chord || !chord.root) {
        // Avoid errors with invalid chords
        return [];
      }
      
      // Get the root note
      const rootMidi = this._getNoteNumber(chord.root, this.octave);
      
      // Get the arpeggio note
      const interval = intervals[arpeggioIndex % intervals.length];
      const noteMidi = rootMidi + interval;
      
      if (isNaN(noteMidi)) {
        // Avoid NaN errors
        return [];
      }
      
      // Create melody note - convert to string to avoid LiveLoop conversion issue
      const notes = [{ 
        note: String(noteMidi), 
        velocity 
      }];
      
      // If harmonized, add a note a third above
      if (this.harmonize) {
        // Find the next note in the chord (typically a third)
        const harmonizedInterval = intervals[(arpeggioIndex + 2) % intervals.length];
        const harmonizedNote = rootMidi + harmonizedInterval;
        
        if (!isNaN(harmonizedNote)) {
          notes.push({
            note: String(harmonizedNote),
            velocity: Math.max(60, velocity - 20) // Slightly quieter
          });
        }
      }
      
      return notes;
    } catch (err) {
      console.warn('Error in _generateArpeggio:', err);
      return [];
    }
  }
  
  _generateScaleRun(chord, intervals, stepIndex, velocity) {
    try {
      if (!chord || !chord.root || !chord.type) {
        // Avoid errors with invalid chords
        return [];
      }
      
      // Define scale based on chord root (assuming major/minor)
      const isMinor = chord.type.includes('min');
      const scale = isMinor ? 
        [0, 2, 3, 5, 7, 8, 10, 12, 10, 8, 7, 5, 3, 2, 0] : // Minor scale (descending)
        [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0];  // Major scale (descending)
      
      const scaleIndex = stepIndex % scale.length;
      
      // Get the root note
      const rootMidi = this._getNoteNumber(chord.root, this.octave);
      
      if (isNaN(rootMidi)) {
        // Avoid NaN errors
        return [];
      }
      
      // Get the scale note
      const noteMidi = rootMidi + scale[scaleIndex];
      
      if (isNaN(noteMidi)) {
        // Avoid NaN errors
        return [];
      }
      
      // Create melody note - convert to string to avoid LiveLoop conversion issue
      const notes = [{ 
        note: String(noteMidi), 
        velocity 
      }];
      
      // If harmonized, add a note a third above in the scale
      if (this.harmonize) {
        const thirdInScaleIndex = (scaleIndex + 2) % scale.length;
        const thirdInScale = rootMidi + scale[thirdInScaleIndex];
        
        if (!isNaN(thirdInScale)) {
          notes.push({
            note: String(thirdInScale),
            velocity: Math.max(60, velocity - 20)
          });
        }
      }
      
      return notes;
    } catch (err) {
      console.warn('Error in _generateScaleRun:', err);
      return [];
    }
  }
  
  _generateHarmonizedMelody(chord, intervals, stepIndex, velocity) {
    try {
      // Always harmonize for this style
      const oldHarmonize = this.harmonize;
      this.harmonize = true;
      
      // Use the arpeggio method but always harmonize
      const result = this._generateArpeggio(chord, intervals, stepIndex, velocity);
      
      // Restore previous harmonize setting
      this.harmonize = oldHarmonize;
      
      return result;
    } catch (err) {
      console.warn('Error in _generateHarmonizedMelody:', err);
      return [];
    }
  }
  
  // The following helper methods match those in ChordPattern
  _getIntervalsForChordType(chordType) {
    const chordIntervals = {
      // Triads
      "maj": [0, 4, 7],
      "min": [0, 3, 7],
      "dim": [0, 3, 6],
      "aug": [0, 4, 8],
      "sus4": [0, 5, 7],
      "sus2": [0, 2, 7],
      
      // Seventh chords
      "maj7": [0, 4, 7, 11],
      "min7": [0, 3, 7, 10],
      "7": [0, 4, 7, 10],
      "dim7": [0, 3, 6, 9],
      "min7b5": [0, 3, 6, 10],
      "aug7": [0, 4, 8, 10],
      
      // Extended chords
      "9": [0, 4, 7, 10, 14],
      "maj9": [0, 4, 7, 11, 14],
      "min9": [0, 3, 7, 10, 14],
      
      // Tension chords
      "7#9": [0, 4, 7, 10, 15],
      "7b9": [0, 4, 7, 10, 13],
      "7#11": [0, 4, 7, 10, 18],
      "maj7#11": [0, 4, 7, 11, 18],
      "maj7#5": [0, 4, 8, 11],
      "min7b9": [0, 3, 7, 10, 13],
      
      // Added tone chords
      "maj6": [0, 4, 7, 9],
      "min6": [0, 3, 7, 9]
    };
    
    return chordIntervals[chordType] || chordIntervals["maj"];
  }
  
  _getNoteNumber(noteName, octave) {
    try {
      if (!noteName) {
        console.warn('Invalid note name (undefined/null)');
        return 60; // Default to middle C
      }

      const noteMap = {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 
        'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
      };
      
      // Extract the note name
      const noteBase = noteName.charAt(0).toUpperCase();
      const hasAccidental = noteName.length > 1;
      const accidental = hasAccidental ? noteName.substring(1) : '';
      
      const fullNoteName = noteBase + accidental;
      const noteValue = noteMap[fullNoteName];
      
      if (noteValue === undefined) {
        console.warn(`Unknown note: ${noteName}. Defaulting to C.`);
        return (octave + 1) * 12; // Default to C at the given octave
      }
      
      return (octave + 1) * 12 + noteValue;
    } catch (err) {
      console.warn('Error in _getNoteNumber:', err);
      return 60; // Default to middle C
    }
  }
}

// Create a pattern that properly filters out null notes
class SafePatternWrapper {
  constructor(pattern) {
    this.pattern = pattern;
  }
  
  getLength() {
    return this.pattern.getLength ? this.pattern.getLength() : 16;
  }
  
  getNotes(stepIndex, context) {
    try {
      const notes = this.pattern.getNotes(stepIndex, context);
      // Filter out any null or undefined notes or notes without a note property
      return Array.isArray(notes) ? notes.filter(note => note && note.note) : [];
    } catch (err) {
      console.warn('Error in SafePatternWrapper.getNotes:', err);
      return [];
    }
  }
}

// Create melody pattern with safe default values
const melodyPattern = new HarmonizedMelodyPattern({
  length: 16,
  style: melodyStyleSelect.value || 'arpeggio',
  octave: parseInt(melodyOctaveSelect.value || 5, 10) || 5,
  harmonize: melodyStyleSelect.value === 'harmonized'
});

// Initialize live loops with safe default values and pattern wrappers
const chordLoop = new LiveLoop(midiBus, {
  pattern: new SafePatternWrapper(chordPattern),
  midiChannel: parseInt(chordChannelInput.value || 8, 10) || 8,
  globalContext: globalContext,
  name: 'Chord'
});

const melodyLoop = new LiveLoop(midiBus, {
  pattern: new SafePatternWrapper(melodyPattern),
  midiChannel: parseInt(melodyChannelInput.value || 5, 10) || 5,
  globalContext: globalContext,
  name: 'Melody'
});

// Wrap the percussion pattern with our safe wrapper
const rhythmLoop = new LiveLoop(midiBus, {
  pattern: new SafePatternWrapper(percussionPatterns[loopPatternSelect.value || 'kick']),
  midiChannel: parseInt(loopChannelInput.value || 1, 10) || 1,
  name: 'Rhythm'
});

// Initialize the transport manager
const transportManager = new TransportManager(midiBus, {
  liveLoops: [chordLoop, melodyLoop, rhythmLoop],
  pulsesPerStep: 6, // 24 PPQN / 4 = 6 pulses per 16th note
  highResolution: true
});

// Set up MIDI output handling
let midiOutput = null;
let midiAccess = null;

// Function to update the chord display
function updateCurrentChordDisplay(stepIndex) {
  const chord = chordManager.getChord(stepIndex);
  if (chord) {
    currentChordDisplay.textContent = `${chord.root} ${chord.type}`;
  }
}

// Initialize WebMIDI
async function initMIDI() {
  try {
    // Request MIDI access with sysex enabled to ensure we get all MIDI messages
    midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    
    // Add all available MIDI outputs to the select dropdown
    for (const output of midiAccess.outputs.values()) {
      const option = document.createElement('option');
      option.value = output.id;
      option.textContent = output.name;
      midiOutputSelect.appendChild(option);
    }
    
    // Listen for MIDI output selection
    midiOutputSelect.addEventListener('change', () => {
      const selectedOutputId = midiOutputSelect.value;
      if (selectedOutputId) {
        midiOutput = midiAccess.outputs.get(selectedOutputId);
        logEvent('MIDI Output selected', midiOutput.name);
      } else {
        midiOutput = null;
      }
    });
    
    // Set up direct handling of MIDI input for transport messages
    const handleExternalMIDI = (midiInput) => {
      midiInput.onmidimessage = (event) => {
        // Forward the message to our MidiBus
        midiBus.midiMessage(event);
      };
    };
    
    // Set up all available MIDI inputs to receive messages
    for (const input of midiAccess.inputs.values()) {
      handleExternalMIDI(input);
      logEvent('MIDI Input', `Listening on ${input.name}`);
    }
    
    // Listen for new/disconnected MIDI devices
    midiAccess.onstatechange = (event) => {
      const port = event.port;
      if (port.type === 'input' && port.state === 'connected') {
        handleExternalMIDI(port);
        logEvent('MIDI Input', `Connected: ${port.name}`);
      }
    };
    
    // Set up MIDI message forwarding
    setupMIDIForwarding();
    
    // Listen for statechange events to handle reconnected devices
    midiAccess.addEventListener('statechange', (event) => {
      logEvent('MIDI Device', `${event.port.name} ${event.port.state}`);
    });
  } catch (err) {
    console.error('WebMIDI not supported or access denied:', err);
    logEvent('Error', 'WebMIDI not supported or access denied');
  }
}

// Set up MIDI message forwarding
function setupMIDIForwarding() {
  // Handle noteOn
  midiBus.on('noteOn', (data) => {
    if (midiOutput) {
      midiOutput.send([0x90 + (data.channel - 1), data.note, data.velocity]);
    }
    logEvent('noteOn', `Ch:${data.channel} Note:${data.note} Vel:${data.velocity}`);
    
    // Update visualizations
    updateVisualization(data.channel);
  });
  
  // Handle noteOff
  midiBus.on('noteOff', (data) => {
    if (midiOutput) {
      midiOutput.send([0x80 + (data.channel - 1), data.note, 0]);
    }
    logEvent('noteOff', `Ch:${data.channel} Note:${data.note}`);
  });
  
  // Handle controlChange
  midiBus.on('controlChange', (data) => {
    if (midiOutput) {
      midiOutput.send([0xB0 + (data.channel - 1), data.cc, data.value]);
    }
    logEvent('controlChange', `Ch:${data.channel} CC:${data.cc} Val:${data.value}`);
  });
  
  // Transport and timing events
  // Note: These are now handled by the RealPlaybackEngine
  
  // We'll use the midiBus directly for transport handling since 
  // RealPlaybackEngine doesn't have its own event system
  
  // Add manual handling for transport messages
  midiBus.on('midiMessage', (message) => {
    if (!message || !message.data) return;
    
    const statusByte = message.data[0];
    
    // Handle transport messages and forward to transport manager
    if (statusByte === 0xfa) { // Start
      logEvent('Transport', 'START message received');
      transportManager._onStart();
      updateTransportStatus(true);
    } else if (statusByte === 0xfc) { // Stop  
      logEvent('Transport', 'STOP message received');
      transportManager._onStop();
      updateTransportStatus(false);
    } else if (statusByte === 0xfb) { // Continue
      logEvent('Transport', 'CONTINUE message received');
      transportManager._onStart(); // Continue acts like start
      updateTransportStatus(true);
    } else if (statusByte === 0xf8) { // Clock pulse
      transportManager._onClockPulse();
      // We don't log these to avoid flooding the log
    } else if (statusByte === 0xf2) { // Song position pointer
      logEvent('Transport', 'SONG POSITION message received');
      // Optional: handle song position pointer if needed
    }
  });
}

// Initialize visualizations
function initializeVisualization(container, steps) {
  for (let i = 0; i < steps; i++) {
    const stepEl = document.createElement('div');
    stepEl.className = 'step';
    stepEl.textContent = i + 1;
    container.appendChild(stepEl);
  }
}

// Update transport status UI
function updateTransportStatus(isRunning) {
  if (isRunning) {
    transportStatus.textContent = 'Running';
    transportStatus.className = 'transport-status running';
  } else {
    transportStatus.textContent = 'Stopped';
    transportStatus.className = 'transport-status stopped';
  }
}

// Update the pattern visualization
function updateVisualization(channel) {
  // Find which visualization corresponds to the channel
  let visualization;
  let stepIndex;
  
  if (channel === parseInt(chordChannelInput.value, 10)) {
    visualization = chordVisualization;
    stepIndex = Math.floor(transportManager.stepIndex % 16);
    updateCurrentChordDisplay(transportManager.stepIndex);
  } else if (channel === parseInt(melodyChannelInput.value, 10)) {
    visualization = melodyVisualization;
    stepIndex = Math.floor(transportManager.stepIndex % 16);
  } else if (channel === parseInt(loopChannelInput.value, 10)) {
    visualization = loopVisualization;
    stepIndex = Math.floor(transportManager.stepIndex % 16);
  } else {
    return; // No matching visualization for this channel
  }
  
  // Update visualization - remove previous active class and add to current step
  const steps = visualization.querySelectorAll('.step');
  steps.forEach((step, i) => {
    if (i === stepIndex) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });
}

// Log MIDI events to the UI
function logEvent(type, message) {
  const p = document.createElement('p');
  p.textContent = `[${type}] ${message}`;
  midiLog.appendChild(p);
  midiLog.scrollTop = midiLog.scrollHeight;
  
  // Limit log entries
  while (midiLog.childElementCount > 100) {
    midiLog.removeChild(midiLog.firstChild);
  }
}

// Set up event listeners for UI controls
function setupUIEventListeners() {
  
  // Chord progression select
  chordProgressionSelect.addEventListener('change', () => {
    const value = chordProgressionSelect.value;
    chordManager.setProgression(chordProgressions[value]);
    logEvent('Chord Progression', value);
  });
  
  // Chord voicing select
  chordVoicingSelect.addEventListener('change', () => {
    const value = chordVoicingSelect.value;
    chordPattern.setVoicingType(value);
    logEvent('Chord Voicing', value);
  });
  
  // Chord octave select
  chordOctaveSelect.addEventListener('change', () => {
    const octave = parseInt(chordOctaveSelect.value, 10);
    // Create a new chord pattern with updated octave
    const newChordPattern = new ChordPattern({
      length: 16,
      voicingType: chordVoicingSelect.value,
      octave: octave
    });
    
    // Update the chord loop
    chordLoop.setPattern(newChordPattern, true);
    logEvent('Chord Octave', octave);
  });
  
  // Chord channel input
  chordChannelInput.addEventListener('change', () => {
    const channel = parseInt(chordChannelInput.value, 10);
    if (channel >= 1 && channel <= 16) {
      chordLoop.midiChannel = channel;
      logEvent('Chord Channel', channel);
    }
  });
  
  // Melody style select
  melodyStyleSelect.addEventListener('change', () => {
    const style = melodyStyleSelect.value;
    // Create a new melody pattern with updated style
    const newMelodyPattern = new HarmonizedMelodyPattern({
      length: 16,
      style: style,
      octave: parseInt(melodyOctaveSelect.value, 10),
      harmonize: style === 'harmonized'
    });
    
    // Update the melody loop
    melodyLoop.setPattern(newMelodyPattern, true);
    logEvent('Melody Style', style);
  });
  
  // Melody octave select
  melodyOctaveSelect.addEventListener('change', () => {
    const octave = parseInt(melodyOctaveSelect.value, 10);
    // Create a new melody pattern with updated octave
    const newMelodyPattern = new HarmonizedMelodyPattern({
      length: 16,
      style: melodyStyleSelect.value,
      octave: octave,
      harmonize: melodyStyleSelect.value === 'harmonized'
    });
    
    // Update the melody loop
    melodyLoop.setPattern(newMelodyPattern, true);
    logEvent('Melody Octave', octave);
  });
  
  // Melody channel input
  melodyChannelInput.addEventListener('change', () => {
    const channel = parseInt(melodyChannelInput.value, 10);
    if (channel >= 1 && channel <= 16) {
      melodyLoop.midiChannel = channel;
      logEvent('Melody Channel', channel);
    }
  });
  
  // Loop pattern select
  loopPatternSelect.addEventListener('change', () => {
    const pattern = loopPatternSelect.value;
    // Make sure to wrap the new pattern with SafePatternWrapper
    rhythmLoop.setPattern(new SafePatternWrapper(percussionPatterns[pattern] || percussionPatterns['kick']), true);
    logEvent('Loop Pattern', pattern);
  });
  
  // Loop channel input
  loopChannelInput.addEventListener('change', () => {
    const channel = parseInt(loopChannelInput.value, 10);
    if (channel >= 1 && channel <= 16) {
      rhythmLoop.midiChannel = channel;
      logEvent('Loop Channel', channel);
    }
  });
}

// Initialize the app
async function init() {
  await initMIDI();
  setupUIEventListeners();
  
  // The event listeners for transport are already set up in setupMIDIForwarding()
  logEvent('Transport', 'Ready to receive external MIDI transport messages');
  
  // Log startup
  logEvent('App', 'Harmony Demo initialized');
  logEvent('Transport', 'Ready, waiting for external MIDI transport signals');
  
  // Periodically update the visualization to show current step
  setInterval(() => {
    if (transportManager.isRunning) {
      const stepIndex = Math.floor(transportManager.stepIndex % 16);
      updateCurrentChordDisplay(transportManager.stepIndex);
      
      // Update all visualizations
      updateAllVisualizations(stepIndex);
    }
  }, 50); // Update 20 times per second for smooth visualization
}

// Helper to update all visualizations
function updateAllVisualizations(stepIndex) {
  const allVisualizations = [
    chordVisualization,
    melodyVisualization,
    loopVisualization
  ];
  
  allVisualizations.forEach(visualization => {
    const steps = visualization.querySelectorAll('.step');
    steps.forEach((step, i) => {
      if (i === stepIndex) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
  });
}

// Start the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);