# Overall Goal
Create a JavaScript, Web MIDI live-coding/library system that:
- Works with 3rd party MIDI devices like OP-XY, Polyend Synth, DigiTone, etc. It should be easy to plugin new ones by just declaring their MIDI CCs, and for drum tracks what notes correspond to what type of drum hits (e.g. kick, snare, high hat, etc.)
- Enables 3rd parties to create pattern libraries, all aimed at freeing the artist from needing to know music theory (e.g. melody patterns where you steer the contour, and they auto harmonize to the currently playing chords); all of this is inspired by sequencers like Oxi One and VSTs like Scaler and Captain Chords
- Uses live loops and enables the fun kind of coding that Sonic Pi and Tidal Cycles capture
- Offers artist control over the energy, hype and tension level, based on the ideas from The Addiction Formula
- Exposes itself with a well documented API that AI LLM agents could live code against, so an arist who doesn’t code can just give text prompts (e.g. make a techno beat on the drums; give me a moodier chord progression)
- When wiring up external gear to Live Loops you can optionally declare the synth engine name on the external device; this information can be used by LLMs to tune their suggestions; could also indicate downstream things like fx1 send is tied to reverb
- Architectural tenants:
  - Responds to an external MIDI clock (rather than being the master) and adheres to external Start/Stop.
  - Provides pluggable pattern logic (e.g., explicit note lists, contour-based auto-harmonization, algorithmic patterns).
  - Supports LFO modulation at both beat-based and Hz-based rates, without over-coupling to the MIDI or clock code.
  - Prevents stuck notes by ensuring that noteOff is consistently managed on Stop or after specified durations.
  - Maintains high testability, with each module testable in isolation (no real hardware required).
  - Enables an “energy manager” (or other high-level orchestrators) to manipulate patterns, track layering, and LFO parameters.
- Design constraints:
  - Transport control for play / stop is always managed by an external device. We never initiate play or stop. When play is sent, we start from the beginning. Upon stop we stop and trigger note off for anything playing.
  - Tempo is always managed externally. We always follow the external clock and its speed.

# High-Level Diagram
```
sql
Copy
┌───────────────┐   External MIDI   ┌───────────────┐
│External Device │  clock & messages │TransportManager│
│(Sequencer, etc.)─► [Clock, Start, │(listens to     │
│MIDI Start/Stop ] ─► [Stop, ...]   │ external MIDI) │
└───────────────┘                   └────────┬──────┘
                                            │
                                      (triggers tick 
                                      at each pulse 
                                      or step)
                                            │
                                            ▼
                               ┌─────────────────────┐
                               │      LiveLoop       │
                               │  (domain logic)     │
                               │    + Patterns       │
                               │    + LFOs           │
                               └─────────┬───────────┘
                                         │
                           Sends Note/CC | events
                                         │
                                         ▼
                                  ┌──────────┐
                                  │ MIDI Bus │
                                  │(one place│
                                  │ for note │
                                  │ on/off/CC) 
                                  └────┬─────┘
                                       │
                            Subscribes │
                                       ▼
                         ┌─────────────────────┐
                         │   Playback Engine   │
                         │  (could be real     │
                         │   MIDI out or mock) │
                         └─────────────────────┘
```

# Components & Responsibilities
1. TransportManager
   - Purpose:
     - Listen to external MIDI clock pulses (F8 messages), as well as Start (FA) and Stop (FC).
     - Convert those pulses into step increments (e.g., 16 steps per bar in 4/4) or smaller subdivisions.
     - Trigger each LiveLoop at the correct time (tick(...)) so it can produce notes or CC messages.
     - On Stop, ensure all active notes are forcibly turned off (no stuck notes).
   - Key Responsibilities:
     - Maintain a pulse counter. For example, if external clock is 24 PPQN, figure out how many pulses form one “step” (e.g., 6 pulses/step = 16 steps/bar).
     - Maintain a global step index (and possibly a bar index) that resets on Start.
     - Call liveLoop.tick(...) with the current step index or time delta.
     - Provide a way to forcibly send noteOff for all active notes on Stop. (Either directly or via the MIDI Bus.)
     - Optionally, handle “Song Position Pointer” and “Continue” messages if the external device supports them.
   - Communication:
     - Receives external MIDI clock/transport messages.
     - Calls each LiveLoop.tick(...) on the appropriate schedule.
     - Sends noteOff messages (or calls midiBus.noteOff(...)) on Stop, or if a note duration is complete in a scheduling queue.

