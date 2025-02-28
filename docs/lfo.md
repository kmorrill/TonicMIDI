# Technical Design: LFO (Low-Frequency Oscillator)

## Overview
The **LFO (Low-Frequency Oscillator)** is a **pure domain object** that generates a continuously varying value (e.g., sine wave) over time. In this system, it can be used to modulate parameters such as filter cutoff, volume, or pan. It does **not** directly handle MIDI or timing; instead, the **LiveLoop** (or another orchestrator) calls its `update(...)` method each “tick” (or any interval) and applies the resulting value to the desired parameter.

### Why Separate LFO Logic?
1. **Testability**: The LFO can be unit-tested in complete isolation, feeding it time deltas and verifying its output.
2. **Flexibility**: The same LFO code can be reused to modulate any parameter, whether it’s a MIDI CC value, a software synth setting, or some internal property.
3. **Decoupling from Clock**: The LFO does not deal with external clocks or scheduling; it only receives time increments (`deltaTimeInBeatsOrSeconds`) from whoever calls `update(...)`.

---

## Responsibilities
1. **Generate Wave Values**  
   - Provide a numeric output (0–1, -1–1, or some amplitude range) based on the internal wave shape (sine, triangle, square, random, etc.).
2. **Store Parameters**  
   - **Frequency**: in Hertz or in cycles per beat (the calling code decides).  
   - **Amplitude**: the peak deviation from 0 (or from offset).  
   - **Offset**: a baseline value added to the wave.  
   - **Phase**: to shift the wave start position in degrees or radians.  
   - **Shape**: the type of waveform to generate (sine, triangle, etc.).
3. **Track State Over Time**  
   - Keep an internal “phase accumulator” or equivalent to know where in the wave cycle we are after each `update(...)`.
4. **Return a Value**  
   - On `update(deltaTime)`, compute the new wave value and return it.

---

## LFO Interface

A simple TypeScript-like interface for reference:

