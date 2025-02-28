# Technical Design: Pattern Interface & Integration

## Overview
Patterns in this system are **pure domain logic** that decide **which notes** (or drum hits, events, etc.) occur at each step in a sequence. By decoupling patterns from timing and MIDI I/O, we keep them simple, testable, and extendable by **3rd party developers**.

## Core Concepts

### 1. Pattern Interface
A **Pattern** provides two methods:

1. `getNotes(stepIndex: number, context?: any): Array<PatternNote>`
   - Returns an array of notes (or hits, events) for the given step.
   - `context` can be anything—chords, keys, or user-defined data.
   - A `PatternNote` is an object containing at least `{ note: string }`; it may also include optional fields like `durationStepsOrBeats`.

2. `getLength(): number`
   - Indicates how many steps the pattern spans before it repeats.

A minimal TypeScript-like definition:

```ts
interface PatternNote {
  note: string;
  durationStepsOrBeats?: number;
}

interface Pattern {
  getNotes(stepIndex: number, context?: any): PatternNote[];
  getLength(): number;
}
Pure Logic: Patterns do not send MIDI. They only return data that can be used by a LiveLoop or other components.

2. Repository Structure
In a JavaScript project, it’s helpful to keep Patterns in a dedicated folder, such as:

src/
  patterns/
    ├─ pattern-interface.js
    └─ explicit-note-pattern.js
    // ...
pattern-interface.js
Optionally, a simple file with doc comments describing the interface (for dev reference).
In plain JS, you can’t enforce interfaces natively, but you document the required methods.
explicit-note-pattern.js (example)
Implements the interface with a hard-coded sequence of notes.
Your LiveLoop (or whichever domain logic consumes patterns) can import them:

import { ExplicitNotePattern } from '../patterns/explicit-note-pattern.js';
// ...
const pattern = new ExplicitNotePattern(["C4", "E4", "G4"]);
3. 3rd-Party Plugin Patterns
Goal: Allow developers outside this package to create and share their own patterns.

Implement the Interface
A 3rd-party pattern simply needs these methods:
class MyCoolPattern {
  getNotes(stepIndex, context) { /* ...return array of { note } ... */ }
  getLength() { /* ...return an integer... */ }
}
export default MyCoolPattern;
## Distribute / Import
Developers can distribute their pattern as an npm package or simply share the JS file.
A user can install (or drop in) the pattern code, then import it like any local pattern:
```javascript
import MyCoolPattern from 'my-cool-pattern-package';
const patternInstance = new MyCoolPattern(/* constructor params */);
```
## Usage in the System
Pass the pattern instance to the LiveLoop or any function expecting a pattern:
```javascript
liveLoop.setPattern(patternInstance);
```
Because everything references the same interface, the system knows how to call getNotes(...) and getLength() at each step.
## Optional Pattern Registry (Future Idea)
If you want an auto-discovery mechanism, create a “registry” in your app that can store pattern constructors. 3rd parties could register their patterns via a plugin API.
For now, simple imports and direct instantiation suffice.
## 4. Example: ExplicitNotePattern
Here’s a single example of a simple pattern that returns a fixed sequence of notes:

// src/patterns/explicit-note-pattern.js

export class ExplicitNotePattern {
  constructor(notesArray) {
    // e.g. notesArray = [ "C4", "E4", "G4" ]
    // You could also store them as objects: [ { note: "C4" }, ... ]
    this.notes = notesArray.map((item) =>
      typeof item === "string" ? { note: item } : item
    );
  }

  getNotes(stepIndex, context) {
    // Repeats in a loop
    const index = stepIndex % this.getLength();
    return [ this.notes[index] ];
  }

  getLength() {
    return this.notes.length;
  }
}
Testing:

import { ExplicitNotePattern } from '../../src/patterns/explicit-note-pattern.js';

describe('ExplicitNotePattern', () => {
  it('returns correct note for each step', () => {
    const pattern = new ExplicitNotePattern(["C4", "E4", "G4"]);
    expect(pattern.getNotes(0)).toEqual([{ note: "C4" }]);
    expect(pattern.getNotes(1)).toEqual([{ note: "E4" }]);
    expect(pattern.getNotes(2)).toEqual([{ note: "G4" }]);
    expect(pattern.getNotes(3)).toEqual([{ note: "C4" }]); // loops
  });
});
This shows how you can test your pattern with no dependencies on MIDI or hardware.

## Integration

LiveLoop or any scheduling mechanism calls `pattern.getNotes(stepIndex, chordData)`.
The pattern returns an array of note objects, used to generate MIDI events downstream.
No direct references to timing or I/O exist in the pattern itself, maintaining clarity and testability.

## Summary

**Interface**
A Pattern has `getNotes(stepIndex, context?)` and `getLength()`.

**Repository Organization**
Place patterns under `src/patterns/`. Keep each pattern in its own file for clarity.

**3rd Party Plugins**
External devs can create classes that satisfy the interface.
Publish or share them, then users can import and use them like any built-in pattern.

**Pure Domain Logic**
Patterns do not handle MIDI, real-time clocking, or hardware. They only return data, making them easy to unit-test and swap in/out.

This design ensures a clean, extensible approach for building and sharing patterns, allowing you (and others) to focus on musical logic rather than dealing with low-level timing or MIDI details.