// op-z-device.js
import { DeviceDefinition } from "../device-definition.js";

/**
 * Example OP-Z device definition.
 * In an actual system, you'd fill out real CC values, note mappings, etc.
 */
export class OpZDevice extends DeviceDefinition {
  static profileName = "OP-Z";

  constructor() {
    super();

    /** @type {Record<string, number>} */
    this.drumMap = {
      kick: 60,
      snare: 62,
      // ... etc.
    };

    /** @type {Record<string, number>} */
    this.ccMap = {
      filterCutoff: 74,
      filterResonance: 71,
      // custom param for OP-Z
      punchStrength: 102,
    };

    /** @type {Record<number, {name: string, type: string}>} */
    this.enginesByChannel = {
      1: { name: "OP-Z Bass", type: "subtractive" }, // TODO track down the default engine on each channel for a new song
      2: { name: "OP-Z Lead", type: "subtractive" }, // TODO track down the default engine on each channel for a new song
      // ...
    };
  }

  getDrumNote(drumName) {
    return this.drumMap[drumName] ?? null;
  }

  getCC(paramName) {
    return this.ccMap[paramName] ?? null;
  }

  getSynthEngine(channel) {
    return this.enginesByChannel[channel] || null;
  }

  getChannelEngineName(channel) {
    const eng = this.enginesByChannel[channel];
    return eng ? eng.name : null;
  }

  listChannels() {
    // Return an array of { channel, engineName }
    return Object.keys(this.enginesByChannel).map((chStr) => {
      const ch = parseInt(chStr, 10);
      const eng = this.enginesByChannel[ch];
      return {
        channel: ch,
        engineName: eng.name,
      };
    });
  }
}
