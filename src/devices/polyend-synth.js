// src/devices/polyend-synth.js

import { DeviceDefinition } from "../device-definition.js";

/**
 * PolyendSynthDevice - example using minimal duplication:
 *   - We define a defaultEngineParams for shared CCs among ACD & FAT
 *   - Then each engine merges in its own specialized params.
 */
export class PolyendSynthDevice extends DeviceDefinition {
  static profileName = "Synth";

  constructor() {
    super();

    // 1) If there are any truly global (device-wide) CCs, put them here:
    this.ccMap = {
      // e.g. masterVolume or something universal
      masterVolume: 7,
    };

    // 2) Define the default params for *all* engines:
    const defaultEngineParams = {
      filterCutoff: 74,
      resonance: 71,
      envAmount: 77,
      filterLfo: 78,

      ampAttack: 75,
      ampDecay: 72,
      ampSustain: 76,
      ampRelease: 73,

      filterAttack: 80,
      filterDecay: 81,
      filterSustain: 82,
      filterRelease: 83,

      lfoFrequency: 54,
    };

    // 3) Build per-engine maps, merging defaults with engine-specific overrides:
    this.engineCCMaps = {
      ACD: {
        ...defaultEngineParams,
        sawMix: 20,
        squareMix: 21,
        subMix: 22,
        noise: 23,
        pulseWidth: 24,
        pitchLfo: 27,
        pwEnv: 26,
        pwLfo: 25,
      },

      FAT: {
        ...defaultEngineParams,
        fatness: 27,
        brightness: 23,
        timbre: 20,
        fatnessLfo: 24,
        noise: 21,
      },

      WAVS: {
        ...defaultEngineParams,
        position1: 22,
        position2: 27,
        mix: 20,
        warp1: 21,
        warp2: 28,
        noise: 29,
        tune1: 25,
        tune2: 30,
        detune: 31,
        finetune: 26,
        auxAttack: 46,
        auxDecay: 47,
        auxSustain: 48,
        auxRelease: 49,
      },

      VAP: {
        ...defaultEngineParams,
        shape1: 22,
        shape2: 27,
        mix: 20,
        pw1: 21,
        pw2: 28,
        tune1: 25,
        tune2: 30,
        detune: 26,
        noise: 23,
        finetune: 31,
        auxAttack: 46,
        auxDecay: 47,
        auxSustain: 48,
        auxRelease: 49,
      },

      WTFM: {
        ...defaultEngineParams,
        ratio1: 23,
        ratio2: 24,
        fm: 20,
        shape1: 22,
        shape2: 27,
        feedback1: 21,
        feedback2: 28,
        feedback2to1: 29,
        finetune1: 26,
        finetune2: 25,
        auxAttack: 46,
        auxDecay: 47,
        auxSustain: 48,
        auxRelease: 49,
      },

      PMD: {
        form: 70,
        position: 85,
        space: 86,
        brightness: 74,
        damping: 71,
        bowLevel: 20,
        airLevel: 22,
        strikeLevel: 25,
        bowTimbre: 21,
        airTimbre: 24,
        strikeTimbre: 27,
        airFlow: 23,
        strikeMallet: 26,
        exciterAttack: 75,
        exciterDecay: 72,
        exciterSustain: 76,
        exciterRelease: 73,
        auxAttack: 46,
        auxDecay: 47,
        auxSustain: 48,
        auxRelease: 49,
      },

      PHZ: {
        ...defaultEngineParams,
        shape1: 22,
        shape2: 27,
        mix: 20,
        osc1XMod: 21,
        osc2XMod: 28,
        osc1YMod: 23,
        osc2YMod: 29,
        detune: 24,
        tune1: 25,
        tune2: 30,
        finetune: 26,
        auxAttack: 46,
        auxDecay: 47,
        auxSustain: 48,
        auxRelease: 49,
      },

      GRAIN: {
        ...defaultEngineParams,
        position: 20,
        positionSpread: 21,
        grainSize: 24,
        density: 23,
        timeSpread: 22,
        grainShape: 25,
        panSpread: 27,
        tune: 30,
        detuneSpread: 26,
        finetune: 31,
        sizeSpread: 87,
        direction: 86,
        space: 85,
        auxAttack: 46,
        auxDecay: 47,
        auxSustain: 48,
        auxRelease: 49,
      },
    };

    // 4) Assign default engine(s) to channels:
    this.enginesByChannel = {
      1: { name: "ACD", type: "monophonic_analog" },
      2: { name: "FAT", type: "analog_emulation" },
      3: { name: "WAVS", type: "wavetable" },
      4: { name: "VAP", type: "analog_polysynth" },
      5: { name: "WTFM", type: "fm_synth" },
      6: { name: "PMD", type: "physical_modelling" },
      7: { name: "PHZ", type: "phase_distortion" },
      8: { name: "GRAIN", type: "granular" },
    };
    // 5) Normalize all maps:
    this.normalizeCCMap();
  }

  listChannels() {
    // for instance:
    return Object.keys(this.enginesByChannel).map((chStr) => {
      const ch = parseInt(chStr, 10);
      const eng = this.enginesByChannel[ch];
      return {
        channel: ch,
        engineName: eng ? eng.name : "Unknown",
      };
    });
  }
}
