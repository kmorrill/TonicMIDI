/**
 * device-definition.js
 *
 * Minimal changes to add optional per-engine CC mapping logic,
 * plus restored drumMap logic for getDrumNote() and listDrumVoices().
 */

export class DeviceDefinition {
  constructor() {
    /**
     * A known set of “standard” MIDI CC param names. We can treat them as isStandard=true by default.
     * You can expand this as you see fit.
     * @private
     */
    this.STANDARD_CC_NAMES = new Set([
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

    /**
     * A simple mapping of drum voices: { drumName -> MIDI note number }.
     * If your device has no drums, keep this empty.
     */
    this.drumMap = {};

    /**
     * Global CC parameters for the device, applying to all engines or no engine in particular.
     * Each entry can be a number or an object { cc: number, isStandard: boolean }.
     * @type {Record<string, number | { cc: number; isStandard?: boolean }>}
     */
    this.ccMap = {};

    /**
     * Optionally store engine-specific CC mappings in engineCCMaps.
     *   engineCCMaps[engineName] = { paramName -> cc or {cc, isStandard} }
     * Example:
     *   {
     *     ACD: { sawMix: 20, filterCutoff: 74 },
     *     FAT: { fatness: 27, filterCutoff: 74 },
     *   }
     *
     * @type {Record<string, Record<string, number | { cc: number; isStandard?: boolean }>>}
     */
    this.engineCCMaps = {};

    /**
     * A table describing which engine is assigned to each MIDI channel (1..16).
     *   enginesByChannel[channel] = { name: string, type: string }
     * @type {Record<number, { name: string; type: string }>}
     */
    this.enginesByChannel = {};
  }

  /**
   * Normalize both the global ccMap and each engine’s ccMap so that each entry
   * is of the form { cc: number, isStandard: boolean }.
   */
  normalizeCCMap() {
    this._normalizeOneMap(this.ccMap);

    // Then normalize engine-specific maps if any
    for (const engineName of Object.keys(this.engineCCMaps)) {
      const mapObj = this.engineCCMaps[engineName];
      this._normalizeOneMap(mapObj);
    }
  }

  /**
   * Internal helper to turn each param entry into { cc, isStandard } form.
   * @private
   */
  _normalizeOneMap(mapObj) {
    for (const [paramName, val] of Object.entries(mapObj)) {
      if (typeof val === "number") {
        const isStd = this.STANDARD_CC_NAMES.has(paramName);
        mapObj[paramName] = { cc: val, isStandard: isStd };
      } else if (val && typeof val === "object") {
        if (typeof val.cc !== "number") {
          console.warn(
            `DeviceDefinition: ccMap[${paramName}] has invalid cc. Setting to 0.`
          );
          val.cc = 0;
        }
        if (typeof val.isStandard !== "boolean") {
          val.isStandard = this.STANDARD_CC_NAMES.has(paramName);
        }
      } else {
        console.warn(
          `DeviceDefinition: ccMap[${paramName}] is invalid. Removing.`
        );
        delete mapObj[paramName];
      }
    }
  }

  // --------------------------------------------------------------------------
  // DRUM FUNCTIONS (restored)
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
   * Look up the MIDI CC number for a given param name.
   * If channel is provided, we check that channel's engine-specific map first,
   * then fall back to the global ccMap if not found.
   *
   * @param {string} paramName
   * @param {number} [channel] - optional (1..16)
   * @returns {number|null}
   */
  getCC(paramName, channel) {
    if (typeof channel === "number") {
      // see if this channel has an assigned engine
      const engineInfo = this.enginesByChannel[channel];
      if (engineInfo && engineInfo.name) {
        const engineMap = this.engineCCMaps[engineInfo.name];
        if (engineMap && engineMap[paramName]) {
          return engineMap[paramName].cc;
        }
      }
    }

    // fallback to the device-wide map
    const rec = this.ccMap[paramName];
    return rec ? rec.cc : null;
  }

  /**
   * Returns a list of CC params, optionally for a specific channel’s engine.
   *
   * @param {number} [channel] - if provided, returns the union of engine + global
   * @returns {Array<{ name: string; cc: number; isStandard: boolean }>}
   */
  listCCParams(channel) {
    if (typeof channel !== "number") {
      // Only global
      return Object.entries(this.ccMap).map(([name, obj]) => ({
        name,
        cc: obj.cc,
        isStandard: obj.isStandard,
      }));
    } else {
      const result = [];
      // engine portion
      const engineInfo = this.enginesByChannel[channel];
      if (engineInfo && engineInfo.name) {
        const engMap = this.engineCCMaps[engineInfo.name];
        if (engMap) {
          for (const [paramName, rec] of Object.entries(engMap)) {
            result.push({
              name: paramName,
              cc: rec.cc,
              isStandard: rec.isStandard,
            });
          }
        }
      }
      // then add any global params not already included
      for (const [paramName, rec] of Object.entries(this.ccMap)) {
        if (!result.some((r) => r.name === paramName)) {
          result.push({
            name: paramName,
            cc: rec.cc,
            isStandard: rec.isStandard,
          });
        }
      }
      return result;
    }
  }

  // --------------------------------------------------------------------------
  // CHANNELS / ENGINES
  // --------------------------------------------------------------------------

  /**
   * Get the synth engine object for a channel, or null if none.
   * @param {number} channel
   */
  getSynthEngine(channel) {
    return this.enginesByChannel[channel] || null;
  }

  /**
   * Set or update the engine for a MIDI channel.
   * @param {number} channel
   * @param {{ name: string, type: string }} engineObj
   */
  setSynthEngine(channel, engineObj) {
    if (!engineObj || typeof engineObj !== "object") return;
    this.enginesByChannel[channel] = { ...engineObj };
  }

  // etc...
}
