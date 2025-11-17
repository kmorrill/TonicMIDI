import { Window } from 'happy-dom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const PROTOTYPE_HTML = fs.readFileSync(
  path.join(PROJECT_ROOT, 'demo/opxy-cc-prototype.html'),
  'utf8'
);

const scriptMatch = PROTOTYPE_HTML.match(/<script type="module">([\s\S]*?)<\/script>/);
const inlineScript = scriptMatch ? scriptMatch[1] : '';
const htmlWithoutScript = scriptMatch ? PROTOTYPE_HTML.replace(scriptMatch[0], '') : PROTOTYPE_HTML;

const setupWindow = async () => {
  const window = new Window({ pretendToBeVisual: true });
  window.navigator.requestMIDIAccess = async () => ({
    inputs: new Map(),
    addEventListener() {},
    removeEventListener() {}
  });
  window.console.error = () => {};
  window.requestAnimationFrame = cb => setTimeout(cb, 0);
  window.cancelAnimationFrame = handle => clearTimeout(handle);
  window.document.write(htmlWithoutScript);
  window.document.close();
  await window.happyDOM.whenAsyncComplete();
  window.eval(inlineScript);
  await window.happyDOM.whenAsyncComplete();
  return window;
};

describe('opxy CC prototype demo', () => {
  let window;
  let document;
  let api;

  beforeEach(async () => {
    window = await setupWindow();
    document = window.document;
    api = window.opxyCCPrototype;
  });

  afterEach(() => {
    window.happyDOM?.cancelAsync();
  });

  it('renders all 24 key elements once the script runs', () => {
    const keys = [...document.querySelectorAll('.key')];
    const noteLabels = keys.map(key => key.dataset.note);
    expect(keys).toHaveLength(24);
    expect(new Set(noteLabels).size).toBe(24);
    expect(noteLabels).toContain('F2');
    expect(noteLabels).toContain('E4');
  });

  it('updates encoder titles/descriptions by key', () => {
    api.setNoteState('G2', true);
    const encoderGrid = document.getElementById('encoderGrid');
    const firstEncoder = encoderGrid.querySelector('.encoder h3');
    const firstDescription = encoderGrid.querySelector('.encoder p');
    const initialTitle = firstEncoder.textContent;
    const initialDescription = firstDescription.textContent;

    api.setNoteState('G2', false);
    api.setNoteState('A2', true);

    expect(encoderGrid.querySelector('.encoder h3').textContent).not.toBe(initialTitle);
    expect(encoderGrid.querySelector('.encoder p').textContent).not.toBe(initialDescription);
  });

  it('tracks encoder meter values separately per note', () => {
    api.setNoteState('F2', true);
    api.setCCValue('F2', 100, 64); // roughly 50%
    let meterValue = document.querySelector('.drum-encoders .encoder .encoder-meter__value').textContent;
    expect(meterValue).toBe('50%');

    api.setNoteState('F2', false);
    api.setNoteState('G2', true);
    meterValue = document.querySelector('#encoderGrid .encoder .encoder-meter__value').textContent;
    expect(meterValue).toBe('0%');

    api.setCCValue('G2', 100, 10);
    meterValue = document.querySelector('#encoderGrid .encoder .encoder-meter__value').textContent;
    expect(meterValue).toBe('8%');

    api.setNoteState('G2', false);
    api.setNoteState('F2', true);
    meterValue = document.querySelector('.drum-encoders .encoder .encoder-meter__value').textContent;
    expect(meterValue).toBe('50%');
  });

  it('keeps drum mode active and remembers flavor selections', () => {
    const drumFocus = document.getElementById('drumFocus');
    const getFlavorButton = flavor =>
      document.querySelector(`[data-flavor-choice='${flavor}']`);

    api.setNoteState('F2', true);
    expect(drumFocus.hidden).toBe(false);
    expect(getFlavorButton('ambient').classList.contains('active')).toBe(true);
    expect(document.querySelector("[data-note='G2']").classList.contains('flavor-selected')).toBe(true);

    api.setNoteState('A2', true);
    expect(drumFocus.hidden).toBe(false);
    expect(getFlavorButton('tribal').classList.contains('active')).toBe(true);
    expect(document.querySelector("[data-note='A2']").classList.contains('flavor-selected')).toBe(true);

    api.setNoteState('F2', false);
    expect(drumFocus.hidden).toBe(true);

    api.setNoteState('F2', true);
    expect(getFlavorButton('tribal').classList.contains('active')).toBe(true);
    expect(document.querySelector("[data-note='A2']").classList.contains('flavor-selected')).toBe(true);
  });

  it('updates track state programmatically', () => {
    const first = document.querySelector('.track-button');
    expect(first.textContent).toBe('1');
    api.setTrackState('1', { plugin: 'Chord Swell', muted: false });
    expect(first.textContent).toContain('Chord Swell');
    expect(first.classList.contains('active')).toBe(true);
    api.setTrackState('1', { muted: true });
    expect(first.classList.contains('active')).toBe(false);
  });
});