2. LiveLoop
   - Purpose:
     - Domain object that represents a repeating musical idea (drums, bass, melody, etc.).
     - Holds a pattern plugin that can produce notes at each step, plus zero or more LFOs for parameter modulation.
     - Doesn’t handle actual MIDI scheduling directly (that’s the TransportManager’s job), but does provide durations or instructions.
   - Key Responsibilities:
     - Maintain references to:
       - A Pattern (conforming to some Pattern interface) that can say “At step X, these are the notes.”
       - One or more LFO objects that produce evolving parameter values (e.g., filter cutoff).
     - On each call to tick(...):
       - Determine which notes to play from the pattern (e.g., pattern.getNotes(stepIndex, chordContext)), including durations if needed.
       - Send noteOn events (with durations if known) to the MIDI Bus (or schedule noteOff).
       - Update each LFO, transform LFO output to a MIDI CC or other parameter value, then call midiBus.controlChange(...).
     - Provide API for EnergyManager or other orchestrators to update the pattern, set rhythmic intensity, or manipulate LFO parameters.
   - Communication:
     - Triggered by Transport Manager’s tick.
     - Sends noteOn, controlChange, (optionally noteOff) messages to MIDI Bus.
     - May query a chord manager or chord loop to get chord context.

3. Pattern (Plugin)
   - Purpose:
     - Pluggable logic that decides which notes are produced at each step, without worrying about clock pulses or MIDI specifics.
     - Examples: ExplicitNotePattern, ContourPattern, RandomPattern, etc.
   - Key Responsibilities:
     - Implement the minimal interface:
       ```ts
       interface Pattern {
         getNotes(stepIndex: number, context?: any): Array<{ note: string, durationStepsOrBeats?: number }>;
         getLength(): number; // optionally, or the live loop may store it
       }
       ```
     - Possibly use chord/harmony context to auto-harmonize.
     - Keep track of internal states (like a random seed or a pointer for an arpeggio).
   - Communication:
     - Called by the LiveLoop with a stepIndex (or bar/beat info) + optional chord context.
     - Returns an array of note objects (and possibly durations), but does not talk to the MIDI Bus directly.

4. LFO
   - Purpose:
     - Generate a parameter modulation value over time (sine, triangle, random, etc.).
     - Support beat-based frequencies (e.g., 1 cycle per bar) or Hz-based frequencies (e.g., 2 Hz).
     - Live in the domain logic so it can be unit tested without referencing hardware or a real clock.
   - Key Responsibilities:
     - Store shape, frequency, amplitude, offset, etc.
     - Provide an update(deltaTimeInSecondsOrBeats) method that returns the current wave value.
     - Start/stop logic so we can reset or halt the LFO.
   - Communication:
     - Updated each time the LiveLoop does tick(...) (which might be per step or per clock pulse).
     - Output is mapped to a 0..127 (CC) or other parameter range by the LiveLoop.
     - The LiveLoop then calls midiBus.controlChange(...) or other messages to apply the LFO effect externally.

5. MIDI Bus
   - Purpose:
     - Acts as a central hub for sending MIDI events (noteOn, noteOff, controlChange, etc.).
     - Decouples domain logic from the actual playback engine or hardware.
   - Key Responsibilities:
     - Expose methods like noteOn({ channel, note, velocity }), noteOff({ channel, note }), controlChange({ channel, cc, value }).
     - Keep track of active notes (if needed), or store a log of events for test verification.
     - Provide a subscribe mechanism so a Playback Engine (Tone.js, Web MIDI, or a mock) can respond to these events in real-time.
   - Communication:
     - Called by LiveLoops (and sometimes the Transport Manager) with high-level MIDI instructions.
     - Sends these instructions to any subscriber (the real or mock Playback Engine).

6. Playback Engine (Real or Mock)
   - Purpose:
     - Actually implement MIDI or audio output.
     - For a real scenario, might connect to Web MIDI API or Tone.js.
     - For testing, can be a mock that simply logs calls for verification.
   - Key Responsibilities:
     - Subscribe to the MIDI Bus events (noteOn, noteOff, controlChange) and produce actual audible results or hardware MIDI messages.
     - Optionally handle scheduling or timing offsets if needed, though in many cases the Transport Manager logic handles scheduling.
   - Communication:
     - Receives events from the MIDI Bus.
     - Sends actual hardware MIDI messages or triggers a software synth (Tone.js, etc.).

