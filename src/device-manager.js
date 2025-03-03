// device-manager.js
/**
 * A simple manager that maps each "midiOutputId" to a DeviceDefinition instance.
 */

export class DeviceManager {
  constructor() {
    /** @type {Map<string, import('./device-definition.js').DeviceDefinition>} */
    this.outputToDeviceMap = new Map();
  }

  /**
   * Register a device instance for a given MIDI output ID.
   * @param {string} midiOutputId
   * @param {import('./device-definition.js').DeviceDefinition} deviceDefinition
   */
  setDeviceForOutput(midiOutputId, deviceDefinition) {
    this.outputToDeviceMap.set(midiOutputId, deviceDefinition);
  }

  /**
   * Retrieve the device definition for a given MIDI output ID.
   * @param {string} midiOutputId
   * @returns {import('./device-definition.js').DeviceDefinition|null}
   */
  getDeviceForOutput(midiOutputId) {
    return this.outputToDeviceMap.get(midiOutputId) || null;
  }

  /**
   * List all connected outputs and their assigned device + channel listing.
   * @returns {Array<{outputId: string, deviceName: string, channels: {channel: number, engineName: string}[]}>}
   */
  listOutputs() {
    const results = [];
    for (const [outputId, deviceDef] of this.outputToDeviceMap.entries()) {
      results.push({
        outputId,
        // e.g. "OpZDevice" or "DigitaktDevice"
        deviceName: deviceDef.constructor.name,
        channels: deviceDef.listChannels(),
      });
    }
    return results;
  }
}
