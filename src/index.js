// Exporting public API
export { MidiBus } from "./midi-bus.js";
export { RealPlaybackEngine } from "./engines/real-playback-engine.js";
export { MockPlaybackEngine } from "./engines/mock-playback-engine.js";
export { LiveLoop } from "./live-loop.js";
export { EnergyManager } from "./energy-manager.js";
export { TransportManager } from "./transport/transport-manager.js";

// New exports for harmonic and rhythmic context
export { ChordManager } from "./chord-manager.js";
export { RhythmManager } from "./rhythm-manager.js";
export { GlobalContext } from "./global-context.js";

// Correcting the export statement for patterns
export * from "./patterns/drum-pattern.js";
export * from "./patterns/chance-step-arp.js";
export * from "./patterns/syncopated-bass.js";
export * from "./patterns/chord-pattern.js";
export * from "./patterns/explicit-note-pattern.js";
export * from "./patterns/contour-melody-pattern.js";
export * from "./patterns/chord-pattern.js";

// Exporting LFO module
export { LFO } from "./lfo.js";

// These exports will be implemented as the project progresses
