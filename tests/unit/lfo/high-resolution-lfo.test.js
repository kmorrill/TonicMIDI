/**
 * tests/unit/lfo/high-resolution-lfo.test.js
 *
 * Tests for the high-resolution LFO update feature.
 * Verifies that LFO is updated every MIDI pulse, even if we don't cross a step boundary.
 */

import { jest } from "@jest/globals";
import { LFO } from "../../../src/lfo.js";
import { TransportManager } from "../../../src/transport/transport-manager.js";
import { LiveLoop } from "../../../src/live-loop.js";

describe("High-Resolution LFO Updates", () => {
  let midiBusMock;
  let lfoMock;
  let patternMock;
  let liveLoop;
  let transportManager;

  beforeEach(() => {
    // Mock MIDI Bus
    midiBusMock = {
      on: jest.fn(),
      noteOn: jest.fn(),
      noteOff: jest.fn(),
      controlChange: jest.fn(),
      stopAllNotes: jest.fn(),
    };

    // Mock LFO with both update methods
    // In the new system, LFO returns CC values directly (0-127)
    lfoMock = {
      update: jest.fn().mockReturnValue(95), // Return CC value directly
      updateContinuousTime: jest.fn().mockReturnValue(95), // Return CC value directly
    };

    // Mock Pattern
    patternMock = {
      getNotes: jest.fn().mockReturnValue([]),
      getLength: jest.fn().mockReturnValue(4),
    };

    // Create LiveLoop with mocked LFO
    liveLoop = new LiveLoop(midiBusMock, {
      pattern: patternMock,
      lfos: [lfoMock],
      midiChannel: 1,
      role: null,
    });

    // Create TransportManager with high-resolution option enabled
    transportManager = new TransportManager(midiBusMock, {
      liveLoops: [liveLoop],
      pulsesPerStep: 6,
      highResolution: true,
    });
  });

  it("updates the LFO with updateContinuousTime when absoluteTime is provided", () => {
    // Trigger a tick with absolute time
    liveLoop.tick(1.5, 0.25, 10.0);

    // Verify updateContinuousTime was called with the absolute time
    expect(lfoMock.updateContinuousTime).toHaveBeenCalledWith(10.0);
    expect(lfoMock.update).not.toHaveBeenCalled();

    // Verify controlChange was sent with the value from updateContinuousTime
    expect(midiBusMock.controlChange).toHaveBeenCalledWith({
      channel: 1,
      cc: 74,
      value: 95, // CC value returned directly from LFO
    });
  });

  it("falls back to update method when absoluteTime is not provided", () => {
    // Trigger a tick without absolute time
    liveLoop.tick(1.5, 0.25);

    // Verify the update method was called with delta time
    expect(lfoMock.update).toHaveBeenCalledWith(0.25);
    expect(lfoMock.updateContinuousTime).not.toHaveBeenCalled();
  });

  it("calls LFO update method on every MIDI clock pulse when highResolution is enabled", () => {
    // Replace the handler to directly call the method
    const clockHandler = midiBusMock.on.mock.calls[0][1];

    // Add updateLFOsOnly method to LiveLoop for our test
    // TODO look into removing the need for this
    const updateLFOsOnlySpy = jest.fn();
    liveLoop.updateLFOsOnly = updateLFOsOnlySpy;

    // Start the transport
    transportManager._onStart();

    // Simulate 4 clock pulses (standard MIDI clock pulses)
    for (let i = 0; i < 4; i++) {
      clockHandler({ data: [0xf8] });
    }

    // After 4 pulses, updateLFOsOnly should have been called 4 times
    expect(updateLFOsOnlySpy).toHaveBeenCalledTimes(4);

    // The LFO updates should happen continuously with each pulse
    expect(updateLFOsOnlySpy).toHaveBeenNthCalledWith(
      1,
      expect.any(Number),
      1 / 24
    );
    expect(updateLFOsOnlySpy).toHaveBeenNthCalledWith(
      2,
      expect.any(Number),
      2 / 24
    );
    expect(updateLFOsOnlySpy).toHaveBeenNthCalledWith(
      3,
      expect.any(Number),
      3 / 24
    );
    expect(updateLFOsOnlySpy).toHaveBeenNthCalledWith(
      4,
      expect.any(Number),
      4 / 24
    );
  });

  it("calculates the correct deltaTime from transport timing", () => {
    // Replace the handler to directly call the method
    const clockHandler = midiBusMock.on.mock.calls[0][1];

    // Add updateLFOsOnly method to LiveLoop for our test
    // TODO look into removing the need for this
    const updateLFOsOnlySpy = jest.fn();
    liveLoop.updateLFOsOnly = updateLFOsOnlySpy;

    // Start the transport
    transportManager._onStart();

    // Simulate single clock pulse
    clockHandler({ data: [0xf8] });

    // deltaTime should be 1/24 after first pulse
    expect(transportManager.timeInBeats).toBeCloseTo(1 / 24, 5);

    // Simulate another clock pulse
    clockHandler({ data: [0xf8] });

    // Should have received a delta equal to the clock pulse time (1/24 beat)
    expect(updateLFOsOnlySpy).toHaveBeenLastCalledWith(
      expect.closeTo(1 / 24, 5),
      expect.any(Number)
    );
  });

  it("correctly accumulates time in beats between pulses", () => {
    // Replace the handler to directly call the method
    const clockHandler = midiBusMock.on.mock.calls[0][1];

    // Start the transport and reset time
    transportManager._onStart();

    // Simulate 24 pulses (1 beat)
    for (let i = 0; i < 24; i++) {
      clockHandler({ data: [0xf8] });
    }

    // TimeInBeats should be 1.0 after 24 pulses
    expect(transportManager.timeInBeats).toBeCloseTo(1.0, 5);
  });
});
