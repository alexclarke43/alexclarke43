import { CLIPS } from './clips.js';
import { createBeat } from './beat.js';

const TXT = {
  forYou: { en: 'For You', de: 'Für dich' },
  like: { en: 'Like', de: 'Gefällt mir' },
  save: { en: 'Save', de: 'Speichern' },
  share: { en: 'Share', de: 'Teilen' },
  soundOn: { en: 'Sound on', de: 'Ton an' },
  soundOff: { en: 'Sound off', de: 'Ton aus' },
  next: { en: 'Next clip', de: 'Nächster Clip' },
  prev: { en: 'Previous clip', de: 'Vorheriger Clip' },
  swipe: { en: 'Swipe up for the next clip', de: 'Nach oben wischen für den nächsten Clip' },
  music: { en: '♫ original sound – {name}', de: '♫ Originalton – {name}' },
  learnReward: { en: '+{n} 🪙 for learning something new', de: '+{n} 🪙 fürs Dazulernen' },
  copied: { en: 'Link copied 📋', de: 'Link kopiert 📋' },
  saved: { en: 'Saved to favourites 🔖', de: 'In Favoriten gespeichert 🔖' },
  learn: { en: 'LEARN', de: 'LERNEN' },
  allClips: { en: 'All clips', de: 'Alle Clips' },
  earned: { en: '✓ +{n} 🪙 earned', de: '✓ +{n} 🪙 verdient' },
  dance: { en: 'DANCE', de: 'TANZ' },
  emote: { en: 'EMOTE', de: 'EMOTE' },
  paused: { en: 'Paused – tap to play', de: 'Pausiert – tippen zum Abspielen' },
};
const KEY = 'sparkasse-avatar-feed';
const LEARN_REWARD = 3;

/**
 * TikTok-style "For You" feed: the user's own avatar performs short clips
 * (money explainers, dances, emotes) with captions. Swipe/scroll/arrow keys
 * change clips; tap pauses; double-tap likes.
 *
 * perform(move) → seconds   plays an avatar move (with fallbacks)
 */
