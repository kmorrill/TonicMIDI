# Proposed Architecture for Global Harmonic and Rhythmic Communication

The proposed architecture enables global harmonic and rhythmic communication between Patterns, EnergyManager, and possibly other managers (ChordManager, Drum/RhythmManager). It ensures the following:

- You can have a master chord pattern (or manager) that other patterns listen to for harmonic context (keys, chords, tension).
- The drum track (or a dedicated “RhythmManager”) can publish the downbeat and off-beats, letting other patterns sync or react to the groove.
- The EnergyManager (orchestrator) can instruct the chord pattern (and other managers) to adjust tension or re-harmonize as needed.

Below is what to create or update in your existing codebase to realize this design.

## High-Level Approach

### Central “Song Context” or “GlobalContext”
A new object (or set of manager classes) that stores shared state about chords, tension, and rhythmic info.
Patterns can read from this context on each getNotes(stepIndex, context), letting them adapt to chord changes or rhythmic cues.

### Dedicated “ChordManager”
Maintains the chord progression (or “master chord pattern”).
Exposes methods like getChord(stepIndex) or getCurrentTension().
Responds to EnergyManager calls like setTensionLevel("high") by shifting chord qualities, adding dissonance, or transposing.

### Dedicated “RhythmManager” or “DrumTrack” Pattern
Tracks downbeats, bar lines, and maybe subdivisions.
Provides a simple method like isDownbeat(stepIndex), isOffbeat(stepIndex), or getSubdivision(stepIndex).
Other patterns (bass, melody) can adapt rhythms (like syncopation on off-beats, or strong hits on downbeat).

### Integration with LiveLoop / Patterns
LiveLoop passes a global context or chord manager reference as context to each pattern’s getNotes(stepIndex, context?).
Patterns can do:
const chord = context.chordManager.getChord(stepIndex);
const tension = context.chordManager.getTensionLevel();
const isDown = context.rhythmManager.isDownbeat(stepIndex);
// generate notes accordingly

### EnergyManager => Managers
The EnergyManager can call chordManager.setTensionLevel("high") or rhythmManager.setSubdivision("doubleTime").
The managers then propagate these changes to their internal data, which patterns read next time getNotes(...) is invoked.

## Files & Changes to Create/Update

### New Files

#### src/chord-manager.js (NEW)
Purpose: Provide a central place for chord/harmony context.

Stores a chord progression or real-time chord changes.
API:
```javascript
class ChordManager {
  setProgression(progressionsArrayOrObj) { /* ... */ }
  setTensionLevel(tension) { /* manipulates chord qualities/dissonance */ }
  getChord(stepIndex) { /* returns chord object for that step */ }
  getTensionLevel() { /* current tension (none, mid, high, etc.) */ }
}
```
#### src/rhythm-manager.js (or “drum-track.js”) (NEW)
Purpose: Central manager or pattern for rhythmic info.

Could be as simple as a pattern returning downbeats vs. offbeats:
```javascript
class RhythmManager {
  isDownbeat(stepIndex) { /* e.g. stepIndex % 16 === 0 for bar start */ }
  isOffbeat(stepIndex) { /* stepIndex % 4 === 2, etc. */ }
  setSubdivision(sub) { /* "normal", "doubleTime" => how the isDownbeat logic changes */ }
}
```
Or it could be a drum pattern that sets strong/weak beats.

#### (Optional) src/global-context.js
Purpose: If you prefer a single object that references both ChordManager and RhythmManager:
```javascript
class GlobalContext {
  constructor({ chordManager, rhythmManager }) {
    this.chordManager = chordManager;
    this.rhythmManager = rhythmManager;
    // Possibly more: energy states, tempo references, etc.
  }
}
```
Then your LiveLoops pass this GlobalContext as context. Patterns can do:

```javascript
const chord = context.chordManager.getChord(stepIndex);
const isDown = context.rhythmManager.isDownbeat(stepIndex);
```

### Updated Files

#### src/energy-manager.js
Add references to chordManager and rhythmManager (or globalContext).
On setTensionLevel("high"), call this.chordManager.setTensionLevel("high");
Potentially this.rhythmManager.setSubdivision("doubleTime"); for high hype.

#### src/live-loop.js
If you want each loop to pass a global context to the pattern, you can update:
```javascript
constructor(midiBus, { pattern, globalContext, ... } ) {
  ...
  this.globalContext = globalContext; // store
}

tick(stepIndex, deltaTime) {
  // ...
  const notes = this.pattern.getNotes(stepIndex, this.globalContext || this.context);
  ...
}
```
Or you might keep the old context property but ensure it references an object that includes chord/rhythm info:
```javascript
this.context = { chordManager: ..., rhythmManager: ..., ... };
```