7. EnergyManager
   - Purpose:
     - High-level “director” that manipulates LiveLoops’ patterns, LFOs, or parameters to reflect changes in energy/hype/tension.
     - Might also layer or un-layer additional loops, trigger transitions, etc.
   - Key Responsibilities:
     - Provide an API like setHypeLevel("full"), which updates multiple loops’ patterns, transpositions, or LFO frequencies.
     - Possibly respond to user input or timeline cues to ramp tension, add layers, etc.
   - Communication:
     - Holds references to the LiveLoops.
     - Calls methods on them (setRhytmicItensity, setOctave, startLfo, setChordTensionLevel, etc.).
     - Does not communicate with the MIDI Bus or Transport Manager directly, beyond those changes.

# Interaction Flow (Example)
External Device sends MIDI Start (FA).
TransportManager:
- Resets step counters, sets isRunning = true.
- Clears any leftover active notes (avoid stuck notes).
External Device sends Clock (F8) messages 24 times per quarter note.
Each clock pulse, TransportManager:
- Increments an internal pulseCounter.
- Once pulseCounter hits 6 (or your configured ratio), we are at the next step. It resets pulseCounter, increments stepIndex, and calls liveLoop.tick(...) for each loop.
Inside liveLoop.tick(...):
- Calls the Pattern’s getNotes(stepIndex) → returns [ { note: "C4", durationStepsOrBeats: 1 }, ... ].
- Issues midiBus.noteOn(...) for those notes.
- Possibly schedules or requests noteOff in 1 step.
- Updates each LFO via lfo.update(deltaTimeInStepsOrSeconds).
- Maps LFO output to 0..127 and calls midiBus.controlChange(...) for the relevant CC.
MIDI Bus:
- Receives noteOn and controlChange calls.
- Notifies Playback Engine subscriber.
Playback Engine sends real MIDI messages or triggers software synth.
If user hits Stop on external device (FC):
TransportManager sets isRunning = false.
Calls stopAllNotes() to forcibly do midiBus.noteOff(...) on all active notes (no stuck notes).
Optionally calls lfo.stop() if we want to freeze LFO states.
EnergyManager (if in use):
- At any point, calls liveLoop.setPattern(newContourPattern(...)), or adjusts LFO frequency, changes rhythmic intensity, etc.

# Example Script
// ----- Chord Track ----- //
// Defines harmonic context with custom voicing, spread, and inversions.
const chordTrack = new ChordTrack({
  chords: [
    { chord: 'Cmaj7', voicing: 'drop2', spread: 4, inversion: 0 },
    { chord: 'Am7',   voicing: 'close', spread: 3, inversion: 1 },
    { chord: 'Dm7',   voicing: 'open',  spread: 5, inversion: 2 },
    { chord: 'G13',   voicing: 'drop2', spread: 4, inversion: 0 }
  ],
  durationBars: 4  // Each chord lasts 4 bars.
});
transportManager.registerChordTrack(chordTrack);

// ----- Drum Loop ----- //
// A single live loop using a multi-part pattern for kick, snare, and hi-hat.
const drumsLoop = new LiveLoop({
  name: 'Drum Groove',
  midiChannel: 10,
  pattern: new MultiDrumPattern({
    kick:  { note: 'C1',  pattern: [1, 0, 0, 0, 1, 0, 0, 0] },
    snare: { note: 'D1',  pattern: [0, 0, 1, 0, 0, 0, 1, 0] },
    hh:    { note: 'F#1', pattern: [1, 1, 1, 1, 1, 1, 1, 1] }
  }),
  lfos: [
    new LFO({ frequency: 1, amplitude: 10, offset: 64, shape: 'triangle' })
  ]
});

// ----- Bass Loop ----- //
// Uses a contour pattern that auto-harmonizes to the chord track.
const bassLoop = new LiveLoop({
  name: 'Bass Line',
  midiChannel: 2,
  pattern: new ContourPattern({
    contour: [0, 2, 4, 5, 7, 5, 4, 2],
    length: 8
  }),
  lfos: [
    new LFO({ frequency: 0.5, amplitude: 15, offset: 60, shape: 'sine' })
  ]
});

