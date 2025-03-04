// midiWebAccess.js

// A place to store MIDI access and output info
export let midiAccess = null;
export let currentOutput = null;

// Initialize MIDI
export function initWebMidi() {
  if (!navigator.requestMIDIAccess) {
    console.error("Web MIDI not supported in this browser.");
    return;
  }

  navigator
    .requestMIDIAccess()
    .then((access) => {
      midiAccess = access;
      // Pick the first available output for now
      for (let output of midiAccess.outputs.values()) {
        currentOutput = output;
        console.log("Using MIDI output:", output.name);
        break;
      }
      if (!currentOutput) {
        console.warn("No MIDI outputs found.");
      }
    })
    .catch((err) => {
      console.error("Failed to get MIDI access", err);
    });
}
