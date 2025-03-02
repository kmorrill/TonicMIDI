// drum-pattern.test.js
import { DrumPattern } from "../../../src/patterns/drum-pattern.js";

describe("DrumPattern automatic low/high inference", () => {
  // We'll define a fixed "medium" pattern as input for testing
  const MEDIUM_PATTERN = {
    kick: [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hh: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  };

  // Create a stable stub for Math.random so we get deterministic results:
  let originalMathRandom;
  beforeAll(() => {
    originalMathRandom = Math.random;
    // For example, always return 0.0 => that means the "random < 0.3" checks always pass or fail in a known way.
    // Let's choose something in the middle so we can see "some" changes. For instance:
    Math.random = () => 0.25;
  });

  afterAll(() => {
    // Restore original random
    Math.random = originalMathRandom;
  });

  test("should generate .low, .medium, and .high from the given medium pattern", () => {
    const drumPattern = new DrumPattern({
      mediumPattern: MEDIUM_PATTERN,
      drumMap: {
        kick: "C3",
        snare: "D3",
        hh: "F#3",
      },
      patternLength: 16,
    });

    // The DrumPattern constructor internally calls _inferLowAndHighPatterns
    // and stores them in this.patterns
    const { patterns } = drumPattern;

    // 1. Check that we indeed have 'low', 'medium', 'high' keys
    expect(patterns).toHaveProperty("low");
    expect(patterns).toHaveProperty("medium");
    expect(patterns).toHaveProperty("high");

    // 2. Check that 'medium' is exactly what we provided
    expect(patterns.medium).toEqual(MEDIUM_PATTERN);

    // 3. Check that .low and .high have the same drum names
    const drumNamesInMedium = Object.keys(MEDIUM_PATTERN).sort();
    expect(Object.keys(patterns.low).sort()).toEqual(drumNamesInMedium);
    expect(Object.keys(patterns.high).sort()).toEqual(drumNamesInMedium);

    // 4. Basic check: each pattern array is length 16
    drumNamesInMedium.forEach((drumName) => {
      expect(patterns.low[drumName]).toHaveLength(16);
      expect(patterns.medium[drumName]).toHaveLength(16);
      expect(patterns.high[drumName]).toHaveLength(16);
    });

    // 5. Some *simple* sanity checks:
    //    e.g. see that 'low' doesn't have *more* hits than 'medium'
    //    (with a fixed Math.random stub, we can reliably check this)
    const totalHits = (arr) => arr.reduce((acc, x) => acc + x, 0);

    const sumLowKick = totalHits(patterns.low.kick);
    const sumMedKick = totalHits(patterns.medium.kick);
    expect(sumLowKick).toBeLessThanOrEqual(sumMedKick);

    const sumHighHH = totalHits(patterns.high.hh);
    const sumMedHH = totalHits(patterns.medium.hh);
    // We expect high to be >= medium
    expect(sumHighHH).toBeGreaterThanOrEqual(sumMedHH);
  });

  test("getNotes() returns correct hits based on hype level", () => {
    const drumPattern = new DrumPattern({
      mediumPattern: MEDIUM_PATTERN,
      drumMap: {
        kick: "C3",
        snare: "D3",
        hh: "F#3",
      },
      patternLength: 16,
    });

    // Force hype=low
    drumPattern.setHypeLevel("low");

    // Step 0 => check if we get any hits
    const notesAtStep0 = drumPattern.getNotes(0);
    // With medium pattern's kick=1 at step 0, we expect "low" to keep it if we didn't random it away
    // Because our Math.random is 0.25, the "thinning" logic should keep it if idx%4===0
    // So we likely see a Kick note
    expect(notesAtStep0).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ note: "C3" }), // kick
      ])
    );

    // Force hype=high
    drumPattern.setHypeLevel("high");
    const notesAtStep1 = drumPattern.getNotes(1);
    // The medium pattern had 0 for kick at step 1, but we might add one in "high"
    // Because the logic tries to add hits randomly on offbeats.
    // We can just check that we don't crash and we get an array
    expect(Array.isArray(notesAtStep1)).toBe(true);
  });
});
