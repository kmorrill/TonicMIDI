# AGENTS GUIDE

This repository hosts **TonicMIDI**, a browser-based generative MIDI sequencer for hardware such as the OP-XY. The project revolves around composable `LiveLoop` objects that run `Pattern`s, react to real-time energy/tension controls, and emit MIDI through a shared `MidiBus`. Use this document when ramping an autonomous agent (or human) so it understands what each subsystem does and how to extend it safely.

## Quick Facts

- **Stack**: Vite dev server, vanilla JS modules (ESM), Jest for unit tests, Web MIDI runtime in Chrome.
- **Entrypoints**: `src/index.js` exports the public API; `demo/index.html` exercises it visually.
- **Key Concepts**: `TransportManager` clocks `LiveLoop`s, which wrap a `Pattern`, routing notes to hardware via `DeviceDefinition`s and `DeviceManager`.
- **Control Surfaces**: `EnergyManager`, `GlobalContext`, `ChordManager`, and `RhythmManager` coordinate harmonic/rhythmic state; `dumpSystemState()` produces snapshots for diagnostics or AI monitoring.
- **Docs**: Run `npm run docs` to regenerate `docs/api.md` (now includes LiveLoop, LFO, EnergyManager, ChordManager, RhythmManager, GlobalContext, and flagship patterns).

## Repository Map (high value spots)

| Path | Purpose |
| --- | --- |
| `src/midi-bus.js` | Routes note/CC messages, exposes `stopAllNotes` safety. |
| `src/transport/transport-manager.js` | Listens to external MIDI clock (0xFA/0xFC/0xF8) and drives every `LiveLoop`. |
| `src/live-loop.js` | Core track abstraction: handles patterns, LFOs, chaining, note lifetimes. |
| `src/patterns/*` | Building blocks for drums, chords, melodies, chance arps, etc. All extend `BasePattern`. |
| `src/device-definition.js` & `src/device-manager.js` | Translate semantic params (`filterCutoff`) into CC numbers per hardware engine/channel. |
| `src/energy-manager.js`, `src/chord-manager.js`, `src/rhythm-manager.js`, `src/global-context.js` | Shared musical state surfaces for patterns to consult. |
| `src/dump-system-state.js` | Emits introspection data; useful for external agents driving arrangements. |
| `demo/` | Minimal UI wired to hype/tension controls and a few canonical patterns. |
| `tests/` | Jest specs (clocking, looping behavior, pattern outputs). |

## Runtime Architecture

1. **Transport Layer**
   - `TransportManager` subscribes to `MidiBus` clock events, keeps `stepIndex`, and invokes `liveLoop.tick(stepIndex)` only on integer boundaries (see `pulsesPerStep` math in `src/transport/transport-manager.js`).
   - High-resolution LFO modulation happens on every pulse via `loop.updateLFOsOnly()`.
2. **Loop Layer**
   - `LiveLoop` keeps current pattern, active notes, optional LFOs, and queue of chained sub-loops.
   - Supports context injection (local + `globalContext`) so patterns can fetch energy/chord data or talk to `DeviceManager`.
   - Auto-offloads noteOff scheduling and respects `muted`, `transpose`, and per-loop roles (`chordProvider`, `kickProvider`, etc.).
3. **Pattern Layer**
   - Patterns expose `getNotes(stepIndex, context)` plus metadata (`getLength`, `describe`, optional helpers).
   - Existing implementations cover `ColorfulChordSwell`, `EvolvingLockedDrum`, `PhraseContourMelody`, `ChanceStepArp`, `SyncopatedBass`, etc.
   - Patterns frequently ingest `EnergyManager` signals to vary density, velocities, and orchestration.
4. **Device Layer**
   - `DeviceDefinition` normalizes CC maps and per-engine overrides, plus `drumMap` lookups.
   - `DeviceManager` can auto-assign definitions by MIDI name (`findProfileClassForMidiName`) and keep track of `midiOutputId` per loop.
5. **Global Context / Energy**
   - `EnergyManager` exposes two axes: hype (energy) and tension. Patterns read those to branch.
   - `ChordManager` centralizes harmonic progressions, available chord tones, bass anchors.
   - `RhythmManager` coordinates beat emphases and swing-like offsets.
   - `GlobalContext` bundles the above so loops can share state without tight coupling.

## Demo Wiring & Controls

