// Real-time voice filters built entirely from stock Web Audio nodes, except
// for the 4 pitch-shifted ones (chipmunk/helium/deepVoice/demon) which need
// an AudioWorklet — see /public/pitch-shifter-worklet.js. Plugs into
// LiveKit's TrackProcessor extension point (the same one LiveKit's own
// noise-cancellation plugins use): `localAudioTrack.setProcessor(processor)`
// swaps the published track's underlying MediaStreamTrack via
// RTCRtpSender.replaceTrack, no renegotiation needed.
export const VOICE_EFFECTS = [
  { id: 'robot', label: '🤖 Robot' },
  { id: 'alien', label: '👽 Alien' },
  { id: 'chipmunk', label: '🐿️ Chipmunk' },
  { id: 'helium', label: '🎈 Helium' },
  { id: 'deepVoice', label: '🎙️ Deep Voice' },
  { id: 'demon', label: '😈 Demon' },
  { id: 'echo', label: '🔁 Echo' },
  { id: 'reverb', label: '🕳️ Cave' },
  { id: 'telephone', label: '☎️ Telephone' },
  { id: 'radio', label: '📻 Radio' },
  { id: 'brokenRadio', label: '📡 Broken Radio' },
  { id: 'underwater', label: '🌊 Underwater' },
  { id: 'whisper', label: '🤫 Whisper' },
  { id: 'megaphone', label: '📣 Megaphone' },
];

// Classic Web Audio ring modulator: connecting an oscillator directly into a
// GainNode's `.gain` AudioParam (with the gain's own base value left at 0)
// makes the node's output = input * oscillator, i.e. true bipolar ring
// modulation rather than one-sided amplitude modulation.
function buildRingMod(ctx, freq) {
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = freq;
  const ringGain = ctx.createGain();
  ringGain.gain.value = 0;
  carrier.connect(ringGain.gain);
  carrier.start();
  return { input: ringGain, output: ringGain, extraNodes: [carrier] };
}

// Standard "k-based" soft-clip curve (as in MDN's WaveShaperNode example).
function makeDistortionCurve(amount) {
  const n = 44100;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 2 - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function makeImpulseResponse(ctx, duration, decay) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return impulse;
}

function buildRobot(ctx) {
  const ring = buildRingMod(ctx, 35);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4000;
  ring.output.connect(lp);
  return { input: ring.input, output: lp, extraNodes: ring.extraNodes };
}

function buildAlien(ctx) {
  const ring = buildRingMod(ctx, 550);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 4;
  ring.output.connect(bp);
  return { input: ring.input, output: bp, extraNodes: ring.extraNodes };
}

function buildEcho(ctx) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.6;
  const output = ctx.createGain();

  input.connect(output);
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(output);

  return { input, output, extraNodes: [delay, feedback, wet] };
}

function buildReverb(ctx) {
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulseResponse(ctx, 2.5, 3.5);
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.6;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;

  input.connect(dry);
  dry.connect(output);
  input.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);

  return { input, output, extraNodes: [convolver, dry, wet] };
}

function buildTelephone(ctx) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  hp.connect(lp);
  return { input: hp, output: lp, extraNodes: [] };
}

function buildRadio(ctx) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 500;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4000;
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDistortionCurve(15);
  shaper.oversample = '2x';
  hp.connect(lp);
  lp.connect(shaper);
  return { input: hp, output: shaper, extraNodes: [] };
}

function buildBrokenRadio(ctx) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 400;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3500;
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDistortionCurve(25);
  shaper.oversample = '2x';
  const chopGain = ctx.createGain();
  chopGain.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 7;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth);
  lfoDepth.connect(chopGain.gain);
  lfo.start();

  hp.connect(lp);
  lp.connect(shaper);
  shaper.connect(chopGain);
  return { input: hp, output: chopGain, extraNodes: [lfo, lfoDepth] };
}

function buildUnderwater(ctx) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  lp.Q.value = 8;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.4;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 250;
  lfo.connect(lfoGain);
  lfoGain.connect(lp.frequency);
  lfo.start();
  return { input: lp, output: lp, extraNodes: [lfo, lfoGain] };
}

