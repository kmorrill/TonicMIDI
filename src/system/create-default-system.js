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
 *   3. Hook the first input for external clock
 *   4. Provide all MIDI outputs to the playback engine
 *   5. For each MIDI output, auto-match a device profile
 *   6. Build a TransportManager (pulsesPerStep=6 or as passed)
 *   7. Create optional global context (chordManager, energyManager, etc.)
 *
 * Returns an object containing references to all these so you can build LiveLoops.
 */
export async function createDefaultSystem({ pulsesPerStep = 6 } = {}) {
  // 1) Create the core objects:
  const midiBus = new MidiBus();
  const deviceManager = new DeviceManager();
  const playbackEngine = new RealPlaybackEngine(midiBus);

  // 2) Initialize the playback engine (requests MIDI access in the browser)
  await playbackEngine.init();

  // 3) Now get the raw MIDIAccess so we can hook up inputs/outputs manually
  const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  const inputs = Array.from(midiAccess.inputs.values());
  const outputs = Array.from(midiAccess.outputs.values());

  // 4) Use the first MIDI input (if any) for external clock
  if (inputs.length > 0) {
    console.log("Using external MIDI clock from:", inputs[0].name);
    inputs[0].onmidimessage = (evt) => {
      // Relay the MIDI message to our midiBus as "midiMessage"
      midiBus.emit("midiMessage", { data: evt.data });
    };
  } else {
    console.warn("No MIDI inputs found -> no external clock available.");
  }

  // 5) Provide ALL outputs to the playback engine
  //    so we can send events to whichever outputId we choose later.
  if (outputs.length > 0) {
    console.log("Found", outputs.length, "MIDI output(s).");
    playbackEngine.midiOutputs = outputs;
  } else {
    console.warn("No MIDI outputs found -> cannot send notes!");
  }

  // 6) Auto-map each output to a known device profile (if recognized by substring)
  for (const output of outputs) {
    const deviceName = output.name || "Unknown Device";
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

  // 7) Create the TransportManager that listens for clock pulses and manages steps
  const transport = new TransportManager(midiBus, { pulsesPerStep });

  // 8) Create some optional managers: energyManager, chordManager, globalContext
  const energyManager = new EnergyManager();
  const chordManager = new ChordManager();
  // chordManager.authorizeProvider("ColorfulChordSwellPattern"); // optionally do now

  const globalContext = new GlobalContext({ chordManager });

  // Let the energyManager see the globalContext, if it needs to
  energyManager.globalContext = globalContext;

  // 9) Return an object with references to all components
  return {
    midiBus,
    deviceManager,
    playbackEngine,
    transport,
    energyManager,
    chordManager,
    globalContext,

    // Also expose the raw outputs array so your UI can list them, etc.
    midiOutputs: outputs,
  };
}
