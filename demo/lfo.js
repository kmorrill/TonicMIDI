/**
 * LFO (Low Frequency Oscillator) module
 * Generates periodic modulation signals useful for creating rhythmic parameter changes.
 */

/**
 * LFO class for generating oscillating values over time
 */
export class LFO {
  /**
   * Create a new LFO
   * @param {Object} options - LFO configuration options
   * @param {number} options.frequency - Cycles per second (Hz)
   * @param {number} options.amplitude - Output amplitude (default: 1.0)
   * @param {number} options.offset - Output offset (default: 0.0)
   * @param {string} options.shape - Waveform shape: 'sine', 'triangle', 'saw', 'square' (default: 'sine')
   */
  constructor({ 
    frequency = 1, 
    amplitude = 1.0, 
    offset = 0.0, 
    shape = 'sine' 
  } = {}) {
    this.frequency = frequency;
    this.amplitude = amplitude;
    this.offset = offset;
    this.shape = shape;
    this.phase = 0; // Current phase in radians
  }

  /**
   * Update LFO state and get current value
   * @param {number} deltaTime - Time elapsed since last update in seconds
   * @returns {number} Current LFO value
   */
  update(deltaTime) {
    // Update phase based on frequency and time
    this.phase += this.frequency * deltaTime * Math.PI * 2;
    
    // Keep phase between 0 and 2π
    this.phase %= Math.PI * 2;
    
    // Calculate raw output value based on waveform shape
    let value;
    
    switch (this.shape) {
      case 'sine':
        value = Math.sin(this.phase);
        break;
      case 'triangle':
        // Triangle wave
        value = 2 * Math.abs(this.phase / Math.PI - 1) - 1;
        break;
      case 'saw':
        // Sawtooth wave
        value = (this.phase / Math.PI - 1);
        break;
      case 'square':
        // Square wave
        value = this.phase < Math.PI ? 1 : -1;
        break;
      default:
        value = Math.sin(this.phase);
    }
    
    // Apply amplitude and offset
    return value * this.amplitude + this.offset;
  }

  /**
   * Reset the LFO phase
   */
  reset() {
    this.phase = 0;
  }

  /**
   * Set a new frequency
   * @param {number} frequency - New frequency in Hz
   */
  setFrequency(frequency) {
    this.frequency = frequency;
  }

  /**
   * Set a new amplitude
   * @param {number} amplitude - New amplitude value
   */
  setAmplitude(amplitude) {
    this.amplitude = amplitude;
  }

  /**
   * Set a new offset
   * @param {number} offset - New offset value
   */
  setOffset(offset) {
    this.offset = offset;
  }

  /**
   * Set a new waveform shape
   * @param {string} shape - New waveform shape ('sine', 'triangle', 'saw', 'square')
   */
  setShape(shape) {
    if (['sine', 'triangle', 'saw', 'square'].includes(shape)) {
      this.shape = shape;
    } else {
      console.warn(`Invalid shape: ${shape}. Using 'sine' instead.`);
      this.shape = 'sine';
    }
  }
}