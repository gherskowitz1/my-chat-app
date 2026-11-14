// Mic level meter for voice-activity mode (VoiceControls.jsx). Runs on the
// audio rendering thread, which keeps going when the app is minimized or
// behind a game — unlike requestAnimationFrame, which browsers (and the
// desktop app) pause for hidden windows, freezing the old meter so people's
// mics stuck open or shut mid-game. Posts the RMS level of roughly every
// 20ms of audio back to the page; the speaking/silent decision stays there.
class VadMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sumSquares = 0;
    this.samples = 0;
    this.reportEvery = Math.round(sampleRate * 0.02); // ~20ms
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) this.sumSquares += channel[i] * channel[i];
      this.samples += channel.length;
      if (this.samples >= this.reportEvery) {
        this.port.postMessage(Math.sqrt(this.sumSquares / this.samples));
        this.sumSquares = 0;
        this.samples = 0;
      }
    }
    return true; // keep running for the life of the call
  }
}

registerProcessor('vad-meter', VadMeter);
