# Technical Design: EnergyManager (Extended)

## Overview
The **EnergyManager** is a **high-level “director”** responsible for orchestrating **arrangement changes** across your LiveLoops to reflect **shifts in energy**, such as **hype** (fullness, density) and **tension** (dissonance, anticipation). It **does not** handle transport or MIDI directly—instead, it **calls methods** on **actively playing LiveLoops** (e.g., changing patterns, muting loops, adjusting LFO parameters) to achieve a **higher or lower** energy state.

---

## Responsibilities Recap

1. **Track Desired “Hype” and “Tension”**  
   - The manager keeps a conceptual record of **hypeLevel** (e.g., `low`, `medium`, `full`) and **tensionLevel** (`none`, `medium`, `high`).

2. **Manipulate Loops & Patterns**  
   - When `setHypeLevel(...)` or `setTensionLevel(...)` is called:
     - The **EnergyManager** decides which **loops** stay active or become muted,
     - Which **patterns** get swapped (e.g., from a minimal pattern to a busy pattern),
     - Which **LFO** parameters are updated (e.g., amplitude, frequency).

3. **Coordinate Arrangements**  
   - Allows layering or thinning out of loops to reflect arrangement changes:
     - E.g., adding a **“mid-frequency pad”** loop at medium hype, or a **“bass + lead + drum fill”** loop at full hype.
   - This is consistent with references from _The Addiction Formula_, focusing on controlling the “spectrum” of highs, mids, and lows for arrangement hype.

4. **No Direct Transport or MIDI**  
   - The **TransportManager** handles Start/Stop.  
   - **MIDI** events are still sent by the **LiveLoops**.  
   - **EnergyManager** only instructs loops on *what* to play, not *when* to start or stop the transport.

---

## Detailed Behavior on `setHypeLevel` & `setTensionLevel`

### 1. `setHypeLevel(hypeLevel)`
Examples of how it **manages actively playing loops**:

1. **Adding/Removing Entire Loops**  
   - If you have multiple loops (e.g., `drumLoop`, `bassLoop`, `padLoop`, `leadLoop`):
     - **At “low” hype**: keep only `drumLoop` + `bassLoop` active. **Mute** or remove the `padLoop` and `leadLoop`.
     - **At “full” hype**: **unmute** (or add) the `padLoop` and `leadLoop` for a bigger arrangement.  

2. **Switching Patterns on Existing Loops**  
   - Some loops might have multiple patterns available (e.g., a simple vs. busy drum pattern):
     ```js
     // In setHypeLevel("full"):
     drumLoop.setPattern(fullBusyDrumPattern, immediate = true);
     bassLoop.setPattern(drivingBassPattern);
     // Possibly do the opposite for "low": set a simpler pattern
     ```
   - This effectively changes the **rhythmic density** or **voicing** of the loop.

3. **Adjusting LFOs**  
   - Raise the **frequency** or **amplitude** to create more movement:
     ```js
     melodyLoop.lfos[0].setFrequency(2.0);    // e.g., 2 cycles/beat
     melodyLoop.lfos[0].setAmplitude(1.0);    // bigger filter sweeps
     ```
   - Or **lower** them for a calmer vibe.

4. **Frequency Range & Layering**  
   - If you’re modeling the “arrangement spectrum” (high/mid/low layers), the manager decides which loops fill each range:
     - **Full Hype**: “High melodic loop,” “Mid chord pad,” and “Low bass line” all unmuted.
     - **Medium Hype**: Possibly remove the high melodic loop or mid pad.

