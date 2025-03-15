/**
 * tests/unit/live-loop/live-loop.test.js
 *
 * Unit tests for the LiveLoop class. It should:
 * 1. Call pattern.getNotes(stepIndex) and send noteOn events (no noteOff).
 * 2. Update LFOs with deltaTime, send controlChange events.
 * 3. Handle immediate vs. enqueued pattern changes.
 * 4. Not override transport (no calls to start/stop).
 * 5. Optionally handle multiple LFOs.
 * 6. (New) Respect 'muted' and 'transpose' fields for hype/tension layering:
 *    - If muted, should not send noteOn.
 *    - If transpose != 0, should shift note values by that many semitones.
 * 7. (New) Track active notes with endStep:
 *    - Store notes with appropriate endStep in activeNotes array
 *    - Handle durations properly (using durationSteps if provided)
 *
 * (ADDITION) Also tests "chain mode": cycles, chainLiveLoop(), onChainComplete, etc.
 */

import { jest } from "@jest/globals"; // Needed for ES module jest usage
import { LiveLoop } from "../../../src/live-loop.js";

describe("LiveLoop", () => {
  let midiBusMock;
  let patternMock;
  let lfoMock;
  let liveLoop;

  beforeEach(() => {
    // Mock MIDI Bus
    midiBusMock = {
      noteOn: jest.fn(),
      noteOff: jest.fn(), // should never be called unless durations expire
      controlChange: jest.fn(),
    };

    // Mock Pattern
    patternMock = {
      getNotes: jest.fn(),
      getLength: jest.fn().mockReturnValue(8), // assume 8-step pattern
    };

    // Mock LFO
    // In this version, LFO directly returns the CC value (0-127)
    lfoMock = {
      update: jest.fn().mockReturnValue(63), // Return CC value directly
    };

    // Create a LiveLoop with defaults
    liveLoop = new LiveLoop(midiBusMock, {
      pattern: patternMock,
      lfos: [lfoMock],
      midiChannel: 1,
      context: {},
      muted: false,
      transpose: 0,
      role: null,
    });
  });

  // --------------------------------------------------------------
  // Original Tests
  // --------------------------------------------------------------

  it("calls pattern.getNotes and sends noteOn (but not noteOff)", () => {
    patternMock.getNotes.mockReturnValue([
      { note: "C4", velocity: 80 },
      { note: "E4" },
    ]);

    liveLoop.tick(0, 0.25); // stepIndex=0, deltaTime=0.25

    // Expect pattern.getNotes called with (stepIndex=0, context={})
    expect(patternMock.getNotes).toHaveBeenCalledWith(0, {});

    // Should have called noteOn for each returned note
    expect(midiBusMock.noteOn).toHaveBeenCalledTimes(2);
    // C4 is MIDI note 60
    expect(midiBusMock.noteOn).toHaveBeenNthCalledWith(1, {
      channel: 1,
      note: 60,
      velocity: 80,
      outputId: null,
    });
    // E4 is MIDI note 64
    expect(midiBusMock.noteOn).toHaveBeenNthCalledWith(2, {
      channel: 1,
      note: 64,
      velocity: 100, // default if not specified
      outputId: null,
    });

    // Verify we never call noteOff
    expect(midiBusMock.noteOff).not.toHaveBeenCalled();
  });

  it("updates the LFO and sends controlChange", () => {
    // lfoMock.update() now returns CC value 63 directly
    liveLoop.tick(1, 0.25);

    // LFO update called with deltaTime=0.25
    expect(lfoMock.update).toHaveBeenCalledWith(0.25);

    // Should send controlChange once (for single LFO)
    expect(midiBusMock.controlChange).toHaveBeenCalledTimes(1);
    expect(midiBusMock.controlChange).toHaveBeenCalledWith({
      channel: 1,
      cc: 74,
      value: 63, // CC value returned directly from LFO
      outputId: null,
    });
  });

  it("handles multiple LFOs", () => {
    // Add another mock LFO
    const secondLfoMock = {
      update: jest.fn().mockReturnValue(127), // Return CC value
    };
    liveLoop.addLFO(secondLfoMock);

    // call tick
    liveLoop.tick(0, 0.1);

    // First LFO
    expect(lfoMock.update).toHaveBeenCalledWith(0.1);
    // Second LFO
    expect(secondLfoMock.update).toHaveBeenCalledWith(0.1);

    // Should have two controlChange calls
    expect(midiBusMock.controlChange).toHaveBeenCalledTimes(2);

    // The second LFO returns CC value 127 directly
    expect(midiBusMock.controlChange).toHaveBeenNthCalledWith(2, {
      channel: 1,
      cc: 74,
      value: 127,
      outputId: null,
    });
  });

  it("immediate pattern change takes effect on the next tick", () => {
    // Original pattern - C4 is MIDI note 60
    patternMock.getNotes.mockReturnValue([{ note: "C4" }]);
    liveLoop.tick(0, 0.25);
    expect(midiBusMock.noteOn).toHaveBeenCalledTimes(1);

    // New pattern - G4 is MIDI note 67
    const newPatternMock = {
      getNotes: jest.fn().mockReturnValue([{ note: "G4", velocity: 90 }]),
      getLength: jest.fn().mockReturnValue(4),
    };

    // Immediate update
    liveLoop.setPattern(newPatternMock, true);

    liveLoop.tick(1, 0.25);
    // newPatternMock should be called now
    expect(newPatternMock.getNotes).toHaveBeenCalledWith(1, {});
    expect(midiBusMock.noteOn).toHaveBeenLastCalledWith({
      channel: 1,
      note: 67,
      velocity: 90,
      outputId: null,
    });
  });

  it("enqueued pattern change applies at the next pattern boundary", () => {
    // stepIndex=0 => normal pattern
    patternMock.getNotes.mockReturnValue([{ note: "C4" }]);
    liveLoop.tick(0, 0.25);
    expect(midiBusMock.noteOn).toHaveBeenCalledTimes(1);

    // F4 is MIDI note 65
    const newPatternMock = {
      getNotes: jest.fn().mockReturnValue([{ note: "F4", velocity: 70 }]),
      getLength: jest.fn().mockReturnValue(8),
    };

    // Queue the change (immediate=false)
    liveLoop.setPattern(newPatternMock, false);

    // old pattern from steps 1..7 (E4 is MIDI note 64)
    patternMock.getNotes.mockReturnValue([{ note: "E4" }]);
    for (let s = 1; s < 8; s++) {
      liveLoop.tick(s, 0.25);
    }
    // Not yet switched
    expect(newPatternMock.getNotes).not.toHaveBeenCalled();

    // Next tick at step=8 => boundary => switch
    liveLoop.tick(8, 0.25);
    expect(newPatternMock.getNotes).toHaveBeenCalledWith(8, {});
    expect(midiBusMock.noteOn).toHaveBeenLastCalledWith({
      channel: 1,
      note: 65,
      velocity: 70,
      outputId: null,
    });
  });

  it("enqueued LFO changes apply at the next loop boundary", () => {
    // Add a second LFO
    const secondLfoMock = { update: jest.fn().mockReturnValue(-0.5) };
    liveLoop.addLFO(secondLfoMock);

    // call tick => old amplitude or settings
    liveLoop.tick(0, 0.1);
    expect(secondLfoMock.update).toHaveBeenCalledWith(0.1);

    // Enqueue LFO update
    liveLoop.updateLFO(1, { amplitude: 2.0 }, false);

    // steps 1..7 => no boundary => old amplitude
    for (let s = 1; s < 8; s++) {
      liveLoop.tick(s, 0.1);
    }

    // stepIndex=8 => boundary => apply queued LFO update
    liveLoop.tick(8, 0.1);
    expect(secondLfoMock.update).toHaveBeenCalledWith(0.1);
  });

  it("only calls noteOff when a note's endStep is reached", () => {
    patternMock.getNotes.mockReturnValue([{ note: "C4" }]);
    liveLoop.tick(0, 0.25);
    // No noteOff for a new note
    expect(midiBusMock.noteOff).not.toHaveBeenCalled();

    // Tick at step 1 => should trigger noteOff for C4 (default duration = 1)
    patternMock.getNotes.mockReturnValue([]);
    liveLoop.tick(1, 0.25);
    expect(midiBusMock.noteOff).toHaveBeenCalledWith({
      channel: 1,
      note: 60, // C4
      outputId: null,
    });
  });

  it("does not start/stop transport internally", () => {
    expect(midiBusMock.start).toBeUndefined();
    expect(midiBusMock.stop).toBeUndefined();
  });

  describe("muted behavior", () => {
    it("does not send noteOn when muted is true", () => {
      // Turn on muted
      liveLoop.setMuted(true);

      patternMock.getNotes.mockReturnValue([{ note: "C4" }]);
      liveLoop.tick(0, 0.25);

      expect(patternMock.getNotes).toHaveBeenCalledWith(0, {});
      // But no noteOn calls
      expect(midiBusMock.noteOn).not.toHaveBeenCalled();
    });

    it("unmutes and sends notes again", () => {
      liveLoop.setMuted(true);

      patternMock.getNotes.mockReturnValue([{ note: "C4" }]);
      liveLoop.tick(0, 0.25);
      expect(midiBusMock.noteOn).not.toHaveBeenCalled();

      // Now unmute
      liveLoop.setMuted(false);
      liveLoop.tick(1, 0.25);
      expect(midiBusMock.noteOn).toHaveBeenCalledTimes(1);
    });
  });

  describe("transpose behavior", () => {
    it("shifts note pitch by transpose amount", () => {
      patternMock.getNotes.mockReturnValue([{ note: "C4", velocity: 100 }]);
      // Set transpose up 2 semitones
      liveLoop.setTranspose(2);

      liveLoop.tick(0, 0.25);
      // "C4" => 60, plus transpose(2) => 62
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 62,
        velocity: 100,
        outputId: null,
      });
    });

    it("clamps transposed MIDI note within [0..127]", () => {
      // Force _convertNoteNameToMidi to return 126
      jest.spyOn(liveLoop, "_convertNoteNameToMidi").mockReturnValue(126);

      patternMock.getNotes.mockReturnValue([{ note: "??", velocity: 80 }]);
      liveLoop.setTranspose(5);
      liveLoop.tick(0, 0.1);

      // 126 + 5 => 131 => clamp => 127
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 127,
        velocity: 80,
        outputId: null,
      });
    });
  });

  describe("activeNotes tracking", () => {
    it("adds notes to activeNotes array with default endStep (stepIndex + 1)", () => {
      patternMock.getNotes.mockReturnValue([{ note: "C4", velocity: 80 }]);

      liveLoop.tick(5, 0.25);

      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 60,
        velocity: 80,
        endStep: 6,
        channel: 1,
      });
    });

    it("uses durationSteps to calculate endStep when provided", () => {
      patternMock.getNotes.mockReturnValue([
        { note: "D4", velocity: 90, durationSteps: 4 },
      ]);

      liveLoop.tick(10, 0.25);

      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 62,
        velocity: 90,
        endStep: 14,
        channel: 1,
      });
    });

    it("adds multiple notes to activeNotes with correct endSteps", () => {
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 2 },
        { note: "E4", velocity: 90, durationSteps: 1 },
        { note: "G4", velocity: 100, durationSteps: 3 },
      ]);

      liveLoop.tick(8, 0.25);

      expect(liveLoop.activeNotes).toHaveLength(3);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 60,
        velocity: 80,
        endStep: 10, // 8 + 2
        channel: 1,
      });
      expect(liveLoop.activeNotes[1]).toEqual({
        note: 64,
        velocity: 90,
        endStep: 9, // 8 + 1
        channel: 1,
      });
      expect(liveLoop.activeNotes[2]).toEqual({
        note: 67,
        velocity: 100,
        endStep: 11, // 8 + 3
        channel: 1,
      });
    });

    it("adds notes to activeNotes even when muted", () => {
      liveLoop.setMuted(true);

      patternMock.getNotes.mockReturnValue([
        { note: "A4", velocity: 85, durationSteps: 2 },
      ]);

      liveLoop.tick(4, 0.25);
      // no noteOn
      expect(midiBusMock.noteOn).not.toHaveBeenCalled();

      // still adds to activeNotes
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 69, // A4
        velocity: 85,
        endStep: 6, // 4 + 2
        channel: 1,
      });
    });

    it("applies transpose to notes stored in activeNotes", () => {
      liveLoop.setTranspose(3); // up 3 semitones

      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 100, durationSteps: 2 },
      ]);

      liveLoop.tick(2, 0.25);

      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 63, // C4(60) + 3
        velocity: 100,
        endStep: 4,
        channel: 1,
      });
    });

    it("handles zero-step durations by immediately turning notes off", () => {
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 0 },
      ]);

      liveLoop.tick(5, 0.25);

      // noteOn
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        velocity: 80,
        outputId: null,
      });
      // immediate noteOff
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(0);
    });

    it("handles multiple notes with different durations across multiple steps", () => {
      liveLoop.activeNotes = [];

      // Step 0: 3 notes
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 2 }, // ends step 2
        { note: "E4", velocity: 90, durationSteps: 3 }, // ends step 3
        { note: "G4", velocity: 100, durationSteps: 4 }, // ends step 4
      ]);

      liveLoop.tick(0, 0.25);
      expect(liveLoop.activeNotes).toHaveLength(3);

      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();

      // Step 1: add a new note
      patternMock.getNotes.mockReturnValue([
        { note: "D4", velocity: 85, durationSteps: 2 }, // ends step 3
      ]);
      liveLoop.tick(1, 0.25);
      expect(liveLoop.activeNotes).toHaveLength(4);

      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();

      // Step 2 => C4 ends
      patternMock.getNotes.mockReturnValue([]);
      liveLoop.tick(2, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(3);

      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();

      // Step 3 => E4 & D4 end
      liveLoop.tick(3, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledTimes(2);
      expect(liveLoop.activeNotes).toHaveLength(1); // G4 remains

      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();

      // Step 4 => G4 ends
      liveLoop.tick(4, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 67,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(0);
    });

    it("handles the case where same note is retriggered before its previous instance ends", () => {
      liveLoop.activeNotes = [];

      // Step 0: add C4, ends step 3
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 3 },
      ]);
      liveLoop.tick(0, 0.25);
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].endStep).toBe(3);

      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();

      // Step 1: retrigger C4, ends step 3
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 90, durationSteps: 2 },
      ]);
      liveLoop.tick(1, 0.25);

      // Should have noteOff for the old C4
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        outputId: null,
      });
      // Then noteOn for the new C4
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        velocity: 90,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 60,
        velocity: 90,
        endStep: 3,
        channel: 1,
      });
    });
  });

  describe("noteOff scheduling", () => {
    beforeEach(() => {
      liveLoop.activeNotes = [];
    });

    it("sends noteOff when a note's endStep is reached", () => {
      // expires at step 3
      liveLoop.activeNotes.push({
        note: 60,
        velocity: 80,
        endStep: 3,
        channel: 1,
      });
      patternMock.getNotes.mockReturnValue([]);

      liveLoop.tick(3, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(0);
    });

    it("sends noteOff when stepIndex exceeds a note's endStep", () => {
      // expires at step 5
      liveLoop.activeNotes.push({
        note: 64,
        velocity: 90,
        endStep: 5,
        channel: 1,
      });
      patternMock.getNotes.mockReturnValue([]);

      liveLoop.tick(6, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 64,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(0);
    });

    it("keeps notes that haven't reached their endStep", () => {
      // expires at step 10
      liveLoop.activeNotes.push({
        note: 67,
        velocity: 100,
        endStep: 10,
        channel: 1,
      });
      patternMock.getNotes.mockReturnValue([]);

      liveLoop.tick(9, 0.25);
      expect(midiBusMock.noteOff).not.toHaveBeenCalled();
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].note).toBe(67);
    });

    it("handles multiple notes with different endSteps", () => {
      liveLoop.activeNotes = [
        { note: 60, velocity: 80, endStep: 5, channel: 1 },
        { note: 64, velocity: 90, endStep: 7, channel: 1 },
        { note: 67, velocity: 100, endStep: 9, channel: 1 },
      ];
      patternMock.getNotes.mockReturnValue([]);

      // step=6 => note 60 ends
      liveLoop.tick(6, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledTimes(1);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(2);

      // step=8 => note 64 ends
      liveLoop.tick(8, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledTimes(2);
      expect(midiBusMock.noteOff).toHaveBeenLastCalledWith({
        channel: 1,
        note: 64,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].note).toBe(67);
    });

    it("correctly adds new notes and removes expired ones in the same tick", () => {
      // note that will expire at step=4
      liveLoop.activeNotes.push({
        note: 60,
        velocity: 80,
        endStep: 4,
        channel: 1,
      });

      patternMock.getNotes.mockReturnValue([
        { note: "E4", velocity: 90, durationSteps: 2 },
      ]);

      liveLoop.tick(4, 0.25);

      // noteOff for old note
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        outputId: null,
      });
      // noteOn for new note
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 64,
        velocity: 90,
        outputId: null,
      });

      // only the new note remains
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 64,
        velocity: 90,
        endStep: 6,
        channel: 1,
      });
    });

    it("handles notes with 1-step duration correctly", () => {
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 1 },
      ]);

      liveLoop.tick(5, 0.25);

      // noteOn
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        velocity: 80,
        outputId: null,
      });
      expect(liveLoop.activeNotes[0].endStep).toBe(6);

      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();

      // step=6 => the 1-step note ends
      patternMock.getNotes.mockReturnValue([]);
      liveLoop.tick(6, 0.25);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60,
        outputId: null,
      });
      expect(liveLoop.activeNotes).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------
  // New Chain-Mode Tests
  // --------------------------------------------------------------

  // Helper for chain tests only
  function doOneCycle(loop, length = 4) {
    for (let s = 0; s < length; s++) {
      loop.tick(s, 0.25);
    }
  }

  describe("chain mode", () => {
    let chainPatternA;
    let chainPatternB;
    let chainPatternC;
    let chainLoop;

    beforeEach(() => {
      chainPatternA = {
        getLength: jest.fn().mockReturnValue(4),
        getNotes: jest.fn().mockReturnValue([{ note: "C4", velocity: 70 }]),
      };
      chainPatternB = {
        getLength: jest.fn().mockReturnValue(4),
        getNotes: jest.fn().mockReturnValue([{ note: "E4", velocity: 80 }]),
      };
      chainPatternC = {
        getLength: jest.fn().mockReturnValue(4),
        getNotes: jest.fn().mockReturnValue([{ note: "G4", velocity: 90 }]),
      };

      chainLoop = new LiveLoop(midiBusMock, {
        pattern: chainPatternA,
        midiChannel: 1,
        cycles: 2, // triggers chain mode for patternA
        role: null,
      });
    });

    it("plays the initial pattern for 'cycles' times, then mutes if no chainLiveLoop calls", () => {
      // patternA => length=4, cycles=2
      // do cycle #1 and cycle #2
      doOneCycle(chainLoop, 4);
      doOneCycle(chainLoop, 4);
      expect(chainLoop.muted).toBe(true);
    });

    it("moves on to next chain item when cycles are done", () => {
      chainLoop.chainLiveLoop({ pattern: chainPatternB, cycles: 3 });

      // A => cycles=2
      doOneCycle(chainLoop, 4);
      doOneCycle(chainLoop, 4);
      // should now be on B
      const outB = chainLoop.pattern.getNotes(0, {});
      expect(outB).toEqual([{ note: "E4", velocity: 80 }]);

      // B => cycles=3
      doOneCycle(chainLoop, 4);
      doOneCycle(chainLoop, 4);
      doOneCycle(chainLoop, 4);
      // no more chain => muted
      expect(chainLoop.muted).toBe(true);
    });

    it("can chain multiple items in a single expression", () => {
      chainLoop
        .chainLiveLoop({ pattern: chainPatternB, cycles: 1 })
        .chainLiveLoop({ pattern: chainPatternC, cycles: 2 });

      // A => cycles=2
      doOneCycle(chainLoop, 4);
      doOneCycle(chainLoop, 4);
      // now on B
      const outB = chainLoop.pattern.getNotes(0, {});
      expect(outB).toEqual([{ note: "E4", velocity: 80 }]);

      // B => cycles=1
      doOneCycle(chainLoop, 4);
      // now on C
      const outC = chainLoop.pattern.getNotes(0, {});
      expect(outC).toEqual([{ note: "G4", velocity: 90 }]);

      // C => cycles=2
      doOneCycle(chainLoop, 4);
      doOneCycle(chainLoop, 4);
      expect(chainLoop.muted).toBe(true);
    });

    it("calls onChainComplete after final item", () => {
      const onCompleteMock = jest.fn();
      chainLoop.chainLiveLoop({ pattern: chainPatternB, cycles: 1 });
      chainLoop.onChainComplete(onCompleteMock);

      // A => cycles=2
      doOneCycle(chainLoop, 4);
      doOneCycle(chainLoop, 4);
      // B => cycles=1
      doOneCycle(chainLoop, 4);

      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(chainLoop.muted).toBe(true);
    });

    it("works if user didn't specify cycles in constructor but calls chainLiveLoop anyway", () => {
      // DUMMY pattern
      const dummyPattern = {
        getLength: jest.fn().mockReturnValue(4),
        getNotes: jest.fn().mockReturnValue([]),
      };
      const altLoop = new LiveLoop(midiBusMock, {
        pattern: dummyPattern,
        midiChannel: 1,
        // no cycles => not in chain mode yet
        role: null,
      });

      // chain items: first is A, second is B
      altLoop.chainLiveLoop({ pattern: chainPatternA, cycles: 1 });
      altLoop.chainLiveLoop({ pattern: chainPatternB, cycles: 2 });

      // 1) doOneCycle => finishes dummy => move to patternA
      doOneCycle(altLoop, 4);

      // 2) patternA => 1 cycle
      doOneCycle(altLoop, 4);
      // now we should be on B
      const outB = altLoop.pattern.getNotes(0, {});
      expect(outB).toEqual([{ note: "E4", velocity: 80 }]);

      // 3) patternB => 2 cycles
      doOneCycle(altLoop, 4);
      doOneCycle(altLoop, 4);
      expect(altLoop.muted).toBe(true);
    });
  });
});
