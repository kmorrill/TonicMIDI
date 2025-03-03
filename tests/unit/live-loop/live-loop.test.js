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
      noteOff: jest.fn(), // should never be called
      controlChange: jest.fn(),
    };

    // Mock Pattern
    patternMock = {
      getNotes: jest.fn(),
      getLength: jest.fn().mockReturnValue(8), // assume 8-step pattern
    };

    // Mock LFO 
    // In the new pattern, LFO directly returns the CC value (0-127)
    lfoMock = {
      update: jest.fn().mockReturnValue(63), // Return CC value directly (not wave value)
    };

    // Create a LiveLoop with defaults
    liveLoop = new LiveLoop(midiBusMock, {
      pattern: patternMock,
      lfos: [lfoMock],
      midiChannel: 1,
      context: {},
      muted: false,
      transpose: 0,
    });
  });

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
    });
    // E4 is MIDI note 64 (E in octave 4)
    expect(midiBusMock.noteOn).toHaveBeenNthCalledWith(2, {
      channel: 1,
      note: 64,
      velocity: 100, // default if not specified
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
    });
  });

  it("handles multiple LFOs", () => {
    // Add another mock LFO
    const secondLfoMock = {
      update: jest.fn().mockReturnValue(127), // Return CC value directly (not wave value)
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
    });
  });

  it("enqueued LFO changes apply at the next loop boundary", () => {
    // Add a second LFO for testing changes
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
    
    // Tick at step 1, which should trigger noteOff for the C4 note (default duration = 1)
    patternMock.getNotes.mockReturnValue([]);
    liveLoop.tick(1, 0.25);
    expect(midiBusMock.noteOff).toHaveBeenCalledWith({
      channel: 1,
      note: 60  // C4
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
      // original logic => "C4" => 60, plus transpose(2) => 62
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 62,
        velocity: 100,
      });
    });

    it("clamps transposed MIDI note within [0..127]", () => {
      // Suppose pattern returns a super high note, "C8" => 108 (stub = 60?)
      // Let's just force it to 126 in test to see if it clamps properly
      patternMock.getNotes.mockReturnValue([
        { note: "Whatever", velocity: 80 },
      ]);
      // We'll pretend convertNoteNameToMidi -> 126 in code, plus 5 => 131 => clamp => 127
      jest.spyOn(liveLoop, "_convertNoteNameToMidi").mockReturnValue(126);

      liveLoop.setTranspose(5);
      liveLoop.tick(0, 0.1);

      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 127, // clamped
        velocity: 80,
      });
    });
  });
  
  describe("activeNotes tracking", () => {
    it("adds notes to activeNotes array with default endStep (stepIndex + 1)", () => {
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80 }
      ]);
      
      liveLoop.tick(5, 0.25); // stepIndex = 5
      
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 60, // C4 is MIDI 60
        velocity: 80,
        endStep: 6, // stepIndex(5) + 1
        channel: 1
      });
    });
    
    it("uses durationSteps to calculate endStep when provided", () => {
      patternMock.getNotes.mockReturnValue([
        { note: "D4", velocity: 90, durationSteps: 4 }
      ]);
      
      liveLoop.tick(10, 0.25); // stepIndex = 10
      
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 62, // D4 is MIDI 62
        velocity: 90,
        endStep: 14, // stepIndex(10) + durationSteps(4)
        channel: 1
      });
    });
    
    it("adds multiple notes to activeNotes with correct endSteps", () => {
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 2 },
        { note: "E4", velocity: 90, durationSteps: 1 },
        { note: "G4", velocity: 100, durationSteps: 3 }
      ]);
      
      liveLoop.tick(8, 0.25); // stepIndex = 8
      
      expect(liveLoop.activeNotes).toHaveLength(3);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 60, // C4
        velocity: 80,
        endStep: 10, // stepIndex(8) + durationSteps(2)
        channel: 1
      });
      expect(liveLoop.activeNotes[1]).toEqual({
        note: 64, // E4
        velocity: 90,
        endStep: 9, // stepIndex(8) + durationSteps(1)
        channel: 1
      });
      expect(liveLoop.activeNotes[2]).toEqual({
        note: 67, // G4
        velocity: 100,
        endStep: 11, // stepIndex(8) + durationSteps(3)
        channel: 1
      });
    });
    
    it("adds notes to activeNotes even when muted", () => {
      liveLoop.setMuted(true);
      
      patternMock.getNotes.mockReturnValue([
        { note: "A4", velocity: 85, durationSteps: 2 }
      ]);
      
      liveLoop.tick(4, 0.25);
      
      // Should not send noteOn
      expect(midiBusMock.noteOn).not.toHaveBeenCalled();
      
      // But should still add to activeNotes
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 69, // A4
        velocity: 85,
        endStep: 6, // stepIndex(4) + durationSteps(2)
        channel: 1
      });
    });
    
    it("applies transpose to notes stored in activeNotes", () => {
      liveLoop.setTranspose(3); // Up 3 semitones
      
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 100, durationSteps: 2 }
      ]);
      
      liveLoop.tick(2, 0.25);
      
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 63, // C4(60) + transpose(3)
        velocity: 100,
        endStep: 4, // stepIndex(2) + durationSteps(2)
        channel: 1
      });
    });
    
    it("handles zero-step durations by immediately turning notes off", () => {
      // Set up a pattern that returns a note with zero duration
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 0 }
      ]);
      
      // Execute tick and capture noteOn/noteOff order
      liveLoop.tick(5, 0.25);
      
      // Should still send noteOn
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 60, // C4
        velocity: 80
      });
      
      // Should send noteOff immediately since endStep would be 5 (same as current step)
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60
      });
      
      // Should not keep the note in activeNotes
      expect(liveLoop.activeNotes).toHaveLength(0);
    });
    
    it("handles multiple notes with different durations across multiple steps", () => {
      // Reset activeNotes
      liveLoop.activeNotes = [];
      
      // Step 0: Add 3 notes with different durations
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 2 }, // Ends at step 2
        { note: "E4", velocity: 90, durationSteps: 3 }, // Ends at step 3
        { note: "G4", velocity: 100, durationSteps: 4 } // Ends at step 4
      ]);
      
      liveLoop.tick(0, 0.25); // stepIndex = 0
      
      // Should have 3 notes in activeNotes
      expect(liveLoop.activeNotes).toHaveLength(3);
      
      // Clear mocks for next step
      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();
      
      // Step 1: Add a new overlapping note
      patternMock.getNotes.mockReturnValue([
        { note: "D4", velocity: 85, durationSteps: 2 } // Ends at step 3
      ]);
      
      liveLoop.tick(1, 0.25); // stepIndex = 1
      
      // Should still have 4 active notes (all from steps 0 and 1)
      expect(liveLoop.activeNotes).toHaveLength(4);
      
      // Clear mocks for next step
      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();
      
      // Step 2: First note (C4) should turn off
      patternMock.getNotes.mockReturnValue([]);
      
      liveLoop.tick(2, 0.25); // stepIndex = 2
      
      // Should turn off C4
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60 // C4
      });
      
      // Should now have 3 active notes (E4, G4, D4)
      expect(liveLoop.activeNotes).toHaveLength(3);
      expect(liveLoop.activeNotes.map(n => n.note)).toEqual([64, 67, 62]); // E4, G4, D4
      
      // Clear mocks for next step
      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();
      
      // Step 3: E4 and D4 should turn off
      patternMock.getNotes.mockReturnValue([]);
      
      liveLoop.tick(3, 0.25); // stepIndex = 3
      
      // Should turn off E4 and D4
      expect(midiBusMock.noteOff).toHaveBeenCalledTimes(2);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 64 // E4
      });
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 62 // D4
      });
      
      // Should now have just 1 active note (G4)
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].note).toBe(67); // G4
      
      // Clear mocks for next step
      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();
      
      // Step 4: Last note (G4) should turn off
      patternMock.getNotes.mockReturnValue([]);
      
      liveLoop.tick(4, 0.25); // stepIndex = 4
      
      // Should turn off G4
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 67 // G4
      });
      
      // No active notes should remain
      expect(liveLoop.activeNotes).toHaveLength(0);
    });
    
    it("handles the case where same note is retriggered before its previous instance ends", () => {
      // Reset activeNotes
      liveLoop.activeNotes = [];
      
      // Step 0: Add a C4 note with 3-step duration
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 3 } // Ends at step 3
      ]);
      
      liveLoop.tick(0, 0.25); // stepIndex = 0
      
      // Should have 1 note in activeNotes
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].endStep).toBe(3);
      
      // Clear mocks for next step
      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();
      
      // Step 1: Retrigger the same C4 note with 2-step duration
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 90, durationSteps: 2 } // Ends at step 3
      ]);
      
      liveLoop.tick(1, 0.25); // stepIndex = 1
      
      // Should have turned off the previous C4 when triggering the new one
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60 // C4
      });
      
      // Should have sent a new noteOn with the new velocity
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 60, // C4
        velocity: 90
      });
      
      // Should still have 1 active note (the new C4)
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 60, // C4
        velocity: 90,
        endStep: 3, // stepIndex(1) + durationStepsOrBeats(2)
        channel: 1
      });
    });
  });
  
  describe("noteOff scheduling", () => {
    beforeEach(() => {
      // Reset the activeNotes array before each test
      liveLoop.activeNotes = [];
    });
    
    it("sends noteOff when a note's endStep is reached", () => {
      // Add a note that will expire at step 3
      liveLoop.activeNotes.push({
        note: 60, // C4
        velocity: 80,
        endStep: 3,
        channel: 1
      });
      
      // No notes from pattern on this tick
      patternMock.getNotes.mockReturnValue([]);
      
      // Tick at step 3 (equal to endStep)
      liveLoop.tick(3, 0.25);
      
      // Should send noteOff for the expired note
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60
      });
      
      // The note should be removed from activeNotes
      expect(liveLoop.activeNotes).toHaveLength(0);
    });
    
    it("sends noteOff when stepIndex exceeds a note's endStep", () => {
      // Add a note that will expire at step 5
      liveLoop.activeNotes.push({
        note: 64, // E4
        velocity: 90,
        endStep: 5,
        channel: 1
      });
      
      // No notes from pattern on this tick
      patternMock.getNotes.mockReturnValue([]);
      
      // Tick at step 6 (greater than endStep)
      liveLoop.tick(6, 0.25);
      
      // Should send noteOff for the expired note
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 64
      });
      
      // The note should be removed from activeNotes
      expect(liveLoop.activeNotes).toHaveLength(0);
    });
    
    it("keeps notes that haven't reached their endStep", () => {
      // Add a note that will expire at step 10
      liveLoop.activeNotes.push({
        note: 67, // G4
        velocity: 100,
        endStep: 10,
        channel: 1
      });
      
      // No notes from pattern on this tick
      patternMock.getNotes.mockReturnValue([]);
      
      // Tick at step 9 (less than endStep)
      liveLoop.tick(9, 0.25);
      
      // Should not send noteOff
      expect(midiBusMock.noteOff).not.toHaveBeenCalled();
      
      // The note should remain in activeNotes
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].note).toBe(67);
    });
    
    it("handles multiple notes with different endSteps", () => {
      // Add multiple notes with different endSteps
      liveLoop.activeNotes = [
        { note: 60, velocity: 80, endStep: 5, channel: 1 }, // Expires at step 5
        { note: 64, velocity: 90, endStep: 7, channel: 1 }, // Expires at step 7
        { note: 67, velocity: 100, endStep: 9, channel: 1 } // Expires at step 9
      ];
      
      // No notes from pattern on this tick
      patternMock.getNotes.mockReturnValue([]);
      
      // Tick at step 6
      liveLoop.tick(6, 0.25);
      
      // Should send noteOff for the first note only
      expect(midiBusMock.noteOff).toHaveBeenCalledTimes(1);
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60
      });
      
      // Only the expired note should be removed
      expect(liveLoop.activeNotes).toHaveLength(2);
      expect(liveLoop.activeNotes[0].note).toBe(64);
      expect(liveLoop.activeNotes[1].note).toBe(67);
      
      // Tick at step 8
      liveLoop.tick(8, 0.25);
      
      // Should send noteOff for the second note
      expect(midiBusMock.noteOff).toHaveBeenCalledTimes(2);
      expect(midiBusMock.noteOff).toHaveBeenLastCalledWith({
        channel: 1,
        note: 64
      });
      
      // Only the third note should remain
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].note).toBe(67);
    });
    
    it("correctly adds new notes and removes expired ones in the same tick", () => {
      // Add a note that will expire at step 4
      liveLoop.activeNotes.push({
        note: 60, // C4
        velocity: 80,
        endStep: 4,
        channel: 1
      });
      
      // Add new note at step 4
      patternMock.getNotes.mockReturnValue([
        { note: "E4", velocity: 90, durationSteps: 2 }
      ]);
      
      // Tick at step 4
      liveLoop.tick(4, 0.25);
      
      // Should send noteOff for the expired note
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60
      });
      
      // Should also send noteOn for the new note
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 64, // E4
        velocity: 90
      });
      
      // activeNotes should only contain the new note
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0]).toEqual({
        note: 64, // E4
        velocity: 90,
        endStep: 6, // stepIndex(4) + durationStepsOrBeats(2)
        channel: 1
      });
    });
    
    it("handles notes with 1-step duration correctly", () => {
      // No existing notes
      
      // Add a new note with explicit 1-step duration
      patternMock.getNotes.mockReturnValue([
        { note: "C4", velocity: 80, durationSteps: 1 }
      ]);
      
      // Tick at step 5
      liveLoop.tick(5, 0.25);
      
      // Should send noteOn
      expect(midiBusMock.noteOn).toHaveBeenCalledWith({
        channel: 1,
        note: 60, // C4
        velocity: 80
      });
      
      // The note should be in activeNotes with endStep = 6
      expect(liveLoop.activeNotes).toHaveLength(1);
      expect(liveLoop.activeNotes[0].endStep).toBe(6);
      
      // Clear the mock to check the next call
      midiBusMock.noteOn.mockClear();
      midiBusMock.noteOff.mockClear();
      
      // No new notes on step 6
      patternMock.getNotes.mockReturnValue([]);
      
      // Tick at step 6 (should turn off the note)
      liveLoop.tick(6, 0.25);
      
      // Should send noteOff for the 1-step note
      expect(midiBusMock.noteOff).toHaveBeenCalledWith({
        channel: 1,
        note: 60
      });
      
      // No notes should remain active
      expect(liveLoop.activeNotes).toHaveLength(0);
    });
  });
});