// ----- Melody Loop ----- //
// A contour pattern with an 'arch' shape and a fun, shorthand rhythm declaration.
const melodyLoop = new LiveLoop({
  name: 'Melody',
  midiChannel: 3,
  pattern: new ContourPattern({
    type: 'arch',  // Creates a rising then falling contour.
    contour: [0, 1, 3, 5, 7, 5, 3, 1],
    rhythm: "x - x x - x - x",  // 'x' for play, '-' for rest.
    length: 8
  }),
  lfos: [
    new LFO({ frequency: 1, amplitude: 15, offset: 64, shape: 'triangle' })
  ]
});

// Register live loops with the transport manager.
transportManager.registerLoop(drumsLoop);
transportManager.registerLoop(bassLoop);
transportManager.registerLoop(melodyLoop);

// ----- Energy Manager ----- //
// High-level controller to adjust tension, energy, and hype.
const energyManager = new EnergyManager({
  liveLoops: [drumsLoop, bassLoop, melodyLoop]
});

// Listen for bar events and dynamically update musical parameters.
transportManager.on('bar', (barNumber) => {
  if (barNumber === 4) {
    // Increase tension by ramping up the melody's LFO for more modulation.
    energyManager.setTensionLevel('high');
    melodyLoop.lfos[0].setFrequency(1.5);
    console.log(`Bar ${barNumber}: Tension increased!`);
  } else if (barNumber === 8) {
    // Ramp up hype by altering the bass contour for a driving groove.
    energyManager.setHypeLevel('full');
    bassLoop.pattern.updateContour([0, 3, 5, 7, 10, 7, 5, 3]);
    console.log(`Bar ${barNumber}: Hype level set to full!`);
  } else if (barNumber === 12) {
    // Calm the energy: lower both tension and hype.
    energyManager.setTensionLevel('low');
    energyManager.setHypeLevel('chill');
    // Reset parameters to a calmer state.
    melodyLoop.lfos[0].setFrequency(1);
    bassLoop.pattern.updateContour([0, 2, 4, 5, 7, 5, 4, 2]);
    console.log(`Bar ${barNumber}: Energy calmed down.`);
  }
});

# Testing Strategy
- Unit-Test Patterns:
  - Provide a stepIndex and optional chord context, verify the returned notes match expectations.
  - No need for clock or MIDI hardware.
- Unit-Test LFO:
  - Call update(...) with known time deltas, confirm wave shape or output range.
  - Pure logic, no external dependencies.
- Unit-Test LiveLoop:
  - Use a mock pattern returning fixed notes, a mock LFO returning a known wave value, and a mock MIDI Bus that records calls.
  - Call liveLoop.tick(...) multiple times, confirm correct noteOn and controlChange calls.
- Unit-Test TransportManager:
  - Provide a mock bus or a mock live loop.
  - Simulate “Start”, some clock pulses, “Stop.”
  - Check if it calls liveLoop.tick(...) at the right intervals and sends noteOff on stop.
- Integration Tests:
  - Combine a real pattern, real LFO, real LiveLoop, with a mock bus.
  - Run a simulated “clock” to ensure the entire chain produces expected MIDI calls.
  - Optional: For final end-to-end tests, use a Playback Engine that writes to an actual MIDI device or a virtual loopback, confirm externally that notes are correct.

# Summary
Testing Strategy
Unit-Test Patterns:
Provide a stepIndex and optional chord context, verify the returned notes match expectations.
No need for clock or MIDI hardware.
Unit-Test LFO:
Call update(...) with known time deltas, confirm wave shape or output range.
Pure logic, no external dependencies.
Unit-Test LiveLoop:
Use a mock pattern returning fixed notes, a mock LFO returning a known wave value, and a mock MIDI Bus that records calls.
Call liveLoop.tick(...) multiple times, confirm correct noteOn and controlChange calls.
Unit-Test TransportManager:
Provide a mock bus or a mock live loop.
Simulate “Start”, some clock pulses, “Stop.”
Check if it calls liveLoop.tick(...) at the right intervals and sends noteOff on stop.
Integration Tests:
Combine a real pattern, real LFO, real LiveLoop, with a mock bus.
Run a simulated “clock” to ensure the entire chain produces expected MIDI calls.
Optional: For final end-to-end tests, use a Playback Engine that writes to an actual MIDI device or a virtual loopback, confirm externally that notes are correct.

