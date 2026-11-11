/**
 * Tiny generated beat for the feed (Web Audio, no audio files).
 * Off by default; only starts after the user taps the sound button.
 */
export function createBeat() {
  let ctx = null;
  let master = null;
  let noise = null;
  let timer = null;
  let bpm = 110;
  let step = 0;
  let nextTime = 0;
  let style = 'learn';

  const BASS = { learn: [45, 0, 0, 48, 0, 0, 52, 0, 45, 0, 0, 43, 0, 0, 40, 0], party: [40, 0, 40, 0, 43, 0, 45, 0, 40, 0, 40, 0, 47, 0, 45, 0] };
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function env(node, t, peak, decay) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    node.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }
  function kick(t) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    env(g, t, 0.9, 0.32); o.connect(g).connect(master); o.start(t); o.stop(t + 0.35);
  }
  function hiss(t, { freq, type, peak, decay }) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, peak, decay);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + decay + 0.02);
  }
  function bass(t, note, len) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = hz(note);
    env(g, t, 0.35, len); o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.02);
  }

  function schedule() {
    const sixteenth = 60 / bpm / 4;
    while (nextTime < ctx.currentTime + 0.12) {
      const s = step % 16;
      const party = style !== 'learn';
      if (s % 4 === 0 || (party && s === 14)) kick(nextTime);
      if (s === 4 || s === 12) hiss(nextTime, { freq: 1800, type: 'bandpass', peak: party ? 0.5 : 0.25, decay: 0.16 });
      if (s % 2 === 0 || party) hiss(nextTime, { freq: 8000, type: 'highpass', peak: s % 2 ? 0.06 : 0.12, decay: 0.04 });
      const n = BASS[party ? 'party' : 'learn'][s];
      if (n) bass(nextTime, n, sixteenth * 1.8);
      nextTime += sixteenth;
      step++;
    }
  }

  return {
    get playing() { return !!timer; },
    start(newBpm = bpm, newStyle = style) {
      init();
      if (!ctx) return false;
      ctx.resume?.();
      bpm = newBpm; style = newStyle;
      if (timer) return true;
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      timer = setInterval(schedule, 25);
      schedule();
      return true;
    },
    set(newBpm, newStyle) { bpm = newBpm || bpm; style = newStyle || style; },
    stop() { clearInterval(timer); timer = null; },
  };
}
