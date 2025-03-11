// File: src/system/create-default-system.js

import {
  MidiBus,
  RealPlaybackEngine,
  TransportManager,
  DeviceManager,
  findProfileClassForMidiName,
  EnergyManager,
  ChordManager,
  GlobalContext,
} from "../index.js"; // Adjust the relative path to your library's root

/**
 * createDefaultSystem()
 *
 * A helper that does the standard “bootstrap” tasks:
 *   1. Request Web MIDI Access
 *   2. Create a MidiBus, DeviceManager, PlaybackEngine
 *   3. Hook the first input for external clock, the first output for note sending
 *   4. For each MIDI output, auto-match a device profile
 *   5. Build a TransportManager (with pulsesPerStep=6 or whatever you like)
 *   6. Create optional global context (chordManager, energyManager, etc.)
 *
 * Returns an object containing all these references so you can quickly build your LiveLoops.
 */
export async function createDefaultSystem({ pulsesPerStep = 6 } = {}) {
  // 1) MIDI Bus + DeviceManager + RealPlaybackEngine
  const midiBus = new MidiBus();
  const deviceManager = new DeviceManager();
  const playbackEngine = new RealPlaybackEngine(midiBus);

  // 2) Initialize the playback engine (requests MIDI access)
  await playbackEngine.init();

  // 3) Now get the raw MIDIAccess again for hooking inputs/outputs
  const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  const inputs = Array.from(midiAccess.inputs.values());
  const outputs = Array.from(midiAccess.outputs.values());

  // 4) Use first MIDI input for external clock
  if (inputs.length > 0) {
    console.log("Using external MIDI clock from:", inputs[0].name);
    inputs[0].onmidimessage = (evt) => {
      // Re-emit to our bus as "midiMessage"
      midiBus.emit("midiMessage", { data: evt.data });
    };
  } else {
    console.warn("No MIDI inputs found -> no external clock available.");
  }

  // 5) Use first MIDI output for actual note sending
  if (outputs.length > 0) {
    console.log("Sending MIDI to:", outputs[0].name);
    playbackEngine.midiOutputs = [outputs[0]];
  } else {
    console.warn("No MIDI outputs found -> cannot send notes!");
  }

  // 6) Auto-map each output to a known device profile
  for (const output of outputs) {
    const deviceName = output.name;
    const ProfileClass = findProfileClassForMidiName(deviceName);
    if (ProfileClass) {
      const deviceDef = new ProfileClass();
      deviceManager.setDeviceForOutput(output.id, deviceDef);
      console.log(
        `Auto-mapped output "${deviceName}" to device profile "${ProfileClass.profileName}".`
      );
    } else {
      console.log(
        `No known profile for output "${deviceName}". Using no profile.`
      );
    }
  }

  // 7) Create the TransportManager
  const transport = new TransportManager(midiBus, { pulsesPerStep });

  // 8) Create optional managers: e.g. energyManager, chordManager, globalContext
  const energyManager = new EnergyManager();
  const chordManager = new ChordManager();
  // Optionally, authorize a chord provider ID ahead of time, or wait until a pattern does it
  // chordManager.authorizeProvider("ColorfulChordSwellPattern");

  const globalContext = new GlobalContext({
    chordManager,
    // If you have a RhythmManager, you can pass it here too
  });

  // Let energyManager see the globalContext if needed
  energyManager.globalContext = globalContext;

  // 9) Return an object with everything
  return {
    midiBus,
    deviceManager,
    playbackEngine,
    transport,
    energyManager,
    chordManager,
    globalContext,
    // Expose the outputs so user can pick e.g. outputs[0].id
    midiOutputs: outputs,
  };
}