```ts
interface LFO {
  /**
   * Update the internal phase based on the passed time, then return the current wave value.
   * @param deltaTime number - The time increment (in beats or seconds).
   * @returns number - The current LFO value after the update, typically in [0..1] or [-1..1].
   */
  update(deltaTime: number): number;

  /**
   * Reset or re-initialize the LFO’s internal phase to 0 (or a given value).
   */
  reset(phase?: number): void;

  /**
   * Get or set parameters like frequency, amplitude, offset, shape, etc.
   */
  setFrequency(freq: number): void;
  setAmplitude(amp: number): void;
  setOffset(off: number): void;
  setShape(shape: 'sine' | 'triangle' | 'square' | ...): void;
  // ...
}
In plain JavaScript, you can document these methods/fields in JSDoc, or create an abstract base class if desired.

Implementation Outline
=====================

Constructor:
Accepts an options object: { frequency, amplitude, offset, shape, phase }.
Example defaults:
this.frequency = options.frequency ?? 1.0;    // 1 Hz or 1 cycle/beat
this.amplitude = options.amplitude ?? 1.0;
this.offset = options.offset ?? 0.0;
this.phase = options.phase ?? 0.0;            // initial phase
this.shape = options.shape ?? 'sine';
update(deltaTime):
Increments the phase by frequency * deltaTime * 2π for sinusoidal waves (if we measure phase in radians).
Wrap phase if it exceeds 2π (phase %= 2 * Math.PI) so it doesn’t grow unbounded.
Compute wave value based on shape:
let rawWave = 0;
switch (this.shape) {
  case 'sine':
    rawWave = Math.sin(this.phase);
    break;
  case 'triangle':
    // compute triangle wave from phase
    break;
  // ...
}
Scale by amplitude and shift by offset. E.g.
return (rawWave * this.amplitude) + this.offset;
reset(phase?):
Set this.phase = phase ?? 0.0;
get/set methods:
Provide simple functions or direct property assignments to configure frequency, amplitude, shape, etc.
Usage and Data Flow
=====================

LiveLoop or other caller tracks time. Each “tick” might represent:
A step (in beats), so deltaTime is e.g. 1.0 if each step = 1 beat.
A fraction of a beat if you subdivide steps.
Real seconds if you’re using absolute time.
Call lfo.update(deltaTime), get back a numeric value.
Apply the result to a parameter or convert to e.g. 0–127 for MIDI CC:
const val = lfo.update(deltaTimeInBeats);
const ccValue = Math.floor(val * 64 + 64); // map [-1..1] -> [0..128]
midiBus.controlChange({ channel: 1, cc: 74, value: ccValue });
Example Skeleton
================

// src/lfo.js (example name)

export class LFO {
  constructor({
    frequency = 1.0,
    amplitude = 1.0,
    offset = 0.0,
    phase = 0.0,
    shape = 'sine',
    useRadians = true  // or any config for wave calculation
  } = {}) {
    this.frequency = frequency;
    this.amplitude = amplitude;
    this.offset = offset;
    this.phase = phase;
    this.shape = shape;
    this.useRadians = useRadians; 
  }

  update(deltaTime) {
    // If deltaTime is in beats and frequency is cycles/beat:
    // increment = frequency * deltaTime * (2π if using radians)
    const increment = this.frequency * deltaTime * (this.useRadians ? 2 * Math.PI : 1);
    this.phase += increment;

    // Wrap phase if using radians
    if (this.useRadians) {
      this.phase = this.phase % (2 * Math.PI);
    }

    // Compute raw wave
    let raw;
    switch (this.shape) {
      case 'sine':
        raw = Math.sin(this.phase);
        break;
      case 'triangle':
        // implement triangle logic
        raw = (2 / Math.PI) * Math.asin(Math.sin(this.phase));
        break;
      case 'square':
        raw = Math.sign(Math.sin(this.phase));
        break;
      // add more shapes as needed
      default:
        raw = 0;
        break;
    }

    // Scale by amplitude + offset
    return (raw * this.amplitude) + this.offset;
  }

  reset(newPhase = 0) {
    this.phase = newPhase;
  }

  setFrequency(freq) {
    this.frequency = freq;
  }

  // ... other setters/getters ...
}
Testing Strategy
================

Unit Test (pure logic):
Mock time increments (deltaTime) and shape (sine, triangle, etc.).
For each update, confirm the returned value matches expected wave outputs at known phases.
For instance, if shape = 'sine', amplitude = 1.0, offset = 0, at phase = π/2, output should be ~1.0.
Test phase wrapping (phase never grows unbounded).
Test reset() method sets phase to 0 (or desired value).
Integration:
Combine with LiveLoop or similar. E.g., have your loop call lfo.update(1) each “step,” confirm that a MIDI CC is generated that looks like a wave over steps. (Optional deeper test.)
Example Unit Test Outline
import { LFO } from '../../src/lfo.js';

describe('LFO (Low-Frequency Oscillator)', () => {
  it('generates sine wave output with default settings', () => {
    const lfo = new LFO({ shape: 'sine', useRadians: true });
    // Start at phase 0
    let val = lfo.update(0); // no time passed
    expect(val).toBeCloseTo(0, 5); // sine(0) = 0

    // Step 1: deltaTime = 0.25 beats, frequency = 1 cycles/beat => 0.25 cycle => 0.25 * 2π = π/2
    val = lfo.update(0.25);
    expect(val).toBeCloseTo(1, 5); // sine(π/2) = 1
  });

  it('respects amplitude and offset', () => {
    const lfo = new LFO({ shape: 'sine', amplitude: 0.5, offset: 1 });
    // ...
  });

  // more tests...
});
Summary
========

LFO Class:
Keeps track of frequency, amplitude, offset, shape, and phase.
Exposes an update(deltaTime) to increment phase and compute the wave’s output.
No direct MIDI or scheduling logic—only pure math.
Testable in Isolation:
Provide time increments, verify wave shapes and boundary conditions.
Usage:
Called by LiveLoop or any logic that wants a changing value over time.
Output can be mapped to MIDI CC or any other param.
With this design, you have a simple, reusable domain component that can produce rich modulation effects when combined with your sequencer logic.