export function createFeed(layer, { bgEl, listEl, lang, getName, perform, addCoins, onEvent, onPauseChange, persist = true, swipeTarget }) {
  const lng = () => (typeof lang === 'function' ? lang() : lang);
  const t = (k, vars = {}) => Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), TXT[k][lng()] ?? TXT[k].en);
  const tx = (o) => o[lng()] ?? o.en;
  const store = load();
  const beat = createBeat();

  let active = false;
  let paused = false;
  let index = 0;
  let stepIdx = 0;
  let stepT = 0;
  let stepDur = 0;
  let clipDone = false;

  layer.innerHTML = `
    <div class="fd-scrim"></div>
    <div class="fd-top"><b class="fd-tabname"></b></div>
    <div class="fd-caption-wrap"><div class="fd-caption" aria-live="polite"></div></div>
    <div class="fd-rail">
      <button type="button" class="fd-act fd-like" aria-pressed="false"><span class="fd-ico">❤️</span><small></small></button>
      <button type="button" class="fd-act fd-save" aria-pressed="false"><span class="fd-ico">🔖</span><small></small></button>
      <button type="button" class="fd-act fd-share"><span class="fd-ico">↗️</span><small></small></button>
      <button type="button" class="fd-act fd-sound" aria-pressed="false"><span class="fd-ico">🔇</span></button>
      <div class="fd-nav">
        <button type="button" class="fd-act fd-prev">▲</button>
        <button type="button" class="fd-act fd-next">▼</button>
      </div>
    </div>
    <div class="fd-info">
      <div class="fd-handle"><b></b><span class="fd-kind"></span></div>
      <p class="fd-title"></p>
      <p class="fd-tags"></p>
      <div class="fd-music"><span></span></div>
    </div>
    <div class="fd-progress"><div></div></div>
    <div class="fd-paused" hidden>▶</div>
    <div class="fd-heart" aria-hidden="true">❤️</div>
    <div class="fd-toast" role="status"></div>
    <div class="fd-hint" hidden></div>`;
  const $ = (s) => layer.querySelector(s);

  function load() {
    const fresh = { liked: {}, saved: {}, rewarded: {}, hinted: false };
    if (!persist) return fresh;
    try { return { ...fresh, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh; }
  }
  function save() { if (persist) try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ } }

  const clip = () => CLIPS[index];
  // Stable fake counts so the feed looks alive
  const baseCount = (id, salt) => [...(id + salt)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 99991, 7) % 9000 + 800;
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}K` : String(n));
  const handle = () => `@${getName().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`;

  function renderInfo() {
    const c = clip();
    $('.fd-tabname').textContent = t('forYou');
    $('.fd-handle b').textContent = handle();
    $('.fd-kind').textContent = t(c.kind);
    $('.fd-kind').dataset.kind = c.kind;
    $('.fd-title').textContent = tx(c.title);
    $('.fd-tags').textContent = c.tags;
    $('.fd-music span').textContent = t('music', { name: getName() });
    if (bgEl) bgEl.style.background = `radial-gradient(120% 70% at 50% 35%, ${c.bg[1]}, ${c.bg[0]})`;
    const liked = !!store.liked[c.id];
    const saved = !!store.saved[c.id];
    $('.fd-like').setAttribute('aria-pressed', String(liked));
    $('.fd-like small').textContent = fmt(baseCount(c.id, 'l') * 10 + (liked ? 1 : 0));
    $('.fd-like').setAttribute('aria-label', t('like'));
    $('.fd-save').setAttribute('aria-pressed', String(saved));
    $('.fd-save small').textContent = fmt(baseCount(c.id, 's') + (saved ? 1 : 0));
    $('.fd-save').setAttribute('aria-label', t('save'));
    $('.fd-share small').textContent = fmt(baseCount(c.id, 'x'));
    $('.fd-share').setAttribute('aria-label', t('share'));
    $('.fd-sound').setAttribute('aria-label', beat.playing ? t('soundOff') : t('soundOn'));
    $('.fd-sound .fd-ico').textContent = beat.playing ? '🔊' : '🔇';
    $('.fd-sound').setAttribute('aria-pressed', String(beat.playing));
    $('.fd-next').setAttribute('aria-label', t('next'));
    $('.fd-prev').setAttribute('aria-label', t('prev'));
    $('.fd-paused').setAttribute('aria-label', t('paused'));
    $('.fd-hint').textContent = `↑ ${t('swipe')}`;
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = `<div class="fd-list"><h3>${t('allClips')}</h3></div>`;
    const wrap = listEl.firstChild;
    CLIPS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fd-item';
      b.setAttribute('aria-current', String(i === index));
      b.innerHTML = '<span class="fd-thumb">▶</span><span><b></b><small></small></span>';
      b.querySelector('.fd-thumb').style.background = `linear-gradient(160deg, ${c.bg[0]}, ${c.bg[1]})`;
      b.querySelector('b').textContent = tx(c.title);
      const small = b.querySelector('small');
      const done = c.kind === 'learn' && store.rewarded[c.id];
      small.textContent = done ? t('earned', { n: LEARN_REWARD }) : t(c.kind);
      small.classList.toggle('is-done', !!done);
      b.addEventListener('click', () => { hideHint(); startClip(i, i >= index ? 1 : -1); });
      wrap.append(b);
    });
  }

  function renderCaption(animate = true) {
    const step = clip().steps[stepIdx];
    const el = $('.fd-caption');
    el.textContent = step ? tx(step.text) : '';
    if (animate) { el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in'); }
  }

  function startStep() {
    const step = clip().steps[stepIdx];
    const seconds = perform(step.move) || 2;
    const read = 1.2 + tx(step.text).length * 0.05;  // enough time to read the caption
    stepDur = Math.max(seconds, read, 2.2);
    stepT = 0;
    renderCaption();
  }

  function startClip(i, dir = 1) {
    index = (i + CLIPS.length) % CLIPS.length;
    stepIdx = 0;
    clipDone = false;
    renderInfo();
    layer.dataset.dir = dir > 0 ? 'up' : 'down';
    layer.classList.remove('is-switch'); void layer.offsetWidth; layer.classList.add('is-switch');
    if (beat.playing) beat.set(clip().bpm, clip().kind === 'learn' ? 'learn' : 'party');
    setPaused(false);
    startStep();
    onEvent?.('feed', { phase: 'start', clip: clip().id, kind: clip().kind, index });
  }

  function finishClip() {
    if (clipDone) return;
    clipDone = true;
    const c = clip();
    onEvent?.('feed', { phase: 'end', clip: c.id, kind: c.kind });
    if (c.kind === 'learn' && !store.rewarded[c.id]) {
      store.rewarded[c.id] = true;
      save();
      addCoins?.(LEARN_REWARD);
      toast(t('learnReward', { n: LEARN_REWARD }));
      renderList();
    }
  }

  function update(dt) {
    if (!active || paused) return;
    stepT += dt;
    const steps = clip().steps.length;
    $('.fd-progress > div').style.width = `${Math.min(100, ((stepIdx + Math.min(1, stepT / stepDur)) / steps) * 100)}%`;
    if (stepT < stepDur) return;
    if (stepIdx < steps - 1) { stepIdx++; startStep(); return; }
    finishClip();
    if (stepT >= stepDur + 0.6) startClip(index + 1, 1); // auto-advance like TikTok
  }

  function setPaused(v) {
    paused = v;
    $('.fd-paused').hidden = !v;
    layer.classList.toggle('is-paused', v);
    onPauseChange?.(v);
    if (v) beat.stop(); else if (store.sound && active) beat.start(clip().bpm, clip().kind === 'learn' ? 'learn' : 'party');
  }

  let toastTimer;
  function toast(msg) {
    const el = $('.fd-toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
  }

  function like(on = !store.liked[clip().id]) {
    const id = clip().id;
    if (on) store.liked[id] = true; else delete store.liked[id];
    save();
    renderInfo();
    if (on) {
      const h = $('.fd-heart');
      h.classList.remove('is-pop'); void h.offsetWidth; h.classList.add('is-pop');
    }
    onEvent?.('feed', { phase: 'like', clip: id, liked: on });
  }

  // ---- controls
  $('.fd-like').addEventListener('click', () => like());
  $('.fd-save').addEventListener('click', () => {
    const id = clip().id;
    if (store.saved[id]) delete store.saved[id]; else { store.saved[id] = true; toast(t('saved')); }
    save(); renderInfo();
    onEvent?.('feed', { phase: 'save', clip: id, saved: !!store.saved[id] });
  });
  $('.fd-share').addEventListener('click', async () => {
    const text = `${tx(clip().title)} ${clip().tags}`;
    onEvent?.('feed', { phase: 'share', clip: clip().id });
    try {
      if (navigator.share) { await navigator.share({ title: tx(clip().title), text }); return; }
      await navigator.clipboard.writeText(text);
      toast(t('copied'));
    } catch { /* user cancelled */ }
  });
  $('.fd-sound').addEventListener('click', () => {
    if (beat.playing) { beat.stop(); store.sound = false; } else { store.sound = beat.start(clip().bpm, clip().kind === 'learn' ? 'learn' : 'party'); }
    save(); renderInfo();
  });
  $('.fd-next').addEventListener('click', () => go(1));
  $('.fd-prev').addEventListener('click', () => go(-1));
  $('.fd-paused').addEventListener('click', () => setPaused(false));

  function go(dir) {
    if (!active) return;
    hideHint();
    startClip(index + dir, dir);
  }
  function hideHint() {
    if (!store.hinted) { store.hinted = true; save(); }
    $('.fd-hint').hidden = true;
  }

  // Vertical swipe on the stage (horizontal drags still spin the avatar)
  let sx = 0; let sy = 0; let st = 0; let tracking = false;
  const target = swipeTarget || layer;
  target.addEventListener('pointerdown', (e) => { if (!active) return; tracking = true; sx = e.clientX; sy = e.clientY; st = performance.now(); }, true);
  target.addEventListener('pointerup', (e) => {
    if (!active || !tracking) return;
    tracking = false;
    const dx = e.clientX - sx; const dy = e.clientY - sy;
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.3 && performance.now() - st < 2500) go(dy < 0 ? 1 : -1);
  }, true);
  let wheelLock = 0;
  target.addEventListener('wheel', (e) => {
    if (!active || Math.abs(e.deltaY) < 20 || performance.now() < wheelLock) return;
    wheelLock = performance.now() + 700;
    go(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (!active || e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
  });

  let lastTap = 0; let tapTimer;
  return {
    update,
    get active() { return active; },
    get paused() { return paused; },
    get index() { return index; },
    get clip() { return clip(); },
    clips: CLIPS,
    show() {
      if (active) return;
      active = true;
      layer.hidden = false;
      if (bgEl) bgEl.hidden = false;
      if (!store.hinted) $('.fd-hint').hidden = false;
      startClip(index, 1);
    },
    hide() {
      if (!active) return;
      active = false;
      layer.hidden = true;
      if (bgEl) bgEl.hidden = true;
      beat.stop();
      if (paused) setPaused(false);
      paused = false;
      onPauseChange?.(false);
    },
    next: () => go(1),
    prev: () => go(-1),
    like,
    /** Tap on the avatar/stage: single tap pauses, double tap likes. */
    tap() {
      const now = performance.now();
      if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; like(true); return; }
      lastTap = now;
      tapTimer = setTimeout(() => setPaused(!paused), 300);
    },
    togglePause: () => setPaused(!paused),
    pause() { if (active && !paused) setPaused(true); },
    resume() { if (active && paused) setPaused(false); },
    relabel() { renderInfo(); renderCaption(false); },
  };
}
