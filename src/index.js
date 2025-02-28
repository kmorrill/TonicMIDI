// Exporting public API
export { MidiBus } from "./midi-bus.js";
export { RealPlaybackEngine } from "./engines/real-playback-engine.js";
export { MockPlaybackEngine } from "./engines/mock-playback-engine.js";
export { ExplicitNotePattern } from "./patterns/explicit-note-pattern.js";
export { LiveLoop } from "./live-loop.js";
export { EnergyManager } from "./energy-manager.js";

// New exports for harmonic and rhythmic context
export { ChordManager } from "./chord-manager.js";
export { RhythmManager } from "./rhythm-manager.js";
export { GlobalContext } from "./global-context.js";
export { ChordPattern } from "./patterns/chord-pattern.js";

// These exports will be implemented as the project progresses
// export { TransportManager } from "./transport/TransportManager.js";
