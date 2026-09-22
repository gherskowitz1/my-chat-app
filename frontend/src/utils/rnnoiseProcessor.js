import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

// The wasm binary and worklet module are the same for every call the
// processor loads in this tab, so both are fetched/compiled once and shared
// — rejoining a voice channel (or the AFK-channel auto-switch) doesn't
// re-download or re-register anything.
let wasmBinaryPromise = null;
let workletModulePromises = new WeakSet();

async function ensureRnnoiseReady(audioContext) {
  if (!wasmBinaryPromise) {
    wasmBinaryPromise = loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseWasmSimdPath });
  }
  const wasmBinary = await wasmBinaryPromise;

  // audioWorklet.addModule is keyed per-AudioContext, and LiveKit reuses one
  // shared context (webAudioMix) for the lifetime of the room connection —
  // still guard per-context in case that ever changes.
  if (!workletModulePromises.has(audioContext)) {
    workletModulePromises.add(audioContext);
    await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
  }

  return wasmBinary;
}

// A LiveKit TrackProcessor (https://github.com/livekit/track-processors-js) —
// init()/destroy()/processedTrack is the whole contract LocalTrack.setProcessor
// expects. RNNoise's real noise-removal model, run entirely client-side via
// WASM in an AudioWorklet (off the main thread), rather than the plain
// browser-native noiseSuppression constraint the "Noise suppression" toggle
// already used — meaningfully better at non-steady noise (keyboard clicks,
// background chatter), at the cost of a bit more CPU.
export function createRnnoiseProcessor() {
  let sourceNode = null;
  let rnnoiseNode = null;
  let destinationNode = null;

  return {
    name: 'rnnoise-noise-cancellation',
    processedTrack: null,

    async init({ track, audioContext }) {
      if (audioContext.sampleRate !== 48000) {
        // RNNoise assumes 48kHz; still runs at other rates, just with
        // reduced effectiveness — not worth failing over.
        console.warn(`RNNoise expects a 48kHz AudioContext, got ${audioContext.sampleRate}Hz — noise cancellation may be less effective.`);
      }

      const wasmBinary = await ensureRnnoiseReady(audioContext);

      sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]));
      rnnoiseNode = new RnnoiseWorkletNode(audioContext, { wasmBinary, maxChannels: 1 });
      destinationNode = audioContext.createMediaStreamDestination();

      sourceNode.connect(rnnoiseNode).connect(destinationNode);
      this.processedTrack = destinationNode.stream.getAudioTracks()[0];
    },

    async destroy() {
      sourceNode?.disconnect();
      rnnoiseNode?.disconnect();
      rnnoiseNode?.destroy();
      destinationNode?.disconnect();
      this.processedTrack?.stop();
    },
  };
}
