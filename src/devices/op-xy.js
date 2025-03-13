// src/devices/op-xy.js
import { DeviceDefinition } from "../device-definition.js";

export class OpXyDevice extends DeviceDefinition {
  static profileName = "OP-XY"; // the name that will show up in Web MIDI
  constructor() {
    super();

    // Suppose OP-XY has a robust drum section:
    this.drumMap = {
      kick: 53,
      kick_alt: 54,
      snare: 55,
      snare_alt: 56,
      rim: 57,
      clap: 58,
      tambourine: 59,
      shaker: 60,
      closed_hat: 61,
      open_hat: 62,
      pedal_hat: 63,
      low_tom: 65,
      crash: 66,
      mid_tom: 67,
      ride: 68,
      high_tom: 69,
      conga_low: 71,
      conga_high: 72,
      cowbell: 73,
      guiro: 74,
      metal: 75,
      chi: 76,
    };

    // You can define CC map with simple numbers
    // (the base class will fill in isStandard automatically)
    this.ccMap = {
      trackVolume: 7,
      trackPan: 10,
      trackMute: 9,

      ampAttack: 20,
      ampDecay: 21,
      ampSustain: 22,
      ampRelease: 23,

      filterAttack: 24,
      filterDecay: 25,
      filterSustain: 26,
      filterRelease: 27,

      filterCutoff: 32,
      resonance: 33,
      envAmount: 34,
      keyTrackingAmount: 35,

      // custom params
      param1: 12,
      param2: 13,
      param3: 14,
      param4: 15,

      poly_mono_legator: 28,
      portamento: 29,
      pitch_bend: 30,
      engine_volume: 31,
      send_to_external: 36,
      send_to_tape: 37,
      send_to_fx1: 38,
      send_to_fx2: 39,
      lfo_destination: 40,
      lfo_param: 41,
    };

    // Now let the base class finalize the ccMap
    this.normalizeCCMap();

    // Default engine definitions for channels 1..16
    this.enginesByChannel = {
      1: { name: "OP-XY Track 1", type: "Drum Sampler" },
      2: { name: "OP-XY Track 2", type: "Drum Sampler" },
      3: { name: "OP-XY Track 3", type: "Prism" },
      4: { name: "OP-XY Track 4", type: "E-piano" },
      5: { name: "OP-XY Track 5", type: "Dissolve" },
      6: { name: "OP-XY Track 6", type: "Hardsync" },
      7: { name: "OP-XY Track 7", type: "Axis" },
      8: { name: "OP-XY Track 8", type: "Multisampler" },
      9: { name: "OP-XY Track 9", type: "Brain" },
      10: { name: "OP-XY Track 10", type: "PunchFx" },
      11: { name: "OP-XY Track 11", type: "MIDI" },
      12: { name: "OP-XY Track 12", type: "CV" },
      13: { name: "OP-XY Track 13", type: "Audio In" },
      14: { name: "OP-XY Track 14", type: "Tape" },
      15: { name: "OP-XY Track 15", type: "FX1" },
      16: { name: "OP-XY Track 16", type: "Fx2" },
    };
  }
}