- `createDefaultSystem` (`src/system/create-default-system.js`) bootstraps `MidiBus`, `DeviceManager`, `TransportManager`, and builds `EnergyManager`, `ChordManager`, and `GlobalContext` references. The default demo (`demo/index.html`) calls it once, then injects `energyManager` and `chordManager` into `globalContext` so newly spawned `LiveLoop`s inherit shared state.
- Hype/tension toggles (buttons with `data-hype`/`data-tension` attributes) call `energyManager.setHypeLevel` / `setTensionLevel` directly inside the same module (`demo/index.html:497`). Patterns read the levels via `globalContext.energyManager` on their next `getNotes` call, so the DOM buttons are the only UI glue—the musical decisions stay in the library.
- The demo registers canonical loops (ColorfulChordSwell, EvolvingLockedDrum, PhraseContourMelody, SyncopatedBass, ChanceStepArp) immediately after bootstrap, assigns `role`s where needed (e.g., `chordProvider`), and adds them to the transport. This pattern is a template for agents: build loops once and steer them later through `EnergyManager` + pattern-specific config components under `src/ui/`.

## Typical Agent Workflows

1. **Run / Inspect Demo**
   ```bash
   npm install
   npm start   # opens http://localhost:5173 with Web MIDI prompts
   ```
   - Connect a clock-sending device; the UI toggles hype/tension and pattern parameters in real time.
2. **Add or Modify a Pattern**
   - Extend `BasePattern` (`src/patterns/base-pattern.js`), implement `getNotes`.
   - Use helpers from `ChordManager` or `RhythmManager` when needing harmonic context.
   - Export through `src/index.js` (patterns are re-exported there for package consumers).
   - Update demo/test coverage: drop an integration snippet in `demo/index.html` or craft a Jest spec under `tests/`.
3. **Add a Device Profile**
   - Create a new class in `src/devices/` (extend `DeviceDefinition`).
   - Populate `ccMap`, optional `engineCCMaps`, and `drumMap`.
   - Register it in `src/device-profiles.js` (`KNOWN_DEVICE_PROFILES`, `findProfileClassForMidiName`).
   - If you need named outputs in loops, ensure `deviceManager.registerOutput(midiOutputId, profileInstance)` is invoked where devices are detected (see `demo` scripts).
4. **Leverage dumpSystemState**
   - Import `dumpSystemState` from `src/dump-system-state.js`.
   - Call it to produce a JSON snapshot of active loops, energy levels, chord states, and device bindings—useful for external orchestration agents deciding on next actions.
5. **Testing**
   - `npm test` runs Jest with `--experimental-vm-modules` (needed for ES modules).
   - Focus tests on deterministic modules (pattern outputs, transport timing, energy transforms). Hardware/Web MIDI surfaces are best mocked with `MockPlaybackEngine`.
   - Specs live in `tests/unit` (per-module determinism) and `tests/integration` (Transport + LiveLoop orchestration that exercise `EnergyManager`/`ChordManager` interplay). Integration suites use `MockPlaybackEngine` to fake MIDI clock/output so they can run inside Jest without real devices.
   - CI is not wired up (no workflows in `.github/`), so local contributors must run `npm test` before publishing. Coverage is intentionally limited to pure logic; UI wiring and real Web MIDI flows still require manual demo verification after significant changes.

## Collaboration & Safety Notes

- **Clock Handling**: Transport only reacts to external Start/Stop; do not add internal timers unless you also gate them to avoid double clocks.
- **Note Safety**: Always call `midiBus.stopAllNotes()` on stop/dispose flows. The helper already exists—re-use instead of duplicating logic.
- **Re-exports**: Keep `src/index.js` authoritative; if you add files (new patterns, utilities, engines) ensure they are exported so downstream consumers and tests can access them.
- **UI vs Core**: The `demo/` folder is intentionally lightweight; avoid mixing UI state into core modules so library consumers can embed without DOM dependencies.
- **Energy/Tension Semantics**: Current patterns assume energy and tension values in `[0, 1]` buckets mapped to friendly strings (low/medium/high). Preserve that contract when adding new controls or automation surfaces.

## Open Questions / Next Steps for Agents

- Consider adding scripted scenarios (e.g., JSON playlists) so an agent can trigger arrangement changes without touching UI code.

Use this document as the starting point. When you add new subsystems (e.g., additional engines, AI co-pilots, automation scripts), append concise explanations here so future agents can orient themselves quickly.
