/**
 * device-definition.js
 *
 * Base abstract class for all device definitions. Each subclass implements
 * (or omits) drum voices, CC parameters, and engine/channel definitions
 * as appropriate for that device.
 *
 * Standard Normalized CC Names:
 *   trackVolume, trackPan, trackMute
 *   ampAttack, ampDecay, ampSustain, ampRelease
 *   filterAttack, filterDecay, filterSustain, filterRelease
 *   filterCutoff, resonance, envAmount, keyTrackingAmount
 *
 * Everything else is considered "custom."
 */

// A handy set of standard CC param names:
export const STANDARD_CC_NAMES = new Set([
  "trackVolume",
  "trackPan",
  "trackMute",

  "ampAttack",
  "ampDecay",
  "ampSustain",
  "ampRelease",

  "filterAttack",
  "filterDecay",
  "filterSustain",
  "filterRelease",

  "filterCutoff",
  "resonance",
  "envAmount",
  "keyTrackingAmount",
]);

export class DeviceDefinition {
  constructor() {
    /**
     * Drum voices: a map of (drumName -> midiNoteNumber).
     * E.g. { kick: 36, snare: 38 }, etc.
     * If a device has no drums, keep this empty.
     * @type {Record<string,number>}
     */
    this.drumMap = {};

    /**
     * CC parameters: a map of (paramName -> either a number or { cc: number, isStandard: boolean }).
     * Subclasses typically assign some values here, then call this.normalizeCCMap().
     *
     * Example usage in subclass:
     *   this.ccMap = {
     *     trackVolume: 7,
     *     filterCutoff: { cc: 32, isStandard: true },
     *     customDist:  51,
     *   };
     */
    this.ccMap = {};

    /**
     * An object describing which synth engine is assigned to each MIDI channel
     * (1..16). This can be changed at runtime if the device supports switching
     * engines/tracks dynamically.
     *
     *   enginesByChannel[channel] = { name: string, type: string }
     *
     * E.g. { 1: { name: "Bass", type: "subtractive" }, 2: { name: "Lead", type: "fm" } }
     *
     * @type {Record<number, { name: string, type: string }>}
     */
    this.enginesByChannel = {};
  }

  /**
   * Call this after your subclass sets up its `ccMap`. It will ensure each entry
   * is in the form { cc: number, isStandard: boolean }, inferring isStandard
   * by checking if the param name is in STANDARD_CC_NAMES.
   */
  normalizeCCMap() {
    for (const [paramName, val] of Object.entries(this.ccMap)) {
      if (typeof val === "number") {
        // If user just gave a number, assume isStandard if it's in the known set.
        const isStd = STANDARD_CC_NAMES.has(paramName);
        this.ccMap[paramName] = { cc: val, isStandard: isStd };
      } else if (val && typeof val === "object") {
        // If user gave an object, fill in isStandard if missing
        if (typeof val.cc !== "number") {
          console.warn(
            `DeviceDefinition: ccMap["${paramName}"] has a non-numeric 'cc'. Please fix.`
          );
          val.cc = 0; // fallback
        }
        if (typeof val.isStandard !== "boolean") {
          val.isStandard = STANDARD_CC_NAMES.has(paramName);
        }
      } else {
        console.warn(
          `DeviceDefinition: ccMap["${paramName}"] is invalid; expected number or object. Removing.`
        );
        delete this.ccMap[paramName];
      }
    }
  }

  // --------------------------------------------------------------------------
  // DRUMS
  // --------------------------------------------------------------------------

  /**
   * Returns the MIDI note number for a named drum voice, or null if not found.
   * @param {string} drumName - e.g. "kick", "snare"
   * @returns {number|null}
   */
  getDrumNote(drumName) {
    return this.drumMap[drumName] ?? null;
  }

  /**
   * Lists all drum voices supported by this device, as an array of { name, note } objects.
   * @returns {Array<{ name: string, note: number }>}
   */
  listDrumVoices() {
    return Object.entries(this.drumMap).map(([name, note]) => ({
      name,
      note,
    }));
  }

  // --------------------------------------------------------------------------
  // CC PARAMS
  // --------------------------------------------------------------------------

  /**
   * Returns the CC number for a given param name, or null if not supported.
   * @param {string} paramName - e.g. "filterCutoff", "customParam"
   * @returns {number|null}
   */
  getCC(paramName) {
    const rec = this.ccMap[paramName];
    if (!rec) return null;
    return rec.cc;
  }

  /**
   * Lists all CC parameters the device supports, standard or custom.
   * Each entry is { name, cc, isStandard }.
   *
   * @returns {Array<{ name: string, cc: number, isStandard: boolean }>}
   */
  listCCParams() {
    return Object.entries(this.ccMap).map(([name, obj]) => ({
      name,
      cc: obj.cc,
      isStandard: obj.isStandard,
    }));
  }

  /**
   * Lists only the standard param names that the device actually implements
   * (where isStandard = true).
   * @returns {Array<{ name: string, cc: number }>}
   */
  listStandardCCParams() {
    return this.listCCParams().filter((item) => item.isStandard);
  }

  /**
   * Lists only custom (non-standard) param names that the device implements
   * (where isStandard = false).
   * @returns {Array<{ name: string, cc: number }>}
   */
  listCustomCCParams() {
    return this.listCCParams().filter((item) => !item.isStandard);
  }

  /**
   * A simple method that returns true if this.getCC(paramName) is not null, else false.
   * @param {string} paramName - e.g. "filterCutoff", "customParam"
   * @returns {boolean}
   */
  hasCapability(paramName) {
    return this.getCC(paramName) !== null;
  }

  // --------------------------------------------------------------------------
  // CHANNELS / ENGINES
  // --------------------------------------------------------------------------

  /**
   * Get the synth engine object for a particular MIDI channel (1..16).
   * Returns null if no engine is assigned.
   * @param {number} channel
   * @returns {{ name: string, type: string } | null}
   */
  getSynthEngine(channel) {
    return this.enginesByChannel[channel] || null;
  }

  /**
   * Set or update the synth engine object for a particular MIDI channel (1..16).
   * This allows changing the engine/track name at runtime (e.g. user picks a new patch).
   *
   * @param {number} channel
   * @param {{ name: string, type: string }} engineObj
   */
  setSynthEngine(channel, engineObj) {
    if (!engineObj || typeof engineObj !== "object") return;
    this.enginesByChannel[channel] = { ...engineObj };
  }

  /**
   * Get a simple "engine name" string for the channel, or null if none.
   * @param {number} channel
   * @returns {string|null}
   */
  getChannelEngineName(channel) {
    const eng = this.enginesByChannel[channel];
    return eng ? eng.name : null;
  }

  /**
   * Set just the engine name for a particular channel. If no engine object
   * exists yet, it creates one with type="unknown".
   *
   * @param {number} channel
   * @param {string} newName
   */
  setChannelEngineName(channel, newName) {
    const eng = this.enginesByChannel[channel] || { name: "", type: "unknown" };
    eng.name = newName;
    this.enginesByChannel[channel] = eng;
  }

  /**
   * List all channels that have an engine defined. Returns an array of { channel, engineName, engineType }.
   * @returns {Array<{ channel: number, engineName: string, engineType: string }>}
   */
  listChannels() {
    return Object.entries(this.enginesByChannel).map(([chStr, eng]) => ({
      channel: parseInt(chStr, 10),
      engineName: eng.name,
      engineType: eng.type,
    }));
  }
}
