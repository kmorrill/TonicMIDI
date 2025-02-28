import { WebMidi } from "webmidi";
import { MidiBus, TransportManager } from "../src/index.js";

// initialize your MIDI setup here...
WebMidi.enable().then(() => {
  console.log("WebMidi enabled!");
  // MIDI logic here...
});