### Summary
Goal: A flexible, testable live-coding system that follows an external MIDI clock and uses pluggable patterns, LFO modulation, and a clean separation of responsibilities.
TransportManager: Converts external clock pulses to step increments, handles start/stop, ensures no stuck notes.
LiveLoop: Manages a pattern and zero or more LFOs, but does not schedule time itself—only reacts to tick(...).
Pattern: Pluggable, returns notes for each step.
LFO: Domain-level generator of parameter modulations. Updated each tick, outcome converted to MIDI CC by the loop.
MIDI Bus: Single point of contact for all note/CC events, easily mocked in tests.
Playback Engine: Subscribes to the bus to send real MIDI or trigger a synth.
EnergyManager: (Optional) orchestrates changes across multiple loops, adjusting patterns/LFOs for bigger musical form.
This architecture keeps each layer testable and avoids stuck notes by ensuring the Transport Manager and MIDI Bus have a single, consistent approach to noteOn/noteOff and forced cleanup on stop.


### Future Ideas
Ability for a pattern to react to MIDI input on another channel (e.g. control chord expression/voicing based on a MIDI track sending incoming notes from an external device)
Ability for an input box to prompt LLM and get back code that can be injected intoa  live loop
Community library of plugins that describe external MIDI devices and can be plugged in
Ability to have a heat map by octave and L/R channel of what’s going on in the song; would help energy manager marshal things;
Eventually being able to also hook up an inbound and outbound audio stream
Would have psychoacoustics it could route to an LLM to judge the sound quality that the MIDI is causing
Ability to output things like granular glitches; tape effects similar to Chase Bliss Mood pedal
Sample pattern plugin that has awareness of core sample types (e.g. percussion layer, textural ambience, hook, transition, narrative

### Problems to think about
How do we avoid conflicting signals from different patterns triggering premature midi off

Below is a recommended sequence for implementing each core component. The order is chosen so that you can test individual layers in isolation (using mocks) before you integrate them all together.

1. MIDI Bus
What it is: A central hub for sending/receiving MIDI events (noteOn, noteOff, controlChange, etc.).
Why first: Everything that outputs MIDI will eventually talk to the MIDI Bus. By building this first (plus a simple mock subscriber), you can easily test that your domain logic is sending the correct messages without worrying about actual hardware or synths.
Key tasks:
Create methods like noteOn({ channel, note, velocity }), noteOff({ channel, note }), controlChange({ channel, cc, value }).
Implement an internal event system (e.g., on('noteOn', callback)) for subscribers (the Playback Engine or a test harness).
(Optional) Maintain a record of “active notes” if you want centralized note-off logic or debugging.

2. Playback Engine (Mock First)
What it is: The component that actually sends MIDI data to hardware/software.
Why second: By having a Mock Playback Engine subscribe to the MIDI Bus, you can log all messages (for tests) and confirm correctness of the MIDI Bus. Later, you can implement a real Playback Engine (e.g., Web MIDI, Tone.js, or Node.js MIDI) without changing the domain logic.
Key tasks:
Write a minimal “MockPlaybackEngine” that subscribes to MIDI Bus events and appends them to a log.
Write tests to confirm that when you call midiBus.noteOn(...), the mock engine receives the correct event.
After your system is stable, implement a “RealPlaybackEngine” that actually sends MIDI data to devices or a software synth.

3. Pattern Interface & Basic Patterns
What it is: Encapsulated logic that decides “Which notes should play at step X?” (e.g., ContourPattern, MultiDrumPattern, RandomPattern, etc.).
Why third: Patterns are pure domain logic that can be unit-tested without worrying about real MIDI or timing. You just provide stepIndex (and possibly chord context), and verify the returned notes are correct.
Key tasks:
Define the Pattern interface:
ts
Copy
interface Pattern {
  getNotes(stepIndex: number, context?: any): Array<{ note: string, durationStepsOrBeats?: number }>;
  getLength(): number;
}


Build a few simple pattern classes:
ExplicitNotePattern (returns fixed notes for each step).
MultiDrumPattern (stores separate arrays for kick/snare/hats).
ContourPattern (creates pitch movement relative to a chord or scale).
Write unit tests for each pattern to ensure it produces the correct notes at various step indices.

4. LFO
What it is: A small domain object that generates parameter values (e.g., sine, triangle) over time, either in beats (step-based) or Hz (time-based).
Why fourth: The LFO is also mostly pure logic (like patterns) that can be tested in isolation. You’ll need it before building the LiveLoop, which calls lfo.update(...) on each tick.
Key tasks:
Create an LFO class (or interface + class) that stores frequency, amplitude, offset, shape, etc.
Implement the function to compute the current wave value in update(deltaTimeInBeatsOrSeconds).
Provide tests (e.g., feed in a known time series, verify correct wave output).

5. LiveLoop
What it is: The main domain object that:
Holds a Pattern.
Holds zero or more LFOs.
On each “tick” (from TransportManager), figures out which notes to play and which CC changes to send.
Why fifth: Now that Patterns, LFOs, and the MIDI Bus exist, you can assemble them. The LiveLoop just coordinates these pieces.
Key tasks:
Implement a LiveLoop class that has:
A reference to a pattern (implements the Pattern interface).
An array of lfo instances.
A tick(stepIndex: number) method that:
Calls pattern.getNotes(stepIndex) and sends noteOn to midiBus.
Updates each LFO and sends controlChange to midiBus.
Optionally schedules or directly triggers noteOff if you have durations.
Decide if LiveLoop stores note durations internally or you rely on the TransportManager to call noteOff. (Either approach can work, but be consistent.)
Write unit tests using the mock MIDI Bus and mock Pattern to confirm correct calls.
Update demo/index.html to use the new LiveLoop.
Discuss in the tech design approaches whereby we could in a REPL immediately update the playing live loop, and also have a separate option for enqueueing changes to be applied when the pattern next loops.

6. TransportManager
What it is: The component that listens for external MIDI clock (start/stop, clock pulses, etc.), converts pulses to “steps,” and calls each LiveLoop’s tick(stepIndex).
Why sixth: Now that you have fully testable LiveLoops, Patterns, LFOs, and the MIDI Bus, you can create the real-time scheduling piece that ties them together in sync.
Key tasks:
Implement logic to parse MIDI Start (FA) and Stop (FC).
Track clock pulses (e.g., 24 PPQN). Convert to step indices (e.g., 6 pulses per step for 16 steps per bar).
On each step, call liveLoop.tick(stepIndex).
On Stop, send noteOff for all active notes (or instruct the MIDI Bus to do so).
(Optional) Handle Song Position Pointer (F2) or Continue (FB) messages if needed.
Write tests by simulating clock pulses:
Start, pulses, step increments, ensure tick calls happen in the right order.
Stop, ensure noteOff calls happen.

7. EnergyManager (Optional / Advanced)
What it is: High-level orchestrator that manipulates LiveLoop parameters (patterns, LFO frequencies, etc.) to change energy, hype, tension, layering, etc.
Why seventh: The musical foundation is already solid. This layer just changes parameters at runtime to shape musical form.
Key tasks:
Provide an API like setTensionLevel("high") or setHypeLevel("full").
Internally calls methods on the relevant LiveLoops (e.g., liveLoop.lfos[0].setFrequency(2.0), liveLoop.setPattern(newContourPattern)).
Possibly store references to multiple LiveLoops so you can add/remove layers or switch patterns automatically.
Write integration tests that confirm the manager updates the loops as expected (still using your mock bus to see the result).

8. (Optional) Chord / Song Context Manager
What it is: If you want advanced chord-based auto-harmonization, a module that tracks chord progressions, keys, etc., and shares them with Patterns.
Why last: This is a more advanced feature that ties in after you have the core clocking, loops, and pattern systems stable.
Key tasks:
Provide an interface or event-based system so that Patterns can “ask” for the current chord/scale at step X.
Let your chord manager be updated either manually or by LFO/EnergyManager logic.

Putting It All Together
Build the MIDI Bus (plus basic tests, ensure it can log messages).
Build a Mock Playback Engine to subscribe to the bus (verifying messages).
Implement Patterns (test them with straightforward unit tests).
Implement the LFO (again, straightforward logic + unit tests).
Implement the LiveLoop (combine Patterns, LFOs, MIDI Bus).
Implement the TransportManager (tie real-time clocking to LiveLoop ticks).
(Optionally) Build an EnergyManager (to change patterns and LFO parameters on the fly).
(Optionally) Add a ChordManager or other advanced modules.
By following this order, each piece is testable in isolation, and you can confirm correctness at each layer before moving on. Once you have the whole chain, you’ll have a fully functional system that:
Responds to external Start/Stop/Clock.
Plays notes from Patterns via LiveLoops.
Modulates parameters via LFO.
And can be orchestrated by an EnergyManager or other high-level logic.

