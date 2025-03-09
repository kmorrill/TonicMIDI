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
   */
  handleNoteOn(data) {
    this.events.push({ type: "noteOn", data });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.note
   */
  handleNoteOff(data) {
    this.events.push({ type: "noteOff", data });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.cc
   * @param {number} data.value
   */
  handleControlChange(data) {
    this.events.push({ type: "controlChange", data });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.value
   */
  handlePitchBend(data) {
    this.events.push({ type: "pitchBend", data });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.program
   */
  handleProgramChange(data) {
    this.events.push({ type: "programChange", data });
  }

  /**
   * @param {Object} data
   * @param {number} data.channel
   * @param {number} data.pressure
   */
  handleAftertouch(data) {
    this.events.push({ type: "aftertouch", data });
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
