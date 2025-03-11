// device-profiles.js
import { OpXyDevice } from "./devices/op-xy.js";
import { OpZDevice } from "./devices/op-z.js";
// ... or more

export const KNOWN_DEVICE_PROFILES = {
  "op-xy": OpXyDevice, // each has .profileName = "OP-XY"
  "op-z": OpZDevice,
  // ... etc.
};

// Simple helper that tries to match by substring or exact name
export function findProfileClassForMidiName(midiDeviceName) {
  // e.g. if midiDeviceName = "OP-XY" or "OP-XY Something"
  // we see if "OP-XY" is in there, etc.
  const lowerName = midiDeviceName.toLowerCase();

  for (const [key, ProfClass] of Object.entries(KNOWN_DEVICE_PROFILES)) {
    const profName = ProfClass.profileName.toLowerCase();
    // You can decide if you want an exact match or partial substring
    if (lowerName.includes(profName)) {
      return ProfClass;
    }
  }
  // fallback
  return null;
}
