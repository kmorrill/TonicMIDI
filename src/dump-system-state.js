// File: src/dump-system-state.js

/**
 * dump-system-state.js
 *
 * Provides a single function, `dumpSystemState()`, that returns a comprehensive
 * snapshot of the current musical state. This is intended for feeding into
 * an LLM so it can understand what’s playing, which devices are connected,
 * what loops/patterns are active, etc.
 */

/**
 * @param {Object} options
 * @param {import('./transport/transport-manager.js').TransportManager} [options.transportManager]
 * @param {import('./energy-manager.js').EnergyManager} [options.energyManager]
 * @param {import('./device-manager.js').DeviceManager} [options.deviceManager]
 * @param {import('./chord-manager.js').ChordManager} [options.chordManager]
 * @param {import('./global-context.js').GlobalContext} [options.globalContext]
 * @param {import('./midi-bus.js').MidiBus} [options.midiBus]
 * @param {Array<import('./live-loop.js').LiveLoop>} [options.liveLoops=[]]
 *   A list of currently active LiveLoop instances.
 * @returns {Object} A JSON-friendly snapshot of the entire system.
 */
export function dumpSystemState({
  transportManager,
  energyManager,
  deviceManager,
  chordManager,
  globalContext,
  midiBus,
  liveLoops = [],
} = {}) {
  const transportState = transportManager
    ? {
        isRunning: transportManager.isRunning,
        stepIndex: transportManager.stepIndex,
        pulseCounter: transportManager.pulseCounter,
        timeInBeats: transportManager.timeInBeats,
        pulsesPerStep: transportManager.pulsesPerStep,
      }
    : null;

  const energyManagerState = energyManager
    ? {
        currentHypeLevel: energyManager.currentHypeLevel,
        currentTensionLevel: energyManager.currentTensionLevel,
        // If you have arrangement style or other props, add them:
        arrangementStyle: energyManager.currentArrangementStyle ?? null,
        // Potentially list the loops it’s managing:
        managedLiveLoops: energyManager.liveLoops.map((l) => l.name),
      }
    : null;

  const deviceManagerState = deviceManager
    ? {
        // The deviceManager has a listOutputs() method:
        outputs: deviceManager.listOutputs(), // e.g. [{outputId, deviceName, channels}, ...]
      }
    : null;

  const chordManagerState = chordManager
    ? {
        progression: chordManager.progression,
        tensionLevel: chordManager.getTensionLevel(), // or chordManager.tensionLevel
        currentStepIndex: chordManager.currentStepIndex,
      }
    : null;

  const globalContextState = globalContext
    ? {
        // For instance, if globalContext has chordManager + rhythmManager
        energyState: globalContext.energyState, // { hypeLevel, tensionLevel }
        additionalContext: globalContext.additionalContext,
      }
    : null;

  const midiBusState = midiBus
    ? {
        // Array.from(midiBus.activeNotes.values()) is typical if you store them in a Map
        activeNotes: Array.from(midiBus.activeNotes.values()),
      }
    : null;

  // Build an array of live loop states
  const liveLoopsState = liveLoops.map((loop) => {
    return {
      name: loop.name,
      muted: loop.muted,
      transpose: loop.transpose,
      midiChannel: loop.midiChannel,
      activeNotes: loop.activeNotes, // {note, velocity, endStep, channel}

      // Use pattern.toConfig() if each pattern implements it.
      // This returns an object with { patternType, options, ... } or anything your pattern includes.
      pattern: loop.pattern ? loop.pattern.toConfig() : null,

      // Dump LFO states (if you want more detail, add any other fields)
      lfos: loop.lfos.map((lfo) => ({
        shape: lfo.getShape(),
        frequency: lfo.getFrequency(),
        amplitude: lfo.getAmplitude(),
        offset: lfo.getOffset(),
        targetParam: lfo.getTargetParam(),
        minCcValue: lfo.getMinCcValue(),
        maxCcValue: lfo.getMaxCcValue(),
        // You could also approximate current wave value, e.g. lfo._computeWaveValue(lfo.getPhase())
      })),

      // If you queue changes, you can show them:
      queuedChanges: loop.changeQueue,
    };
  });

  return {
    transportState,
    energyManagerState,
    deviceManagerState,
    chordManagerState,
    globalContextState,
    midiBusState,
    liveLoops: liveLoopsState,
  };
}
