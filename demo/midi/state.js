// state.js
//
// A super-simple file that exports shared state as references
// so other modules can import/update them.

export const midiData = { value: null }; // the @tonejs/midi object
export const totalBars = { value: 48 }; // default
export const segments = { value: [{ startBar: 1, endBar: 48 }] };
export const currentPlayheadBar = { value: 1 };
export const transportState = { value: "Stopped" };
export const playbackTimeouts = { value: [] };
