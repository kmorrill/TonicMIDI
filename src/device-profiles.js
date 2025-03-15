// device-profiles.js
import { OpXyDevice } from "./devices/op-xy.js";
import { OpZDevice } from "./devices/op-z.js";
import { PolyendSynthDevice } from "./devices/polyend-synth.js";
// ... or more

export const KNOWN_DEVICE_PROFILES = {
  "op-xy": OpXyDevice, // each has .profileName = "OP-XY"
  "op-z": OpZDevice,
  "polyend-synth": PolyendSynthDevice,
  // ... etc.
};

// Simple helper that tries to match by substring or exact name
export function findProfileClassForMidiName(midiDeviceName) {
  if (!midiDeviceName || typeof midiDeviceName !== "string") {
    return null; // fallback or early return
  }
  const lowerName = midiDeviceName.toLowerCase();

  for (const [key, ProfClass] of Object.entries(KNOWN_DEVICE_PROFILES)) {
    const profName = ProfClass.profileName.toLowerCase();
    if (lowerName.includes(profName)) {
      return ProfClass;
    }
  }

  return null;
}
