/**
 * src/midi-bus.js
 *
 * A central hub for MIDI events (noteOn, noteOff, controlChange, etc.).
 * Domain objects (LiveLoops, TransportManager) call these methods to emit MIDI,
 * and Playback Engines or mocks can subscribe to receive them.
 */

export class MidiBus {
  constructor() {
    // Map event names to arrays of subscriber callback functions.
    this.subscribers = {
      noteOn: [],
      noteOff: [],
      controlChange: [],
      pitchBend: [],
      programChange: [],
      aftertouch: [],
    };

    /**
     * activeNotes is a Map (or object) that tracks all currently "on" notes.
     * Key format: "channel_noteNumber" => { channel, note, velocity, etc. }
     * This helps us ensure that we can turn off all active notes (stopAllNotes) if needed.
     */
    this.activeNotes = new Map();
  }

  /**
   * Subscribe a callback to a particular event type.
   * @param {string} eventName - "noteOn", "noteOff", "controlChange", etc.
   * @param {Function} callback - function that receives the MIDI event data.
   */
  on(eventName, callback) {
    if (!this.subscribers[eventName]) {
      this.subscribers[eventName] = [];
    }
    this.subscribers[eventName].push(callback);
  }

  /**
   * Unsubscribe a previously registered callback.
   * @param {string} eventName - "noteOn", "noteOff", etc.
   * @param {Function} callback - the same callback function reference that was used in `on`.
   */
  off(eventName, callback) {
    if (!this.subscribers[eventName]) return;
    this.subscribers[eventName] = this.subscribers[eventName].filter(
      (cb) => cb !== callback
    );
  }

  /**
   * Internal helper to emit an event to all subscribers.
   * @param {string} eventName - event type name
   * @param {Object} data - payload for the event
   */
  emit(eventName, data) {
    const callbacks = this.subscribers[eventName] || [];
    callbacks.forEach((cb) => cb(data));
  }

  /**
   * Turn a note on.
   * @param {Object} params
   * @param {number} params.channel  - MIDI channel (1 - 16)
   * @param {number} params.note     - MIDI note number (0 - 127)
   * @param {number} [params.velocity=100] - MIDI velocity (0 - 127)
   */
  noteOn({ channel, note, velocity = 100 }) {
    const key = `${channel}_${note}`;
    // Record active note
    this.activeNotes.set(key, { channel, note, velocity });
    // Emit event so subscribers (e.g., a playback engine) can handle it.
    this.emit("noteOn", { channel, note, velocity });
  }

  /**
   * Turn a note off.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.note
   */
  noteOff({ channel, note }) {
    const key = `${channel}_${note}`;
    // Remove note from active list if present
    if (this.activeNotes.has(key)) {
      this.activeNotes.delete(key);
    }
    // Emit event
    this.emit("noteOff", { channel, note });
  }

  /**
   * Send a control change (CC) message.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.cc   - CC number (0 - 127)
   * @param {number} params.value - CC value (0 - 127)
   */
  controlChange({ channel, cc, value }) {
    this.emit("controlChange", { channel, cc, value });
  }

  /**
   * Force all currently active notes to stop.
   * Useful when the external device sends a Stop, or in emergency to avoid stuck notes.
   */
  stopAllNotes() {
    for (const [key, noteData] of this.activeNotes.entries()) {
      this.emit("noteOff", {
        channel: noteData.channel,
        note: noteData.note,
      });
    }
    this.activeNotes.clear();
  }

  /**
   * OPTIONAL: Send a program change event.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.program - program number (0 - 127)
   */
  programChange({ channel, program }) {
    this.emit("programChange", { channel, program });
  }

  /**
   * OPTIONAL: Send a pitch bend event.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.value - typically from -8192 to 8191 in MIDI 14-bit,
   *                                but might map differently in your system.
   */
  pitchBend({ channel, value }) {
    this.emit("pitchBend", { channel, value });
  }

  /**
   * OPTIONAL: Send an aftertouch event.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.pressure - aftertouch value (0 - 127)
   */
  aftertouch({ channel, pressure }) {
    this.emit("aftertouch", { channel, pressure });
  }
}
