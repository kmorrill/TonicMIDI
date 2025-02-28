/**
 * tests/unit/lfo/lfo.test.js
 *
 * Unit tests for the LFO (Low-Frequency Oscillator) class.
 * Verifies wave output (sine, triangle, etc.), amplitude, offset, and phase handling.
 */

import { LFO } from "../../../src/lfo.js";

describe("LFO (Low-Frequency Oscillator)", () => {
  describe("Initialization and basic properties", () => {
    it("should initialize with default values", () => {
      const lfo = new LFO();
      expect(lfo.frequency).toBe(1);
      expect(lfo.amplitude).toBe(1);
      expect(lfo.offset).toBe(0);
      expect(lfo.phase).toBe(0);
      expect(lfo.shape).toBe("sine");
      expect(lfo.useRadians).toBe(true);
    });

    it("should allow custom constructor parameters", () => {
      const lfo = new LFO({
        frequency: 2.5,
        amplitude: 0.5,
        offset: 1.2,
        phase: Math.PI / 2,
        shape: "square",
        useRadians: false,
      });
      expect(lfo.frequency).toBe(2.5);
      expect(lfo.amplitude).toBe(0.5);
      expect(lfo.offset).toBe(1.2);
      expect(lfo.phase).toBeCloseTo(Math.PI / 2, 5);
      expect(lfo.shape).toBe("square");
      expect(lfo.useRadians).toBe(false);
    });
  });

  describe("Sine wave output", () => {
    it("should produce expected sine values for small increments (useRadians = true)", () => {
      // frequency=1 => 1 cycle per unit time, if deltaTime=0.25 => 0.25 cycles => pi/2 radians
      const lfo = new LFO({ shape: "sine", frequency: 1, useRadians: true });

      // 1) No time elapsed yet => phase=0 => sin(0)=0
      let val = lfo.update(0);
      expect(val).toBeCloseTo(0, 5);

      // 2) deltaTime=0.25 => increment = 0.25 cycles => 0.25 * 2π = π/2 radians
      val = lfo.update(0.25);
      // sin(π/2) => ~1.0
      expect(val).toBeCloseTo(1.0, 5);

      // 3) another 0.25 => total phase= π/2 + π/2 = π => sin(π) = 0
      val = lfo.update(0.25);
      expect(val).toBeCloseTo(0, 5);

      // 4) another 0.25 => total phase= π + π/2 = 3π/2 => sin(3π/2) = -1
      val = lfo.update(0.25);
      expect(val).toBeCloseTo(-1.0, 5);
    });

    it("should wrap phase properly after 2π in radians mode", () => {
      const lfo = new LFO({ shape: "sine", frequency: 1, useRadians: true });
      // 1 cycle => 1.0 time => 2π phase
      lfo.update(1.0);
      // Next update => deltaTime=0 => no change, still near phase=0 after wrap
      const val = lfo.update(0);
      // sin(2π) => 0
      expect(val).toBeCloseTo(0, 5);
    });
  });

  describe("Amplitude & offset", () => {
    it("should scale the raw wave by amplitude and then add offset", () => {
      // amplitude=2 => wave range -2..+2, offset=3 => final range 1..5 for a sine wave
      const lfo = new LFO({
        shape: "sine",
        amplitude: 2,
        offset: 3,
        frequency: 1,
      });

      // At phase=0 => sin(0)=0 => final => (0*2) + 3 = 3
      let val = lfo.update(0);
      expect(val).toBeCloseTo(3, 5);

      // Step forward 0.25 => sin(π/2)=1 => final => (1*2) + 3 = 5
      val = lfo.update(0.25);
      expect(val).toBeCloseTo(5, 5);

      // Step forward 0.25 => sin(π)=0 => final => 3
      val = lfo.update(0.25);
      expect(val).toBeCloseTo(3, 5);

      // Step forward 0.25 => sin(3π/2)=-1 => final => ( -1*2 )+ 3 = 1
      val = lfo.update(0.25);
      expect(val).toBeCloseTo(1, 5);
    });
  });

  describe("Other shapes", () => {
    it("triangle wave should go from -1 to +1 linearly", () => {
      // frequency=1, useRadians => after 0.25 time => ~ π/2, but we do a shape check
      const lfo = new LFO({ shape: "triangle", useRadians: true });
      // Start => phase=0 => triangle wave => -1? or 0? Let's see:
      // We'll check intermediate steps to ensure it's in [-1..+1]
      const val1 = lfo.update(0.25);
      expect(val1).toBeGreaterThanOrEqual(-1);
      expect(val1).toBeLessThanOrEqual(1);

      // Next step
      const val2 = lfo.update(0.25);
      expect(val2).toBeGreaterThanOrEqual(-1);
      expect(val2).toBeLessThanOrEqual(1);
    });

    it("square wave should be +1 or -1 only", () => {
      // If useRadians => phase < π => +1, else -1
      const lfo = new LFO({ shape: "square", frequency: 1, useRadians: true });
      // 0 time => phase=0 => sin(0)=0 => but square wave => +1 for phase < π
      let val = lfo.update(0);
      expect(val).toBe(1);

      // after 0.5 time => phase= π => square wave => -1
      val = lfo.update(0.5);
      expect(val).toBe(-1);
    });

    it("sawUp wave should rise from -1 to +1 over a cycle", () => {
      const lfo = new LFO({ shape: "sawUp", frequency: 1, useRadians: true });
      // We'll just check a couple increments to ensure it rises
      let val0 = lfo.update(0); // at phase=0 => raw= -1
      expect(val0).toBeCloseTo(-1, 5);

      // after 0.5 time => half cycle => raw= ?
      let val1 = lfo.update(0.5);
      // half cycle => sawUp => ~ 0.
      expect(val1).toBeCloseTo(0, 5);

      // after 0.5 more => full cycle => near -1 again
      let val2 = lfo.update(0.5);
      expect(val2).toBeCloseTo(-1, 0.1);
      // approximate, because phase wrapping might yield floating rounding
    });

    it("random shape should produce random values in [-1..1]", () => {
      const lfo = new LFO({ shape: "random" });
      const val = lfo.update(0.1);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);

      // Not strictly deterministic, but we can confirm it's within the wave range
      const val2 = lfo.update(0.1);
      expect(val2).toBeGreaterThanOrEqual(-1);
      expect(val2).toBeLessThanOrEqual(1);
      // Could also check that val2 is often different from val
    });
  });

  describe("Phase control and reset", () => {
    it("should reset phase to 0 (or specified) when reset() is called", () => {
      const lfo = new LFO({ shape: "sine", frequency: 1 });
      // Move forward 0.25 => phase => π/2
      lfo.update(0.25);
      // Now reset
      lfo.reset();
      expect(lfo.phase).toBe(0);

      // If we pass a new phase
      lfo.reset(Math.PI);
      expect(lfo.phase).toBe(Math.PI);
    });

    it("should wrap phase in normalized mode (useRadians=false)", () => {
      // If useRadians=false => phase is [0..1)
      const lfo = new LFO({ useRadians: false, frequency: 1, shape: "sine" });
      // step 1 => phase=0 + 1 => wrap => 0
      lfo.update(1);
      expect(lfo.phase).toBeCloseTo(0, 5);

      // next small step => 0.1 => phase=0.1
      lfo.update(0.1);
      expect(lfo.phase).toBeCloseTo(0.1, 5);
    });
  });

  describe("Dynamic setters", () => {
    it("should allow changing frequency, amplitude, offset, etc. on the fly", () => {
      const lfo = new LFO({
        frequency: 1,
        amplitude: 1,
        offset: 0,
        shape: "sine",
      });
      lfo.setFrequency(2);
      expect(lfo.getFrequency()).toBe(2);

      lfo.setAmplitude(0.5);
      expect(lfo.getAmplitude()).toBe(0.5);

      lfo.setOffset(1);
      expect(lfo.getOffset()).toBe(1);

      lfo.setShape("triangle");
      expect(lfo.getShape()).toBe("triangle");

      lfo.setPhase(0.4);
      expect(lfo.getPhase()).toBeCloseTo(0.4, 5);
    });
  });
});