#### pattern-interface.js (or your pattern docs)
Document that getNotes(stepIndex, context) may receive a context object containing:
chordManager (with getChord(stepIndex)).
rhythmManager (with isDownbeat(stepIndex), etc.).
energyState (like tension/hype level).

#### Pattern Implementations (e.g. chord-based patterns)
If you have a ChordPattern, it can do:
```javascript
getNotes(stepIndex, context) {
  const chord = context.chordManager.getChord(stepIndex);
  // build chord notes based on tension or chord type
}
```
If you have a bass or melodic pattern that needs to align with the drum’s downbeat or off-beat, it can do:
```javascript
getNotes(stepIndex, context) {
  if (context.rhythmManager.isDownbeat(stepIndex)) {
    // do something
  } else if (context.rhythmManager.isOffbeat(stepIndex)) {
    // do something else
  }
}
```
This ensures coherent arrangement across multiple tracks.

## Putting It All Together

### High-Level Flow:

- ChordManager and RhythmManager (or a single GlobalContext) are instantiated.
- EnergyManager holds references to these managers so it can set tension/hype levels.
- Each LiveLoop references the globalContext (or chord/rhythm managers) in its context.
- Patterns read from context.chordManager, context.rhythmManager when computing notes.
- Changes from EnergyManager (like chordManager.setTensionLevel("high")) take effect the next time patterns call getNotes(...).

## Example File Outline

Below is a summary of what to add/update:

```
src/
├─ chord-manager.js         // NEW: handles chord progression & tension
├─ rhythm-manager.js        // NEW: or "drum-manager.js", manages beats/ downbeats 
├─ global-context.js        // (optional) unify chordManager + rhythmManager
├─ energy-manager.js        // (UPDATE) references chordManager/rhythmManager
├─ live-loop.js             // (UPDATE) pass the context to pattern.getNotes(...),
│                           //         or store context => { chordManager, rhythmManager, ... }
├─ patterns/
│   ├─ chord-pattern.js     // (UPDATE) read chord from context.chordManager
│   ├─ ...
│   └─ other patterns       // (UPDATE) read if needed from rhythmManager or tension info
└─ ...
```

### Updated Sections:

#### energy-manager.js
```javascript
// e.g.
constructor({ liveLoops, chordManager, rhythmManager }) {
  this.liveLoops = liveLoops;
  this.chordManager = chordManager;
  this.rhythmManager = rhythmManager;
}
setTensionLevel(level) {
  this.chordManager.setTensionLevel(level);
  // Could also do rhythmic changes, e.g. this.rhythmManager.setSubdivision("doubleTime");
}
```

#### live-loop.js
```javascript
constructor(midiBus, { pattern, globalContext, ... }) {
  // ...
  this.context = globalContext; // or store chordManager, rhythmManager individually
}
tick(stepIndex, deltaTime) {
  const notes = this.pattern.getNotes(stepIndex, this.context);
  // ...
}
```

#### chord-pattern.js (or chord-based pattern)
```javascript
getNotes(stepIndex, context) {
  if (!context || !context.chordManager) return [];
  const chord = context.chordManager.getChord(stepIndex);
  // Build chord notes or handle tension
}
```

#### rhythm-manager.js
```javascript
class RhythmManager {
  isDownbeat(stepIndex) { return stepIndex % 16 === 0; } // example
  isOffbeat(stepIndex) { return stepIndex % 4 === 2; }
  // ...
}
```

### Conclusion

You’ll introduce new managers (ChordManager, RhythmManager) or a GlobalContext to hold shared state. Then:

- EnergyManager manipulates these managers to set tension/hype.
- LiveLoop passes them as part of context to each Pattern.
- Patterns read chord or rhythmic info for coherent arrangement.

Files to add or update:

- src/chord-manager.js (NEW)
- src/rhythm-manager.js (or drum-manager.js) (NEW)
- (Optional) src/global-context.js (NEW)
- src/energy-manager.js (UPDATED)
- src/live-loop.js (UPDATED)
- src/patterns/*.js (UPDATED) to read from the new context managers.

This approach allows you to scale up the complexity of chord-based tension changes and rhythmic coordination, all while integrating with your existing EnergyManager and LiveLoop architecture.