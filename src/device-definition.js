// device-definition.js

/**
 * @typedef {Object} SynthEngineDefinition
 * @property {string} name - The engine/track name (e.g. "OP-Z Bass", "Digitakt Track 1").
 * @property {string} type - A short label like "subtractive", "fm", "sample", etc.
 */

/**
 * Abstract base class for device definitions.
 * Subclasses should implement these methods to provide:
 *   - Drum note lookups (kick/snare → MIDI note)
 *   - CC parameter lookups (filterCutoff → CC#)
 *   - Synth engine info on each channel
 */
export class DeviceDefinition {
  /**
   * Get the MIDI note number for a named drum voice, or null if unknown.
   * @param {string} drumName - e.g. "kick", "snare", etc.
   * @returns {number|null}
   */
  getDrumNote(drumName) {
    throw new Error("getDrumNote() must be implemented by subclass.");
  }

  /**
   * Given a parameter name (normalized or custom), return its CC number or null if not supported.
   * @param {string} paramName - e.g. "filterCutoff", "ampAttack", or a custom string like "distAmount"
   * @returns {number|null}
   */
  getCC(paramName) {
    throw new Error("getCC() must be implemented by subclass.");
  }

  /**
   * Return the engine info for a particular MIDI channel (1-16).
   * @param {number} channel - MIDI channel
   * @returns {SynthEngineDefinition|null}
   */
  getSynthEngine(channel) {
    throw new Error("getSynthEngine() must be implemented by subclass.");
  }

  /**
   * Get a friendly name/string for the engine/track on the given channel (if any).
   * @param {number} channel - MIDI channel
   * @returns {string|null}
   */
  getChannelEngineName(channel) {
    throw new Error("getChannelEngineName() must be implemented by subclass.");
  }

  /**
   * List the channels that this device uses, along with an engine name for each.
   * @returns {{channel: number, engineName: string}[]}
   */
  listChannels() {
    throw new Error("listChannels() must be implemented by subclass.");
  }
}
