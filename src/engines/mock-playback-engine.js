/**
 * src/engines/mock-playback-engine.js
 *
 * Mock Playback Engine:
 * - Subscribes to the MIDI Bus for noteOn, noteOff, controlChange, etc.
 * - Logs (stores) each event in an internal array: this.events
 * - Useful for unit tests or debugging, because it doesn't require real MIDI hardware.
 * - For tests, requires the TransportManager to add step data to the events
 */

export class MockPlaybackEngine {
  /**
   * @param {MidiBus} midiBus - The shared MIDI Bus instance.
   */
  constructor(midiBus) {
    this.midiBus = midiBus;

    // Stores all received events in memory for inspection.
    this.events = [];

    // Subscribe to the MIDI Bus events you want to handle.
    this.midiBus.on("noteOn", (data) => this.handleNoteOn(data));
    this.midiBus.on("noteOff", (data) => this.handleNoteOff(data));
    this.midiBus.on("controlChange", (data) => this.handleControlChange(data));

    // (Optional) Subscribe to other events if your system emits them:
    this.midiBus.on("pitchBend", (data) => this.handlePitchBend(data));
    this.midiBus.on("programChange", (data) => this.handleProgramChange(data));
    this.midiBus.on("aftertouch", (data) => this.handleAftertouch(data));
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.note
   * @param {number} data.velocity
   * @param {string|null} [data.outputId=null] // <-- added
   */
  handleNoteOn({ channel, note, velocity, outputId = null, step }) {
    // <-- added outputId and step
    this.events.push({
      type: "noteOn",
      data: { channel, note, velocity, outputId, step }, // <-- store outputId and step
    });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.note
   * @param {string|null} [data.outputId=null] // <-- added
   */
  handleNoteOff({ channel, note, outputId = null, step }) {
    // <-- added outputId and step
    this.events.push({
      type: "noteOff",
      data: { channel, note, outputId, step }, // <-- store outputId and step
    });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.cc
   * @param {number} data.value
   * @param {string|null} [data.outputId=null] // <-- added
   */
  handleControlChange({ channel, cc, value, outputId = null, step }) {
    // <-- added outputId and step
    this.events.push({
      type: "controlChange",
      data: { channel, cc, value, outputId, step }, // <-- store outputId and step
    });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.value
   * @param {string|null} [data.outputId=null] // <-- added
   */
  handlePitchBend({ channel, value, outputId = null, step }) {
    // <-- added outputId and step
    this.events.push({
      type: "pitchBend",
      data: { channel, value, outputId, step }, // <-- store outputId and step
    });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.program
   * @param {string|null} [data.outputId=null] // <-- added
   */
  handleProgramChange({ channel, program, outputId = null, step }) {
    // <-- added outputId and step
    this.events.push({
      type: "programChange",
      data: { channel, program, outputId, step }, // <-- store outputId and step
    });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.pressure
   * @param {string|null} [data.outputId=null] // <-- added
   */
  handleAftertouch({ channel, pressure, outputId = null, step }) {
    // <-- added outputId and step
    this.events.push({
      type: "aftertouch",
      data: { channel, pressure, outputId, step }, // <-- store outputId and step
    });
  }

  /**
   * Clears the internal event log.
   * Useful to reset state in tests.
   */
  clearEvents() {
    this.events = [];
  }

  /**
   * Utility to retrieve all logged events (if needed).
   */
  getEvents() {
    return this.events;
  }
}
