/**
 * tests/unit/transport/transport-manager.test.js
 *
 * Unit tests for the TransportManager, ensuring:
 * 1) Start (0xFA) sets isRunning, resets stepIndex.
 * 2) Stop (0xFC) calls stopAllNotes.
 * 3) Clock (0xF8) accumulates pulses -> increments stepIndex at pulsesPerStep if highResolution=false.
 * 4) If highResolution=true, calls LiveLoop.tick() on every pulse as well as each step boundary if you choose.
 * 5) (Optional) Song Position Pointer sets stepIndex if implemented.
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

  it("should call tick on every pulse if highResolution=true", () => {
    // Rebuild the transportManager with highResolution = true
    transportManager = new TransportManager(midiBusMock, {
      liveLoops: [liveLoop1, liveLoop2],
      pulsesPerStep: 6,
      highResolution: true,
    });

    simulateMidiMessage([0xfa]); // Start
    expect(transportManager.isRunning).toBe(true);

    // Now let's send 3 pulses
    simulateMidiMessage([0xf8]);
    simulateMidiMessage([0xf8]);
    simulateMidiMessage([0xf8]);

    // We expect tick was called 3 times (once per pulse),
    // plus we haven't yet reached pulsesPerStep, so stepIndex hasn't advanced
    // but we do a partial call with fraction stepIndex + fraction?
    // Our code calls: fraction = pulseCounter/pulsesPerStep
    // but let's just check calls happen:
    expect(liveLoop1.tick).toHaveBeenCalledTimes(3);
    expect(liveLoop2.tick).toHaveBeenCalledTimes(3);

    // stepIndex still 0 because pulseCounter < 6
    expect(transportManager.stepIndex).toBe(0);
  });

  it("should increment stepIndex after pulsesPerStep, even if highResolution=true", () => {
    // Rebuild with highResolution = true
    transportManager = new TransportManager(midiBusMock, {
      liveLoops: [liveLoop1, liveLoop2],
      pulsesPerStep: 6,
      highResolution: true,
    });

    simulateMidiMessage([0xfa]); // start
    expect(transportManager.stepIndex).toBe(0);

    // Send 6 pulses
    for (let i = 0; i < 6; i++) {
      simulateMidiMessage([0xf8]);
    }
    // stepIndex should now be 1
    expect(transportManager.stepIndex).toBe(1);
    // We've called tick once each pulse => 6 times
    expect(liveLoop1.tick).toHaveBeenCalledTimes(6);
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
});
