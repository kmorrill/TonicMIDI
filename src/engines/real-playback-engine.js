/**
 * src/engines/real-playback-engine.js
 *
 * RealPlaybackEngine (Web MIDI version):
 * - Subscribes to MIDI Bus for noteOn, noteOff, controlChange, etc.
 * - Sends these messages to connected MIDI output devices via the Web MIDI API.
 *
 * Usage (in a browser context):
 *   const engine = new RealPlaybackEngine(midiBus);
 *   await engine.init(); // request MIDI access and store outputs
 *   // ... domain logic calls midiBus.noteOn(...), etc.
 */

export class RealPlaybackEngine {
  constructor(midiBus) {
    this.midiBus = midiBus;
    this.midiOutputs = []; // array of Web MIDI output devices

    // Subscribe to the MIDI Bus events:
    this.midiBus.on("noteOn", (data) => this.handleNoteOn(data));
    this.midiBus.on("noteOff", (data) => this.handleNoteOff(data));
    this.midiBus.on("controlChange", (data) => this.handleControlChange(data));
    this.midiBus.on("pitchBend", (data) => this.handlePitchBend(data));
    this.midiBus.on("programChange", (data) => this.handleProgramChange(data));
    this.midiBus.on("aftertouch", (data) => this.handleAftertouch(data));
  }

  /**
   * Initialize the Web MIDI outputs.
   * - Requests MIDI access (sysex disabled by default).
   * - Gathers all available MIDI output ports.
   * - You might want to prompt the user to select a specific device later.
   * @returns {Promise<void>}
   */
  async init() {
    try {
      // Request MIDI access from the browser
      const midiAccess = await navigator.requestMIDIAccess({ sysex: false });

      // Get all outputs
      const outputs = Array.from(midiAccess.outputs.values());
      if (outputs.length === 0) {
        console.warn("RealPlaybackEngine: No MIDI outputs found.");
      } else {
        this.midiOutputs = outputs;
        console.log(
          "RealPlaybackEngine: MIDI outputs ready.",
          this.midiOutputs
        );
      }
    } catch (err) {
      console.error("RealPlaybackEngine: Could not access Web MIDI API.", err);
    }
  }

  /**
   * Send a Note On message to all outputs.
   * @param {Object} data
   * @param {number} data.channel - 1-based MIDI channel
   * @param {number} data.note - 0-127
   * @param {number} data.velocity - 0-127
   */
  handleNoteOn({ channel, note, velocity = 100 }) {
    if (!this.midiOutputs.length) return; // no outputs available

    const statusByte = 0x90 + (channel - 1); // 0x90 = Note On, channel offset
    const message = [statusByte, note, velocity];

    this.midiOutputs.forEach((output) => {
      // send immediately (timestamp=0 => send now)
      output.send(message, 0);
    });
  }

  /**
   * Send a Note Off message to all outputs.
   * @param {Object} data
   * @param {number} data.channel - 1-based MIDI channel
   * @param {number} data.note - 0-127
   */
  handleNoteOff({ channel, note }) {
    if (!this.midiOutputs.length) return;

    const statusByte = 0x80 + (channel - 1); // 0x80 = Note Off, channel offset
    // velocity typically 0 for note off
    const message = [statusByte, note, 0];

    this.midiOutputs.forEach((output) => {
      output.send(message, 0);
    });
  }

  /**
   * Send a Control Change (CC) message.
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.cc - 0-127
   * @param {number} data.value - 0-127
   */
  handleControlChange({ channel, cc, value }) {
    if (!this.midiOutputs.length) return;

    // 0xB0 = CC message on channel 1 (so add channel offset)
    const statusByte = 0xb0 + (channel - 1);
    const message = [statusByte, cc, value];

    this.midiOutputs.forEach((output) => {
      output.send(message, 0);
    });
  }

  /**
   * Send a Pitch Bend message (14-bit).
   * Range: typically -8192..8191, but can vary.
   * We'll assume 0 is center, so 0 => [0x00, 0x40].
   *
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.value  - typical range: -8192..8191
   */
  handlePitchBend({ channel, value }) {
    if (!this.midiOutputs.length) return;

    // 0xE0 = Pitch Bend on channel 1
    const statusByte = 0xe0 + (channel - 1);

    // Convert value to 14-bit: center = 8192 => [LSB, MSB]
    // If value is negative, we add 8192, etc.
    const bendRange = 16384; // 14-bit
    let adjusted = value + 8192;
    if (adjusted < 0) adjusted = 0;
    if (adjusted > 16383) adjusted = 16383;

    const lsb = adjusted & 0x7f; // lower 7 bits
    const msb = (adjusted >> 7) & 0x7f; // upper 7 bits

    const message = [statusByte, lsb, msb];
    this.midiOutputs.forEach((output) => {
      output.send(message, 0);
    });
  }

  /**
   * Program Change message.
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.program - 0-127 (some hardware might treat 0 as "Program 1")
   */
  handleProgramChange({ channel, program }) {
    if (!this.midiOutputs.length) return;

    const statusByte = 0xc0 + (channel - 1);
    const message = [statusByte, program];

    this.midiOutputs.forEach((output) => {
      output.send(message, 0);
    });
  }

  /**
   * Aftertouch (channel pressure).
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.pressure - 0-127
   */
  handleAftertouch({ channel, pressure }) {
    if (!this.midiOutputs.length) return;

    // 0xD0 = Channel Pressure (Aftertouch)
    const statusByte = 0xd0 + (channel - 1);
    const message = [statusByte, pressure];

    this.midiOutputs.forEach((output) => {
      output.send(message, 0);
    });
  }
}
