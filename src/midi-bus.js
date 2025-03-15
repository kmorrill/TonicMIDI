// File: src/midi-bus.js
// --------------------------------------------------------------
// Updated so if outputId is null/undefined, we omit it from
// the event payload and from the activeNotes key.
// This prevents test failures that expect no "outputId" property
// and a key like "1_60" instead of "null_1_60".
// --------------------------------------------------------------

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
      midiMessage: [],
    };

    /**
     * activeNotes is a Map that tracks all currently "on" notes.
     * Key format:
     *   - If outputId is present: "outputId_channel_noteNumber"
     *   - If outputId is null/undefined: "channel_noteNumber"
     *
     * Example keys: "3dda23fa-01_1_60" or "1_60"
     */
    this.activeNotes = new Map();

    /**
     * TransportManager can set this to help track which step an event belongs to
     * (useful in testing to see which step the event was fired on).
     */
    this.currentStep = 0;
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
   * @param {string|null} [params.outputId=null] - Which MIDI output device to use (if any)
   */
  noteOn({ channel, note, velocity = 100, outputId = null }) {
    // Build the key for activeNotes.
    // If outputId is provided, key is "outputId_channel_note".
    // Otherwise just "channel_note".
    let key = `${channel}_${note}`;
    if (outputId) {
      key = `${outputId}_${key}`;
    }

    // Store active note
    this.activeNotes.set(key, { channel, note, velocity, outputId });

    // Build the event object. Omit outputId if it's null.
    const eventData = { channel, note, velocity, step: this.currentStep };
    if (outputId) {
      eventData.outputId = outputId;
    }

    // Emit event so subscribers (e.g., a playback engine) can handle it.
    this.emit("noteOn", eventData);
  }

  /**
   * Turn a note off.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.note
   * @param {string|null} [params.outputId=null]
   */
  noteOff({ channel, note, outputId = null }) {
    // Same key logic as noteOn.
    let key = `${channel}_${note}`;
    if (outputId) {
      key = `${outputId}_${key}`;
    }

    // Remove note from active list if present
    if (this.activeNotes.has(key)) {
      this.activeNotes.delete(key);
    }

    // Build event object
    const eventData = { channel, note, step: this.currentStep };
    if (outputId) {
      eventData.outputId = outputId;
    }

    // Emit event
    this.emit("noteOff", eventData);
  }

  /**
   * Send a control change (CC) message.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.cc   - CC number (0 - 127)
   * @param {number} params.value - CC value (0 - 127)
   * @param {string|null} [params.outputId=null]
   */
  controlChange({ channel, cc, value, outputId = null }) {
    const eventData = { channel, cc, value };
    if (outputId) {
      eventData.outputId = outputId;
    }
    this.emit("controlChange", eventData);
  }

  /**
   * Force all currently active notes to stop.
   * Useful when the external device sends a Stop, or in emergency to avoid stuck notes.
   */
  stopAllNotes() {
    for (const [key, noteData] of this.activeNotes.entries()) {
      // Build a noteOff event
      const eventData = {
        channel: noteData.channel,
        note: noteData.note,
      };
      if (noteData.outputId) {
        eventData.outputId = noteData.outputId;
      }

      this.emit("noteOff", eventData);
    }
    this.activeNotes.clear();
  }

  /**
   * OPTIONAL: Send a program change event.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.program - program number (0 - 127)
   * @param {string|null} [params.outputId=null]
   */
  programChange({ channel, program, outputId = null }) {
    const eventData = { channel, program };
    if (outputId) {
      eventData.outputId = outputId;
    }
    this.emit("programChange", eventData);
  }

  /**
   * OPTIONAL: Send a pitch bend event.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.value - typically from -8192 to 8191 in MIDI 14-bit,
   *                                but might map differently in your system.
   * @param {string|null} [params.outputId=null]
   */
  pitchBend({ channel, value, outputId = null }) {
    const eventData = { channel, value };
    if (outputId) {
      eventData.outputId = outputId;
    }
    this.emit("pitchBend", eventData);
  }

  /**
   * OPTIONAL: Send an aftertouch event.
   * @param {Object} params
   * @param {number} params.channel
   * @param {number} params.pressure - aftertouch value (0 - 127)
   * @param {string|null} [params.outputId=null]
   */
  aftertouch({ channel, pressure, outputId = null }) {
    const eventData = { channel, pressure };
    if (outputId) {
      eventData.outputId = outputId;
    }
    this.emit("aftertouch", eventData);
  }
}
