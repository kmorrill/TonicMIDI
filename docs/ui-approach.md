## OP-XY CC Prototype: UI Philosophy

Prototype entry: [`/opxy-cc-prototype.html`](../demo/opxy-cc-prototype.html) — run locally via `npm start` and open `http://localhost:5173/opxy-cc-prototype.html`.

### Overview

A two-layer control surface designed for fast, *momentary* navigation:

1. **State A – Track + Piano Map (default).**
   - A row of eight track buttons (OP-XY tracks 1–8) anchors the top. They’re large, red-armed toggles sized for mobile touches and desktop clicks.
   - If a track is unmapped, tapping its button opens a plugin picker (Chord Swell, Evolving Drums, Contour Melody, Syncopated Bass, Chance Arp). This “plugin mode” shows only the selector; the modal closes immediately once a plugin is chosen.
   - Re-opening a mapped track presents the “control mode”: large mute/solo buttons plus a chunky volume slider sized for touch. Buttons reflect the assignment (`Track 3 · Contour Melody`). The same states are scriptable via `window.opxyCCPrototype.setTrackState(trackId, { plugin, muted, solo, volume })`.
   - F2 → E4 laid out as a wide, glowing keyboard.
   - Each key has a short lorem-ipsum label; the key is the navigation index.
   - Footer reminder: “Hold a key to reveal encoder assignments.”
2. **State B – Encoder Peek View (latched while a key is held).**
   - Piano disappears; we see:
     - A pill showing the active key (e.g., `A3 · Lorem Ipsum Dolor`).
     - Eight encoder cards (CC100–107) with radial meters, titles, and descriptions.
     - A mini keyboard in the lower-left highlighting the pressed key.

Releasing the key always snaps back to State A. Holding a key keeps the peek view alive, mirroring the feel of “momentary layers” on hardware controllers.

### Interaction Model

| Gesture | Result |
| --- | --- |
| Mouse/touch *down* on a key | Piano map → Encoder view for that key. |
| Keep holding | Stay in encoder view; tweak CCs. |
| Mouse/touch *up* | Encoder view → Piano map. |

The primary interaction is **press and hold**, not click-to-enter/click-to-exit, so exploration is low-friction.

### Encoder Cards

* Eight symmetric modules (one per CC 100–107).
* Radial meter shows the current value; percent text updates live.
* Title + description are per-key (placeholder lorem ipsum today), so every key feels like “its own scene” with named encoders.
* Web MIDI listeners update the meters when CC100–107 arrive on channel 11 (zero-index 10). The UI also exposes `window.opxyCCPrototype.setCCValue(note, cc, value)` for testing.

### Mini Keyboard “You Are Here” Locator

* Persistent UI anchored in the bottom-left.
* Mirror of the two-octave layout; active keys glow.
* Helps keep orientation when you’re deep in the encoder view.

### Chordable Extensions

This prototype is a staging area for a **key + chord** workflow:

* **Base key (held)** = context (which scene we’re editing).
* **Chorded keys while holding** = commands on that context:
  * Black keys / number-like gestures can trigger macros (randomize, snapshot, lock, copy/paste).
  * White-key chords can select one of the eight encoder modules, flip device-specific banks, or set sub-modes.
* **Encoders** always modify the currently focused module for the currently held key.

The mental model: the piano is both a spatial index and a chorded command palette. You move through contexts by holding different keys, and you perform actions on that context by chording additional keys before letting go.

### Summary

* Piano map shows the universe of scenes.
* Press-and-hold swaps into a bespoke control surface for that key.
* Encoder cards expose CC100–107 with per-key labels and meters.
* Mini piano, chord plan, and momentary navigation keep you oriented and fast.
