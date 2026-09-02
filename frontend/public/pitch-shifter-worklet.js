// A lightweight granular pitch shifter: samples are written into a circular
// buffer at a steady 1x rate while two read taps, offset by half the buffer
// and cross-faded with a complementary cosine/sine window, advance at
// `pitchRatio`x. The cross-fade hides the click that would otherwise happen
// each time a tap wraps relative to the write head. This trades a bit of
// audio quality (some warble/artifacts, more noticeable at extreme ratios)
// for something that runs entirely in an AudioWorklet with no external
// dependencies — acceptable for "fun" voice filters, not studio-grade DSP.
class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitchRatio', defaultValue: 1, minValue: 0.4, maxValue: 2.5, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.bufferSize = 8192;
    this.buffer = new Float32Array(this.bufferSize);
    this.writePointer = 0;
    this.readPointer = 0;
  }

  readInterpolated(pos) {
    const size = this.bufferSize;
    const p = ((pos % size) + size) % size;
    const i0 = Math.floor(p);
    const i1 = (i0 + 1) % size;
    const frac = p - i0;
    return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0][0];
    const output = outputs[0][0];
    if (!output) return true;
    if (!input) {
      output.fill(0);
      return true;
    }

    const pitchRatio = parameters.pitchRatio[0];
    const size = this.bufferSize;
    const grain = size / 2;

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writePointer] = input[i];
      this.writePointer = (this.writePointer + 1) % size;

      const posInGrain = this.readPointer % grain;
      const phase = posInGrain / grain;
      const w0 = Math.cos(phase * Math.PI * 0.5);
      const w1 = Math.sin(phase * Math.PI * 0.5);

      const sampleA = this.readInterpolated(this.readPointer);
      const sampleB = this.readInterpolated(this.readPointer + grain);

      output[i] = sampleA * w0 + sampleB * w1;

      this.readPointer = (this.readPointer + pitchRatio) % size;
    }
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor);
