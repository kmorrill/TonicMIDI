// File: src/ui/xy-pad.js

// Example XYPad class. Feel free to adapt or refine for your exact library structure.
export class XYPad {
  /**
   * @param {Object} config
   * @param {HTMLElement} [config.container] - The DOM element to attach the XY pad canvas.
   * @param {number} [config.width=200] - Width of the XY pad in pixels.
   * @param {number} [config.height=200] - Height of the XY pad in pixels.
   * @param {Object} [config.paramX] - Config object describing how the X axis is mapped.
   * @param {Object} [config.paramY] - Config object describing how the Y axis is mapped.
   * @param {Function} [config.onChange] - Optional callback that fires with (xVal, yVal) after scaling.
   *
   * Each paramX/paramY can be:
   *   {
   *     type: "cc" | "lfo" | "function" | "pattern" | ...
   *     // if type="cc":
   *     channel: number,
   *     cc: number,
   *     range: [min, max]
   *
   *     // if type="lfo":
   *     lfo: someLfoInstance,
   *     method: "setFrequency",
   *     range: [min, max]
   *
   *     // if type="function":
   *     callback: (value) => {...},
   *     range: [min, max]
   *
   *     // etc.
   *   }
   */
  constructor(config = {}) {
    this.config = config;
    this.container = config.container || document.body;
    this.width = config.width || 200;
    this.height = config.height || 200;

    // We'll track normalized positions [0..1] for x,y
    // Then scale them to [min..max] as needed
    this.xNorm = 0.5; // default center
    this.yNorm = 0.5;

    // Create a <canvas> for visual representation
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.background = "#333"; // a simple dark background
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");

    // Bind pointer events
    this._bindEvents();

    // Do an initial draw
    this._render();
  }

  /**
   * Binds mouse/touch events to handle user dragging on the canvas
   */
  _bindEvents() {
    // For convenience, we unify pointer events
    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));
    this.canvas.addEventListener("pointerleave", (e) => this._onPointerUp(e));
  }

  _onPointerDown(e) {
    // Capture pointer
    this.canvas.setPointerCapture(e.pointerId);
    this._updatePositionFromEvent(e);
  }

  _onPointerMove(e) {
    if (e.buttons === 1) {
      // only if pointer is down
      this._updatePositionFromEvent(e);
    }
  }

  _onPointerUp(e) {
    this.canvas.releasePointerCapture(e.pointerId);
  }

  /**
   * Converts the pointer event position into normalized x,y in [0..1],
   * then applies them to paramX and paramY
   */
  _updatePositionFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    // relative coords
    let px = e.clientX - rect.left;
    let py = e.clientY - rect.top;

    // clamp 0..width, 0..height
    px = Math.max(0, Math.min(this.width, px));
    py = Math.max(0, Math.min(this.height, py));

    // convert to normalized [0..1]
    // X: left=0 -> right=1
    // Y: top=0 -> bottom=1 (or reverse if you want)
    const xNorm = px / this.width;
    const yNorm = 1 - py / this.height; // invert Y so top=1, bottom=0 if you prefer

    this.xNorm = xNorm;
    this.yNorm = yNorm;

    // Apply to paramX, paramY if available
    this._applyAxis("paramX", xNorm);
    this._applyAxis("paramY", yNorm);

    // If onChange is defined
    if (typeof this.config.onChange === "function") {
      // pass the scaled values for each axis
      const scaledX = this._scaleValue("paramX", xNorm);
      const scaledY = this._scaleValue("paramY", yNorm);
      this.config.onChange(scaledX, scaledY);
    }

    // Re-render the dot
    this._render();
  }

  /**
   * For a given axis config, scale the normalized value
   * and do the appropriate action (send CC, call LFO method, etc.)
   */
  _applyAxis(axisKey, normVal) {
    const axisConfig = this.config[axisKey];
    if (!axisConfig) return;

    // scale normalized 0..1 to [min..max]
    const scaledVal = this._scaleValue(axisKey, normVal);

    // Switch on the axisConfig.type
    switch (axisConfig.type) {
      case "cc":
        // we expect axisConfig.channel, axisConfig.cc
        if (!window.midiBus) {
          console.warn(
            "No midiBus global found. Please define midiBus or pass it in!"
          );
          return;
        }
        window.midiBus.controlChange({
          channel: axisConfig.channel || 1,
          cc: axisConfig.cc || 74,
          value: Math.floor(scaledVal), // must be 0..127
        });
        break;

      case "lfo":
        // axisConfig.lfo, axisConfig.method
        if (
          axisConfig.lfo &&
          typeof axisConfig.lfo[axisConfig.method] === "function"
        ) {
          axisConfig.lfo[axisConfig.method](scaledVal);
        }
        break;

      case "function":
        // axisConfig.callback
        if (typeof axisConfig.callback === "function") {
          axisConfig.callback(scaledVal);
        }
        break;

      case "pattern":
        // axisConfig.pattern, axisConfig.param ?
        if (
          axisConfig.pattern &&
          typeof axisConfig.pattern[axisConfig.param] === "function"
        ) {
          axisConfig.pattern[axisConfig.param](scaledVal);
        } else if (
          axisConfig.pattern &&
          axisConfig.param in axisConfig.pattern
        ) {
          // direct property assignment
          axisConfig.pattern[axisConfig.param] = scaledVal;
        }
        break;

      // more cases if you have other types (chordManager, deviceDefinition, etc.)

      default:
        // do nothing or handle unknown type
        break;
    }
  }

  /**
   * Helper to scale normalized 0..1 into the axis's [min, max]
   */
  _scaleValue(axisKey, normVal) {
    const axisConfig = this.config[axisKey];
    if (!axisConfig || !axisConfig.range) {
      // default to [0,1]
      return normVal;
    }
    const [min, max] = axisConfig.range;
    return min + (max - min) * normVal;
  }

  /**
   * Draws the XY pad background and a dot showing current X/Y
   */
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw a grid or something optional
    ctx.strokeStyle = "#666";
    ctx.beginPath();
    // e.g. center lines
    ctx.moveTo(this.width / 2, 0);
    ctx.lineTo(this.width / 2, this.height);
    ctx.moveTo(0, this.height / 2);
    ctx.lineTo(this.width, this.height / 2);
    ctx.stroke();

    // Dot
    const dotX = this.xNorm * this.width;
    const dotY = (1 - this.yNorm) * this.height;
    ctx.fillStyle = "#0ff";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 8, 0, 2 * Math.PI);
    ctx.fill();
  }
}