**Immediate vs. Enqueued**  
- If your LiveLoop supports **enqueued** changes (i.e., apply at next loop boundary), the EnergyManager can choose whether changes happen right now or at the next pattern cycle:
  ```js
  drumLoop.setPattern(fullBusyDrumPattern, immediate = false);
This keeps transitions musically aligned.

### 2. `setTensionLevel(tensionLevel)`
Examples of how it manages loops & patterns to create or reduce tension:

#### Chord Progressions / Patterns
- On high tension, pick a more dissonant chord pattern or start a loop that uses V or subV chords:
  ```js
  chordLoop.setPattern(dominantDrivenChords);
  ```
- On none (no tension), revert to a stable tonic-based pattern:
  ```js
  chordLoop.setPattern(tonicCentricPattern);
  ```

#### Dropping or Thinning Out
- Remove crucial instruments or chord tones to create “implied tension”:
  - E.g., “mute the bass fundamental” or “omit the chord’s 3rd” pattern.
  ```js
  bassLoop.setPattern(noRootBassPattern); // missing fundamental
  ```
  This creates the sense that something is missing, driving tension.

#### Filtering / Partial Frequencies
- The manager can raise a high-pass filter or drop a low-pass filter in an LFO-driven loop for tension:
  ```js
  loop.lfos[1].setAmplitude(0.8); // bigger sweep
  ```
  - Or direct pattern-based approach if pattern supports filter usage

#### Avoiding Tension Release
- If the manager is guided by the rule that tension should resolve into a higher hype, it might only lower tension if hypeLevel is about to go up.
  - This ensures tension is used for building anticipation, not just dissolving into a lull.

#### EnergyManager Class Structure (Extended)

// energy-manager.js
export class EnergyManager {
  constructor({ liveLoops = [] } = {}) {
    this.liveLoops = liveLoops;
    this.currentHypeLevel = null;
    this.currentTensionLevel = null;
  }

  setHypeLevel(level) {
    this.currentHypeLevel = level;
    // Example logic
    switch (level) {
      case "full":
        // 1) Ensure all loops are unmuted or more loops are added
        // 2) Switch patterns on certain loops to "busy" versions
        // 3) Pump up LFO freq/amplitude
        break;

      case "medium":
        // Possibly remove a loop or use intermediate patterns
        break;

      case "low":
        // Mute certain loops or use minimal patterns
        break;

      // Additional levels...
      default:
        console.warn("Unknown hype level:", level);
    }
  }

  setTensionLevel(level) {
    this.currentTensionLevel = level;
    switch (level) {
      case "high":
        // Possibly remove chord fundamentals, pick a dissonant chord pattern
        // Or partially filter out mid freq => implied tension
        break;

      case "mid":
        // moderate tension approach
        break;

      case "none":
        // stable chord approach, minimal dissonance
        break;

      default:
        console.warn("Unknown tension level:", level);
    }
  }

  // Additional methods for advanced styling:
  setArrangementStyle(style) { /* ... */ }

  addLiveLoop(loop) {
    this.liveLoops.push(loop);
  }

  removeLiveLoop(loop) {
    this.liveLoops = this.liveLoops.filter(l => l !== loop);
  }
}
### Testing & Integration

#### Unit/Integration Tests

Use mocks or simplified versions of LiveLoops to confirm:

* `setHypeLevel("full")` calls e.g. `liveLoop.setPattern(...)`, `liveLoop.lfos[x].setAmplitude(...)`, or toggles loop muting.
* If your loops have an enqueued approach, confirm that immediate vs. enqueued logic is respected.
* No Direct Transport
	+ Ensure the EnergyManager never calls `transportManager.start()` or `stop()`.
	+ All changes are purely about the musical content (patterns, LFOs, etc.).
* Handling Multiple Levels
	+ If you define more granularity (e.g. “hype: 0..5”), store a config table describing each level’s arrangement. Test each level.
* Example
	+ In an integration test, you could do:
	```js
	energyManager.setHypeLevel("full");
	expect(drumLoop.setPattern).toHaveBeenCalledWith(fullDrumPattern, expect.any(Boolean));
	expect(bassLoop.lfos[0].setAmplitude).toHaveBeenCalledWith(1.0);
	```
	+ Then confirm loops produce the expected changes in subsequent ticks.

#### Summary

The EnergyManager:

* Coordinates how your LiveLoops and LFOs evolve over time to reflect changes in hype (arrangement fullness, rhythmic density, etc.) and tension (chord dissonance, missing elements, etc.).
* When `setHypeLevel(...)` or `setTensionLevel(...)` is called:
	+ Select which loops to unmute, which loops to mute, or which patterns to swap.
	+ Adjust LFO parameters for more/less intensity.
	+ Possibly do it immediately or queue for next pattern boundary.
	+ Follows music production concepts from references like The Addiction Formula, providing a central place to manipulate the overall emotional arc of a composition.
	+ This design ensures your system can programmatically and musically shift from minimal to full, from stable to tense, or anything in between, by orchestrating the loops already present in your architecture.

  # Required Updates to LiveLoops & Patterns for EnergyManager

While most core logic can remain unchanged, **some enhancements** are useful (or necessary) to fully support the EnergyManager’s goal of manipulating **hype**, **tension**, and **arrangement** in real-time. Below is a **concise list** of what might need updating or extending in **LiveLoops** and **Patterns** to accommodate EnergyManager-driven changes.

---

## 1. **LiveLoop Updates**

1. **Mute/Unmute or Volume Control**  
   - **Why**: The EnergyManager might want to **remove** or **bring back** a loop without fully deleting it.  
   - **Change**: Add a method like `liveLoop.setMuted(boolean)` or `liveLoop.setVolume(number)`:
     ```js
     // Example
     liveLoop.setMuted(true); // liveLoop internally stops calling noteOn (or sends zero velocity)
     // or sets an internal "mute" flag so no MIDI events are sent
     ```

2. **Immediate vs. Enqueued Pattern Changes**  
   - **Why**: The EnergyManager could want to swap a loop’s pattern at the **next cycle** for a clean musical transition.  
   - **Change**: Ensure `liveLoop.setPattern(newPattern, immediate=false)` (or a queue system) is well-defined so the manager can specify whether changes happen **now** or at the next pattern boundary.

3. **Additional Utility Methods**  
   - If the manager wants to do simpler actions without manually calling `setPattern(...)` or modifying LFO settings individually, we might add helper methods:
     ```js
     liveLoop.setDrumIntensity(level); // internally picks a pattern
     liveLoop.setBassRange("low"|"mid"); // chooses patterns or transposition
     ```
   - These are optional convenience layers if you foresee repeated manipulations.

4. **(Optional) Loop-Level Chord/Octave Shifts**  
   - **Why**: The manager may instruct a loop to shift up/down in pitch for more hype, or to reduce tension.  
   - **Change**: A method like `liveLoop.transpose(semitones)` or `liveLoop.setOctaveShift(n)` that instructs its pattern or note generation to shift accordingly.

---

## 2. **Pattern Updates**

Some patterns (especially **chord-based** or **dynamic** patterns) may need more flexible APIs to adapt to new **energy** states:

1. **Transposition / Octave Shifts**  
   - **Why**: Changing pitch range quickly modifies hype (higher range = more energy).  
   - **Change**: Add a method like `pattern.setTransposition(semitones)` or `pattern.setOctaveShift(octaves)`:
     ```js
     // Example
     pattern.setOctaveShift(1); // all notes move up an octave
     pattern.setTransposition(-2); // shift down 2 semitones
     ```
   - The pattern logic ensures notes are offset accordingly.

2. **Voicing / Tension Control**  
   - **Why**: A “chord provider” pattern might want to adopt “wider voicings” for higher hype, or “omit root notes” for higher tension.  
   - **Change**: Provide optional methods:
     ```js
     pattern.setVoicing("close"|"drop2"|"widened");
     pattern.setChordTensionLevel("none"|"mid"|"high");
     ```
   - Inside, the pattern calculates new chord shapes or omits certain chord tones.

3. **Changing Rhythmic Density**  
   - **Why**: The EnergyManager might request “busier” patterns for more hype or “sparser” for a laid-back feel.  
   - **Change**: Patterns may have “light,” “medium,” and “busy” rhythmic versions.  
   - One approach: store them internally, or rely on **liveLoop.setPattern()** to swap entirely.  
   - If you prefer an **internal** approach:
     ```js
     pattern.setDensity("busy");
     // internally: modifies the step array or random fill probability
     ```

4. **Parameter Hooks**  
   - **Why**: In advanced scenarios, patterns might need more context about tension/hype.  
   - **Change**: Provide a generic method:
     ```ts
     pattern.updateContext({ tension: "high", hype: "full" });
     ```
   - The pattern decides how to adapt (e.g., chord dissonance, omitted chord tones, rhythmic complexity).

5. **(Optional) Graceful “Fade”**  
   - Some patterns might fade in/out notes or do partial measure transitions. If that’s needed, the pattern can keep an internal “transition state” so changes are not abrupt.

---

## 3. Example: A “ChordPattern” That Supports Tension Changes

**Before**  
```ts
interface Pattern {
  getNotes(stepIndex: number, context?: any): NoteInfo[];
  getLength(): number;
}

