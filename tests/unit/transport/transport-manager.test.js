/**
 * tests/unit/transport/transport-manager.test.js
 *
 * Unit tests for the TransportManager, ensuring:
 * 1) Start (0xFA) sets isRunning, resets stepIndex.
 * 2) Stop (0xFC) calls stopAllNotes.
 * 3) Clock (0xF8) accumulates pulses -> increments stepIndex at pulsesPerStep.
 * 4) Only calls pattern logic at integer step boundaries, not on fractional steps.
 * 5) Updates LFOs on every pulse for high-resolution modulation.
 * 6) (Optional) Song Position Pointer sets stepIndex if implemented.
 */

import { TransportManager } from "../../../src/transport/transport-manager.js";
import { jest } from '@jest/globals';

describe("TransportManager", () => {
  let midiBusMock;
  let liveLoop1, liveLoop2;
  let transportManager;

  beforeEach(() => {
    // Create a mock midiBus
    midiBusMock = {
      on: jest.fn(), // used to attach event listeners (we won't focus on this much in the test)
      stopAllNotes: jest.fn(), // we want to verify if it's called on Stop
    };

    // Create mock LiveLoops
    liveLoop1 = { tick: jest.fn() };
    liveLoop2 = { tick: jest.fn() };

    // We won't rely on 'on' event hooking in these tests. We'll directly call _handleIncomingClock
    // to simulate incoming MIDI messages.
    transportManager = new TransportManager(midiBusMock, {
      liveLoops: [liveLoop1, liveLoop2],
      pulsesPerStep: 6,
      highResolution: false,
    });
  });

  function simulateMidiMessage(data) {
    // We'll call the manager's internal method directly to simulate incoming messages
    transportManager._handleIncomingClock({ data });
  }

  it("should initialize with isRunning=false, stepIndex=0, pulseCounter=0", () => {
    expect(transportManager.isRunning).toBe(false);
    expect(transportManager.stepIndex).toBe(0);
    expect(transportManager.pulseCounter).toBe(0);
  });

  it("should handle Start (0xFA) -> sets isRunning, resets stepIndex/pulseCounter", () => {
    // Make sure it starts out false
    expect(transportManager.isRunning).toBe(false);

    simulateMidiMessage([0xfa]); // Start

    expect(transportManager.isRunning).toBe(true);
    expect(transportManager.stepIndex).toBe(0);
    expect(transportManager.pulseCounter).toBe(0);
  });

  it("should handle Stop (0xFC) -> sets isRunning=false, calls stopAllNotes", () => {
    // Start first
    simulateMidiMessage([0xfa]);
    expect(transportManager.isRunning).toBe(true);

    // Now stop
    simulateMidiMessage([0xfc]);
    expect(transportManager.isRunning).toBe(false);
    expect(midiBusMock.stopAllNotes).toHaveBeenCalledTimes(1);
  });

  it("should accumulate clock pulses and increment stepIndex when pulsesPerStep reached", () => {
    // Start transport
    simulateMidiMessage([0xfa]);
    // highResolution = false, so we only call tick after pulsesPerStep (6 pulses)

    // We send 5 pulses => stepIndex should remain 0
    for (let i = 0; i < 5; i++) {
      simulateMidiMessage([0xf8]); // Clock
    }
    expect(transportManager.stepIndex).toBe(0);
    expect(transportManager.pulseCounter).toBe(5);
    // No tick calls yet
    expect(liveLoop1.tick).not.toHaveBeenCalled();

    // 6th pulse => triggers step increment to 1
    simulateMidiMessage([0xf8]);
    expect(transportManager.stepIndex).toBe(1);
    expect(transportManager.pulseCounter).toBe(0);
    // Should have called tick on both loops
    expect(liveLoop1.tick).toHaveBeenCalledTimes(1);
    expect(liveLoop2.tick).toHaveBeenCalledTimes(1);
    // The stepIndex passed in is 1, should also get a deltaTime and absoluteTime
    expect(liveLoop1.tick).toHaveBeenCalledWith(
      1, 
      expect.any(Number), 
      expect.any(Number)
    );
  });

  it("should ignore the highResolution flag (deprecated)", () => {
    // Rebuild the transportManager with highResolution = true
    // This flag should be ignored in the new implementation
    transportManager = new TransportManager(midiBusMock, {
      liveLoops: [liveLoop1, liveLoop2],
      pulsesPerStep: 6,
      highResolution: true, // This should be ignored
    });

    simulateMidiMessage([0xfa]); // Start
    expect(transportManager.isRunning).toBe(true);

    // Send 3 pulses (half a step)
    for (let i = 0; i < 3; i++) {
      simulateMidiMessage([0xf8]);
    }

    // We should NOT call tick for pattern logic yet (no step boundary crossed)
    // In the old implementation, this would have called tick 3 times with fractional steps
    expect(liveLoop1.tick).not.toHaveBeenCalled();
    expect(liveLoop2.tick).not.toHaveBeenCalled();

    // stepIndex still 0 because we haven't crossed a step boundary
    expect(transportManager.stepIndex).toBe(0);
    
    // Send 3 more pulses to complete the step
    for (let i = 0; i < 3; i++) {
      simulateMidiMessage([0xf8]);
    }
    
    // Now we should have called tick once at the step boundary
    expect(liveLoop1.tick).toHaveBeenCalledTimes(1);
    expect(liveLoop2.tick).toHaveBeenCalledTimes(1);
    
    // stepIndex should now be 1
    expect(transportManager.stepIndex).toBe(1);
  });

  it("should handle Song Position Pointer (0xF2) if implemented", () => {
    // By default, our code just stubs out the method, let's verify no errors thrown
    // Example: SPP => 0xF2, LSB=10, MSB=0 => position=10
    simulateMidiMessage([0xf2, 10, 0]);
    // There's no real logic in the default stub, but let's confirm it doesn't throw.
    // If you implement actual logic, you'd check that stepIndex changed accordingly.
    expect(transportManager.isRunning).toBe(false);
    // We didn't do Start, so still not running
    // This test is mostly a placeholder
  });

  it("should not tick if isRunning=false", () => {
    // By default it's not running
    simulateMidiMessage([0xf8]); // Clock pulse
    expect(transportManager.isRunning).toBe(false);
    // stepIndex should remain 0, no calls to tick
    expect(liveLoop1.tick).not.toHaveBeenCalled();
  });

  it("should increment timeInBeats by 1/24 per clock pulse", () => {
    // Start the transport
    simulateMidiMessage([0xfa]);
    expect(transportManager.timeInBeats).toBe(0.0);
    
    // Send 3 clock pulses
    simulateMidiMessage([0xf8]);
    simulateMidiMessage([0xf8]);
    simulateMidiMessage([0xf8]);
    
    // Check that timeInBeats has increased by 3/24 = 0.125
    expect(transportManager.timeInBeats).toBeCloseTo(0.125, 5);
    
    // Send 3 more pulses (total 6)
    simulateMidiMessage([0xf8]);
    simulateMidiMessage([0xf8]);
    simulateMidiMessage([0xf8]);
    
    // Check that timeInBeats has increased to 6/24 = 0.25
    expect(transportManager.timeInBeats).toBeCloseTo(0.25, 5);
  });
  
  it("should reset timeInBeats to 0 when receiving Start message", () => {
    // Start the transport
    simulateMidiMessage([0xfa]);
    
    // Send some clock pulses to increment timeInBeats
    for (let i = 0; i < 12; i++) {
      simulateMidiMessage([0xf8]);
    }
    
    // Verify timeInBeats has been incremented
    expect(transportManager.timeInBeats).toBeCloseTo(0.5, 5); // 12/24 = 0.5
    
    // Send another Start message
    simulateMidiMessage([0xfa]);
    
    // Verify timeInBeats has been reset to 0
    expect(transportManager.timeInBeats).toBe(0.0);
  });
  
  describe("Integer step boundaries", () => {
    let liveLoopWithUpdateLFO;
    
    beforeEach(() => {
      // Create mock LiveLoop with updateLFOsOnly method
      liveLoopWithUpdateLFO = { 
        tick: jest.fn(),
        updateLFOsOnly: jest.fn()
      };
      
      transportManager = new TransportManager(midiBusMock, {
        liveLoops: [liveLoopWithUpdateLFO],
        pulsesPerStep: 6
      });
      
      // Start the transport
      simulateMidiMessage([0xfa]);
    });
    
    it("should call tick only at integer step boundaries", () => {
      // Send 6 pulses (exactly 1 step)
      for (let i = 0; i < 6; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // Should have called tick exactly once at the step boundary
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledTimes(1);
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledWith(1, 0, expect.any(Number));
      
      // Send 5 more pulses (not enough for another step)
      for (let i = 0; i < 5; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // tick should still have only been called once
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledTimes(1);
      
      // Send 1 more pulse to reach the next step boundary
      simulateMidiMessage([0xf8]);
      
      // Now tick should have been called twice
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledTimes(2);
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenLastCalledWith(2, 0, expect.any(Number));
    });
    
    it("should update LFOs on every pulse for high-resolution modulation", () => {
      // Send 3 pulses (half a step)
      for (let i = 0; i < 3; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // updateLFOsOnly should have been called 3 times (once per pulse)
      expect(liveLoopWithUpdateLFO.updateLFOsOnly).toHaveBeenCalledTimes(3);
      
      // tick should not have been called yet (no step boundary crossed)
      expect(liveLoopWithUpdateLFO.tick).not.toHaveBeenCalled();
      
      // Send 3 more pulses to complete the step
      for (let i = 0; i < 3; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // updateLFOsOnly should now have been called 6 times
      expect(liveLoopWithUpdateLFO.updateLFOsOnly).toHaveBeenCalledTimes(6);
      
      // tick should have been called once at the step boundary
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledTimes(1);
    });
    
    it("should calculate step boundaries based on timeInBeats", () => {
      // Calculate step size in beats
      const stepSizeInBeats = 6 / 24; // pulsesPerStep / 24 PPQN = 0.25 beats
      
      // Send 8 pulses (a bit more than 1 step)
      for (let i = 0; i < 8; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // timeInBeats should be 8/24 = 0.333...
      expect(transportManager.timeInBeats).toBeCloseTo(8/24, 5);
      
      // We should have crossed 1 step boundary (0.333/0.25 = 1.333 => floor = 1)
      expect(transportManager.stepIndex).toBe(1);
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledTimes(1);
      
      // Send 4 more pulses to reach the next step boundary
      for (let i = 0; i < 4; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // timeInBeats should now be 12/24 = 0.5
      expect(transportManager.timeInBeats).toBeCloseTo(0.5, 5);
      
      // We should have crossed the 2nd step boundary (0.5/0.25 = 2)
      expect(transportManager.stepIndex).toBe(2);
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledTimes(2);
    });
    
    it("should handle Song Position Pointer by updating timeInBeats and stepIndex", () => {
      // SPP with position = 4 (4 MIDI beats = 4*6 = 24 pulses = 1 beat = 4 steps at 6 pulses/step)
      simulateMidiMessage([0xf2, 4, 0]); // LSB=4, MSB=0
      
      // timeInBeats should be 24/24 = 1.0
      expect(transportManager.timeInBeats).toBeCloseTo(1.0, 5);
      
      // stepIndex should be floor(1.0 / (6/24)) = floor(4) = 4
      expect(transportManager.stepIndex).toBe(4);
      
      // Send 1 pulse
      simulateMidiMessage([0xf8]);
      
      // Should have updateLFOsOnly called but not tick (not a new step boundary yet)
      expect(liveLoopWithUpdateLFO.updateLFOsOnly).toHaveBeenCalled();
      expect(liveLoopWithUpdateLFO.tick).not.toHaveBeenCalled();
      
      // Send 5 more pulses to reach a new step boundary
      for (let i = 0; i < 5; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // Now we should have crossed to step 5
      expect(transportManager.stepIndex).toBe(5);
      expect(liveLoopWithUpdateLFO.tick).toHaveBeenCalledTimes(1);
    });
    
    it("should handle LiveLoops that don't implement updateLFOsOnly", () => {
      // Create a LiveLoop without the updateLFOsOnly method
      const legacyLiveLoop = { tick: jest.fn() };
      
      transportManager = new TransportManager(midiBusMock, {
        liveLoops: [legacyLiveLoop],
        pulsesPerStep: 6
      });
      
      // Start the transport
      simulateMidiMessage([0xfa]);
      
      // Send pulses (no errors should occur due to missing updateLFOsOnly)
      for (let i = 0; i < 6; i++) {
        simulateMidiMessage([0xf8]);
      }
      
      // Should still call tick at step boundary
      expect(legacyLiveLoop.tick).toHaveBeenCalledTimes(1);
      
      // LFOs in legacy LiveLoops will only be updated at step boundaries through tick
    });
  });
});
