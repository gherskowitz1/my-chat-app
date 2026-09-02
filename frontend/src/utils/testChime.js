// Plays a short synthesized chime through a specific output device — used to
// let a user confirm they picked the right speakers/headphones before
// joining a call. Routes the tone through a MediaStreamDestination + a
// hidden <audio> element (rather than straight to AudioContext.destination)
// specifically so HTMLMediaElement.setSinkId can target the chosen device;
// falls back to the system default output where setSinkId isn't supported
// (Firefox, Safari).
export async function playTestChime(outputDeviceId) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  const ctx = new Ctx();
  const destination = ctx.createMediaStreamDestination();
  const freqs = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5
  const noteDuration = 0.12;

  freqs.forEach((freq, i) => {
    const start = ctx.currentTime + i * noteDuration;
    const end = start + noteDuration;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gainNode.gain.setValueAtTime(0.2, start);
    gainNode.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gainNode);
    gainNode.connect(destination);
    osc.start(start);
    osc.stop(end);
  });

  const audio = new Audio();
  audio.srcObject = destination.stream;
  if (outputDeviceId && typeof audio.setSinkId === 'function') {
    try { await audio.setSinkId(outputDeviceId); } catch { /* stick with the default output */ }
  }
  await audio.play();

  setTimeout(() => {
    audio.pause();
    audio.srcObject = null;
    ctx.close();
  }, (freqs.length * noteDuration + 0.2) * 1000);
}