function buildWhisper(ctx) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 700;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -40;
  comp.ratio.value = 12;
  const gain = ctx.createGain();
  gain.gain.value = 0.7;
  hp.connect(comp);
  comp.connect(gain);
  return { input: hp, output: gain, extraNodes: [] };
}

function buildMegaphone(ctx) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 600;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDistortionCurve(40);
  shaper.oversample = '4x';
  const gain = ctx.createGain();
  gain.gain.value = 1.6;
  hp.connect(lp);
  lp.connect(shaper);
  shaper.connect(gain);
  return { input: hp, output: gain, extraNodes: [] };
}

const loadedWorkletContexts = new WeakSet();
async function ensureWorkletLoaded(ctx) {
  if (loadedWorkletContexts.has(ctx)) return;
  await ctx.audioWorklet.addModule('/pitch-shifter-worklet.js');
  loadedWorkletContexts.add(ctx);
}

async function buildPitchShift(ctx, pitchRatio, extra) {
  await ensureWorkletLoaded(ctx);
  const node = new AudioWorkletNode(ctx, 'pitch-shifter', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
  });
  node.parameters.get('pitchRatio').value = pitchRatio;

  let output = node;
  const extraNodes = [node];

  if (extra === 'highpass') {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 200;
    output.connect(hp);
    output = hp;
    extraNodes.push(hp);
  } else if (extra === 'lowpass') {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    output.connect(lp);
    output = lp;
    extraNodes.push(lp);
  } else if (extra === 'demon') {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(10);
    shaper.oversample = '2x';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    output.connect(shaper);
    shaper.connect(lp);
    output = lp;
    extraNodes.push(shaper, lp);
  }

  return { input: node, output, extraNodes };
}

const EFFECT_BUILDERS = {
  robot: buildRobot,
  alien: buildAlien,
  echo: buildEcho,
  reverb: buildReverb,
  telephone: buildTelephone,
  radio: buildRadio,
  brokenRadio: buildBrokenRadio,
  underwater: buildUnderwater,
  whisper: buildWhisper,
  megaphone: buildMegaphone,
  chipmunk: (ctx) => buildPitchShift(ctx, 1.6, 'highpass'),
  helium: (ctx) => buildPitchShift(ctx, 1.9, 'highpass'),
  deepVoice: (ctx) => buildPitchShift(ctx, 0.72, 'lowpass'),
  demon: (ctx) => buildPitchShift(ctx, 0.6, 'demon'),
};

// Exposed so a local "hear yourself" preview can build the exact same
// effect graph without going through LiveKit's TrackProcessor at all —
// useful when previewing shouldn't require being connected to a room.
export function buildEffectGraph(ctx, effectId) {
  return EFFECT_BUILDERS[effectId](ctx);
}

// Conforms to LiveKit's TrackProcessor<Track.Kind.Audio> interface:
// { name, init(opts), restart(opts), destroy(), processedTrack }.
export class VoiceEffectProcessor {
  constructor(effectId) {
    this.name = `voice-effect-${effectId}`;
    this.effectId = effectId;
    this.processedTrack = undefined;
    this._audioContext = null;
    this._nodes = [];
  }

  async init(opts) {
    this._audioContext = opts.audioContext;
    await this._build(opts.track);
  }

  async restart(opts) {
    this._teardown();
    this._audioContext = opts.audioContext;
    await this._build(opts.track);
  }

  async _build(track) {
    const ctx = this._audioContext;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const destination = ctx.createMediaStreamDestination();
    const graph = await buildEffectGraph(ctx, this.effectId);
    source.connect(graph.input);
    graph.output.connect(destination);
    this._nodes = [source, destination, ...graph.extraNodes];
    this.processedTrack = destination.stream.getAudioTracks()[0];
  }

  _teardown() {
    this._nodes.forEach((n) => {
      try { n.disconnect(); } catch { /* already disconnected */ }
      try { n.stop?.(); } catch { /* not a source node */ }
    });
    this._nodes = [];
  }

  async destroy() {
    this._teardown();
    this.processedTrack = undefined;
  }
}
