TonicMIDI
================

A browser-based MIDI sequencer and pattern library designed to control hardware instruments (such as the OP-XY). It focuses on generative and evolving music concepts—like chord swells, evolving drum lines, and melodic phrases—that respond to energy/tension changes in real time.

### Features

* **Device Definitions**: Quickly map CCs, note layouts, and engines on various synth/drum hardware. Easy to add plugins for any missing devices.
* **LiveLoop Structures**: Orchestrate patterns on a step-by-step basis, in sync with an external MIDI clock. Inspired by Live Loops from Sonic Pi.
* **Patterns**: Includes chord swells, evolving drums, chance-based ARPs, syncopated bass lines, and phrase-based melodies. Patterns can provide harmony or beat signal, and other can follow to harmonize and drive with the beat.
* **Energy & Tension Managers**: Morph the vibe of an entire jam with a couple of parameters. Patterns and Live Loops wire up to signals you send through the energy manager.
* **UI Demo**: Real-time controls for chord color, drum flavor, phrase shape, hype/tension toggles, and LFO modules.

This is a playground for advanced generative concepts and quick device setups. Feel free to submit PRs, and I will try to merge in anything reasonable. Also feel free to fork. It's MIT license.

### Table of Contents

* [Project Overview](#project-overview)
* [Quick Setup and Development](#quick-setup-and-development)
* [Repo Structure](#repo-structure)
* [Key Concepts](#key-concepts)
* [LiveLoop & Patterns](#live-loop--patterns)
* [Device Definitions](#device-definitions)
* [Energy & Tension](#energy--tension)
* [Transport & External Clock](#transport--external-clock)
* [dumpSystemState()](#dump-system-state)
* [Usage Demo](#usage-demo)
* [Extending the Library](#extending-the-library)
* [Credits & Inspiration](#credits--inspiration)

### Project Overview

TonicMIDI consists of JavaScript modules that:

* Generate musical patterns (drums, chords, melodies) on every step.
* Sync with an external MIDI clock.
* Handle real-time changes in “energy/hype” and “tension/dissonance”.
* Provide DeviceDefinition classes to map MIDI CCs and notes for hardware.
* Runs in a browser (Chrome recommended) with Web MIDI.

### Quick Setup and Development

1. **Clone and Install Dependencies**

    ```
    git clone https://github.com/kmorrill/TonicMIDI.git
    cd tonicmidi
    npm install
    ```

2. **Run the Dev Server**

    ```
    npm start
    ```

    Open http://localhost:5173/ in Chrome.

3. **MIDI Setup**

    * Connect your hardware via USB MIDI.
    * Ensure it sends MIDI clock.
    * Approve Web MIDI access in your browser.
    * Check the console logs for device detection.

4. **Build for Production (Optional)**

    ```
    npm run build
    ```

    Creates a dist/ folder for deployment.

### Repo Structure

* `tonicmidi/`
    * `demo/`
        + `index.html`   # Demo UI
    * `src/`
        * `devices/`     # DeviceDefinition subclasses
        * `patterns/`    # Patterns (Chord Swells, Drums, etc.)
        * `transport/`   # TransportManager for MIDI clock sync
        * `system/`      # High-level system setup
        * `energy-manager.js`
        * `live-loop.js`
        * `midi-bus.js`
        * `index.js`     # Main exports
    * `package.json`
    * `README.md`

### Key Concepts

### LiveLoop & Patterns

A LiveLoop:

* Holds a Pattern (e.g., chord progression, drum sequence).
* Responds to each tick() from the TransportManager.
* Sends noteOn/noteOff events via MidiBus.

Patterns must implement:

* `getNotes(stepIndex, context) => array of notes`
* `getLength() => step count before repeating`

### Device Definitions

A DeviceDefinition:

* Maps MIDI CCs to filter cutoff, envelopes, etc.
* Maps drum notes to MIDI note numbers.
* Supports multiple engines across channels.
* Pass a DeviceManager when creating a LiveLoop to translate CC names into MIDI values.

### Energy & Tension

The EnergyManager influences patterns by:

* Increasing note density/velocity at high energy.
* Adding dissonant intervals/chord extensions at high tension.
* Adjust settings live (e.g., "Hype=High", "Tension=Mid") to dynamically shape a performance.

### Transport & External Clock

The TransportManager:

* Listens for external MIDI clock messages (0xF8, 0xFA, 0xFC).
* Increments stepIndex every pulsesPerStep pulses.
* Calls tick(stepIndex) on all LiveLoops.
* Sends stopAllNotes() to prevent stuck notes.

### dumpSystemState()

A utility function that returns a JSON snapshot of:

* Active loops and patterns
* LFO states
* Chord manager data
* Device mappings

Useful for AI-assisted composition or scripting systems that propose real-time changes.

### Usage Demo

The demo/index.html references three main patterns:

* ColorfulChordSwellPattern
* EvolvingLockedDrumPattern
* PhraseContourMelody

UI Controls include:

* Hype levels (low/medium/high)
* Tension levels (none/low/mid/high)
* Pattern-specific parameters (chord complexity, drum style, etc.)

### Extending the Library

* **Add Your Own Device**:
    + Create a subclass of DeviceDefinition.
    + Fill in MIDI CC mappings and drum note numbers.
    + Add a New Pattern:
        - Extend BasePattern.
        - Implement:
            + `getNotes(stepIndex, context)`
            + `getLength()`
        - Optionally use chordManager, rhythmManager, or energyManager.
* **Advanced Arrangement Logic**:
    + Modify EnergyManager to dynamically mute/unmute loops.
    + Create a system that swaps patterns based on song sections.

### Credits & Inspiration

* **OP-XY**: Primary hardware used.
* **The Addiction Formula**: Arrangement inspiration.
* **Web MIDI API**: Enables direct hardware connectivity.
* **Tonal.js**: Chord/note parsing.
* **AI Coding Tools**: Assisted development.

The dev UI is minimal—feel free to build your own front-end!

Enjoy hacking, evolving, and jamming with your hardware!

If you have ideas or want to contribute, open a Pull Request or get in touch.

## Support TonicMIDI

By donating through PayPal, you can help support this project and keep it thriving. I've invested several hundred dollars to create and host TonicMIDI, and I hope to continue adding new features and improvements. Your donation will directly contribute to the project's growth and ensure its continued availability.

[![Donate with PayPal](https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif)](https://www.paypal.com/donate?business=LJA2SVLSM8C4S&no_recurring=0&item_name=Help+keep+TonicMIDI+growing&currency_code=USD)