### 4. Testing Considerations

#### LiveLoop

* If you add `setMuted(true)`, test that `tick()` produces no `noteOn`.
* For pattern swaps or transposition, verify changes appear in subsequent calls to `getNotes()`.

#### Patterns

* If you have methods like `setOctaveShift()`, confirm that calling them actually shifts returned notes.
* For tension methods, confirm you get more dissonant or root-omitted chords.

#### EnergyManager Integration

* Ultimately, you’d confirm that calling `energyManager.setHypeLevel("full")` triggers these newly added pattern or loop changes (via mocks or references).

### 5. Summary of Changes

In summary, to fully enable the EnergyManager’s high-level manipulations, you’ll want to:

#### LiveLoop

* Mute/Unmute or Volume control.
* Possibly a transpose or octave method if the loop manages pitch internally (otherwise, the pattern might handle it).
* Enqueued pattern changes are already supported, but confirm it’s well-documented for dynamic switching.

#### Pattern

* Ability to shift octaves or transpose semitones.
* For chord or advanced patterns: methods to switch voicings, tension levels, or density.
* (Optional) a universal approach: `pattern.updateContext({ hype, tension, … })` so the pattern can internally decide.

With these enhancements, the EnergyManager can seamlessly raise or lower hype, add or remove tension, and do so across multiple loops by programmatically calling these new methods. This architecture makes your system musically adaptive, reflecting advanced arrangement concepts in real-time.