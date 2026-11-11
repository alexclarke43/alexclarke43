import * as THREE from 'three';
import { loadConfig } from './config.js';
import { REACTIONS, UI_TEXT } from './reactions.js';
import { createStage } from './stage.js';
import { DragRotate } from './DragRotate.js';
import { Confetti } from './effects/Confetti.js';
import { createBridge } from './bridge.js';
import { PlaceholderAvatar } from './avatars/PlaceholderAvatar.js';
import { GltfAvatar } from './avatars/GltfAvatar.js';
import { SparkieAvatar } from './avatars/SparkieAvatar.js';
import { DEFAULT_LOOK, BASE_HEIGHT, OPTIONS, PALETTES, sanitizeLook, enforceUnlocks, loadSavedLook, saveLook } from './look.js';
import { getCoins, addCoins, onCoins, setPersist } from './progress.js';
import { createCustomizer } from './ui/customizer.js';
import { createGames } from './games/games.js';
import { createChat } from './chat/chat.js';
import { createFeed } from './feed/feed.js';

const cfg = loadConfig();
const $ = (id) => document.getElementById(id);
const app = $('avatar-app');
const stageEl = $('avatar-stage');
const bubbleEl = $('avatar-bubble');
const loaderEl = $('avatar-loader');
const hintEl = $('avatar-hint');
const actionsEl = $('avatar-actions');
const coinsEl = $('avatar-coins');
const t = (entry) => entry[cfg.lang] ?? entry.en;

const TABS = {
  react: { emoji: '✨', label: { en: 'React', de: 'Reagieren' } },
  chat: { emoji: '💬', label: { en: 'Chat', de: 'Chat' } },
  feed: { emoji: '▶️', label: { en: 'For You', de: 'Für dich' } },
  style: { emoji: '🎨', label: { en: 'Style', de: 'Style' } },
  play: { emoji: '🎮', label: { en: 'Play', de: 'Spielen' } },
};

setPersist(cfg.persist);
applyTheme();
const bridge = createBridge({
  parentOrigin: cfg.parentOrigin,
  handlers: {
    play: (d) => play(d.reaction, { text: d.text }),
    say: (d) => say(String(d.text ?? ''), Number(d.duration) || 3000),
    reset: () => controls?.reset(),
    setLook: (d) => setLook(d.look || {}),
    openTab: (d) => openTab(d.tab),
    setLang: (d) => setLang(d.lang),
    startGame: (d) => { if (openTab('play')) games?.startGame(d.game); },
    chat: (d) => { if (openTab('chat')) chat?.send(String(d.text ?? '')); },
    feed: (d) => {
      if (d.action === 'pause') return feed?.pause();
      if (d.action === 'play') return feed?.active ? feed.resume() : openTab('feed');
      if ((d.action === 'next' || d.action === 'prev') && (feed?.active || openTab('feed'))) feed[d.action]();
    },
  },
});

let avatar;
let stage;
let controls;
let customizer;
let games;
let chat;
let feed;
let feedPaused = false;
let confetti;
let busyUntil = 0;
let bubbleTimer;
let look = initialLook();
const anchor = new THREE.Vector3();

boot().catch((err) => {
  console.error(err);
  loaderEl.textContent = t(UI_TEXT.noWebgl);
  bridge.emit('error', { message: String(err?.message || err) });
});

async function boot() {
  loaderEl.querySelector('.avatar-loader__text').textContent = t(UI_TEXT.loading);
  stage = createStage(stageEl, cfg);
  avatar = await createAvatar();
  attachAvatar();

  confetti = new Confetti(stage.scene, [cfg.primary, '#ffffff', cfg.accent, '#ffd23f', '#b8a4ff']);

  controls = new DragRotate(stage.canvas, stage.turntable, {
    onTap: (e) => onTap(e, stage),
    onDragStart: hideHint,
  });

  // Head follows the pointer (inside the iframe)
  if (cfg.lookAtPointer) {
    let idleTimer;
    window.addEventListener('pointermove', (e) => {
      const r = stageEl.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -(((e.clientY - r.top) / r.height) * 2 - 1) + 0.45; // eyes sit high in the frame
      const yaw = wrap(-stage.turntable.rotation.y);
      const facing = Math.max(0, Math.cos(yaw)); // don't look "through" the back of the head
      avatar.setLookTarget(clamp(x, -1, 1) * facing, clamp(y, -1, 1) * facing);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => avatar.setLookTarget(0, 0), 2500);
    }, { passive: true });
    document.addEventListener('pointerleave', () => avatar.setLookTarget(0, 0));
  }

  stage.onFrame((dt) => {
    controls.update(dt);
    if (!feedPaused) avatar.update(dt); // a paused feed clip freezes the avatar like a paused video
    feed?.update(dt);
    confetti.update(dt);
    positionBubble(stage);
  });

  buildDock();
  updateCoins(getCoins(), 0);
  onCoins(updateCoins);

  loaderEl.hidden = true;
  app.classList.add('is-ready');
  if (!cfg.hint) hintEl.hidden = true;

  window.SparkasseAvatarApp = {
    play, say, setLook, openTab, setLang,
    reset: () => controls.reset(),
    get look() { return { ...look }; },
    get coins() { return getCoins(); },
    config: cfg, games, customizer, chat, feed, perform,
    get avatar() { return avatar; },
  };
  bridge.emit('ready', { reactions: avatar.reactions, model: cfg.model || 'placeholder', look, coins: getCoins() });

  if (cfg.autoGreet) setTimeout(() => play('greet'), 700);
}

async function createAvatar() {
  if (cfg.model) {
    try {
      return await GltfAvatar.load(cfg.model, { clips: cfg.clips });
    } catch (err) {
      console.warn(`[avatar] Could not load "${cfg.model}", using placeholder.`, err);
      bridge.emit('error', { message: `Model failed to load: ${cfg.model}` });
    }
  }
  return look.character === 'sparkie' ? new SparkieAvatar() : new PlaceholderAvatar(cfg, look);
}

/** Put the current avatar on stage and adapt camera, shadow, height and buttons to it. */
function attachAvatar() {
  stage.turntable.add(avatar.object3d);
  applyFrame();
  stage.setContactShadow(!avatar.ownShadow);
  stage.setToneMapping(avatar.toneMapping);
  applyHeight();
  app.dataset.character = cfg.model ? 'model' : look.character;
}

/** Switch between the customisable avatar and Sparkie at runtime. */
async function swapAvatar() {
  const old = avatar;
  avatar = await createAvatar();
  stage.turntable.remove(old.object3d);
  old.dispose?.();
  attachAvatar();
  controls?.reset();
  buildButtons();
  customizer?.render();
  play('greet');
  bridge.emit('character', { character: look.character });
}

// --------------------------------------------------------------------------- look

function initialLook() {
  const hex = (c) => `#${new THREE.Color(c).getHexString()}`;
  const fromCfg = { topColor: hex(cfg.primary), skin: hex(cfg.skin), hairColor: hex(cfg.hair) };
  const forced = cfg.character ? { character: cfg.character } : {};
  const saved = cfg.persist ? loadSavedLook() : null;
  return enforceUnlocks(sanitizeLook({ ...DEFAULT_LOOK, ...fromCfg, ...saved, ...(cfg.look || {}), ...forced }), getCoins());
}

let lookEventTimer;
/** Change the avatar's look. `partial` may contain any key of DEFAULT_LOOK. */
function setLook(partial, { reaction, heightOnly, fromPanel } = {}) {
  const prevCharacter = look.character;
  look = enforceUnlocks(sanitizeLook({ ...look, ...partial }), getCoins());
  if (avatar && look.character !== prevCharacter && !cfg.model) {
    swapAvatar();
  } else if (avatar) {
    applyHeight();
    if (!heightOnly && avatar.supportsStyle) avatar.setStyle(look);
  }
  if (!fromPanel) customizer?.render(); // keep the Style panel in sync with API/host changes
  chat?.relabel();
  if (feed?.active) feed.relabel();
  if (cfg.persist) saveLook(look);
  clearTimeout(lookEventTimer);
  lookEventTimer = setTimeout(() => bridge.emit('look', { look }), 250);
  if (reaction) play(reaction);
  return { ...look };
}

const DEFAULT_FRAME = { w: 2.0, h: 2.65, cy: 1.14, up: 0.18 };
/** Camera framing: zoom out a bit in the feed so captions fit above and below the avatar. */
function applyFrame() {
  if (app.dataset.tab !== 'feed') { stage.setFrame(avatar.frame); return; }
  const f = { ...DEFAULT_FRAME, ...(avatar.frame || {}) };
  stage.setFrame({ ...f, w: f.w * 1.1, h: f.h * 1.5, cy: f.cy + f.h * 0.04 });
}

function applyHeight() {
  avatar.object3d.scale.setScalar(avatar.supportsHeight === false ? 1 : look.height / BASE_HEIGHT);
}

// --------------------------------------------------------------------------- coins

const UNLOCKS = [
  ...OPTIONS.hairStyle.filter((o) => o.unlock).map((o) => ({ n: o.unlock, name: o.label })),
  ...OPTIONS.extras.filter((o) => o.unlock).map((o) => ({ n: o.unlock, name: o.label })),
  ...PALETTES.shoeColor.filter((c) => typeof c === 'object').map((c) => ({ n: c.unlock, name: { en: 'Gold sneakers', de: 'Gold-Sneaker' } })),
];

function updateCoins(total, delta) {
  coinsEl.hidden = !cfg.badge || (!cfg.tabs.includes('play') && total === 0);
  coinsEl.textContent = `🪙 ${total}`;
  if (delta > 0) {
    coinsEl.classList.remove('is-bump');
    void coinsEl.offsetWidth;
    coinsEl.classList.add('is-bump');
    bridge.emit('coins', { coins: total, delta });
    const unlocked = UNLOCKS.filter((u) => u.n <= total && u.n > total - delta);
    if (unlocked.length) {
      const names = unlocked.map((u) => t(u.name)).join(', ');
      setTimeout(() => say(cfg.lang === 'de' ? `Freigeschaltet: ${names}! Schau unter Style 🎨` : `Unlocked: ${names}! Check Style 🎨`, 3500), 2400);
    }
  }
  customizer?.render();
}

// --------------------------------------------------------------------------- reactions

// Feed moves the current avatar may not have → closest move it does have
const MOVE_FALLBACK = {
  heart: 'giggle', flex: 'jump', mindBlown: 'celebrate', shuffle: 'dance', bounce: 'dance', point: 'nod',
  handsUp: 'jump', think: 'shrug', sad: 'shrug', shake: 'shrug', giggle: 'nod', coin: 'nod', jump: 'celebrate', intro: 'greet',
};
/** Play any avatar move (no speech bubble). Returns its length in seconds. */
function perform(move) {
  let m = move;
  for (let i = 0; i < 4 && m && !avatar.reactions.includes(m); i++) m = MOVE_FALLBACK[m];
  if (!m || !avatar.reactions.includes(m)) m = avatar.reactions.includes('nod') ? 'nod' : avatar.reactions[0];
  const seconds = avatar.play(m) || 2;
  busyUntil = performance.now() + seconds * 1000;
  if (m === 'celebrate' && !avatar.ownConfetti) {
    setTimeout(() => confetti.burst(new THREE.Vector3(0, (avatar.height || 1.9) * avatar.object3d.scale.y + 0.1, 0.1)), 450);
  }
  return seconds;
}

/** Trigger a reaction. Returns false if unknown. */
// If the current avatar can't do a reaction, use the closest one it can.
const FALLBACK = { coin: 'nod' };

function play(name, { text } = {}) {
  if (avatar && !avatar.reactions.includes(name) && FALLBACK[name]) name = FALLBACK[name];
  const meta = REACTIONS[name];
  if (!meta || !avatar) return false;
  const seconds = avatar.play(name);
  if (!seconds) return false;
  busyUntil = performance.now() + seconds * 1000;
  if (meta.confettiAt != null && !avatar.ownConfetti) {
    setTimeout(() => confetti.burst(new THREE.Vector3(0, (avatar.height || 1.9) * avatar.object3d.scale.y + 0.1, 0.1)), meta.confettiAt * 1000);
  }
  say((text || t(meta.say)).replaceAll('{name}', look.name), Math.max(1800, seconds * 1000));
  setActiveButton(name);
  bridge.emit('reaction', { reaction: name, phase: 'start', duration: seconds });
  setTimeout(() => {
    if (performance.now() >= busyUntil - 50) setActiveButton(null);
    bridge.emit('reaction', { reaction: name, phase: 'end' });
  }, seconds * 1000);
  return true;
}

function say(text, ms = 3000) {
  if (!cfg.bubble || !text) return;
  bubbleEl.textContent = text;
  bubbleEl.classList.remove('is-visible');
  void bubbleEl.offsetWidth; // restart pop animation
  bubbleEl.classList.add('is-visible');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('is-visible'), ms);
}

// Cycle through reactions when the avatar itself is tapped.
const raycaster = new THREE.Raycaster();
let tapIndex = 0;
function onTap(e, stage) {
  if (feed?.active) { feed.tap(); return; } // feed: tap = pause, double tap = like
  const r = stage.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const hits = avatar.hitObjects ? raycaster.intersectObjects(avatar.hitObjects, false) : raycaster.intersectObject(avatar.object3d, true);
  if (!hits.length) return;
  hideHint();
  const list = ['greet', 'nod', 'dance', 'coin', 'celebrate', 'shrug'].filter((r) => avatar.reactions.includes(r));
  const name = list[tapIndex++ % list.length];
  bridge.emit('tap', { reaction: name });
  play(name);
}

function positionBubble(stage) {
  if (!bubbleEl.classList.contains('is-visible')) return;
  avatar.object3d.updateWorldMatrix(true, false);
  anchor.set(0, (avatar.height || 1.9) + 0.02, 0).applyMatrix4(avatar.object3d.matrixWorld);
  const p = stage.project(anchor);
  const w = stageEl.clientWidth;
  const bw = bubbleEl.offsetWidth;
  const bh = bubbleEl.offsetHeight;
  const x = clamp(p.x - bw / 2, 10, w - bw - 10);
  const y = Math.max(10, p.y - bh - 6);
  bubbleEl.style.transform = `translate(${x}px, ${y}px)`;
}

// --------------------------------------------------------------------------- dock (tabs)

function buildDock() {
  const dock = $('avatar-dock');
  if (!cfg.ui) { dock.hidden = true; app.classList.add('no-ui'); return; }

  const tabsEl = $('dock-tabs');
  tabsEl.innerHTML = '';
  for (const id of cfg.tabs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.id = `tab-${id}`;
    b.className = 'dock-tab';
    b.dataset.tab = id;
    b.setAttribute('aria-controls', `panel-${id}`);
    b.innerHTML = '<span aria-hidden="true"></span> <span></span>';
    b.firstChild.textContent = TABS[id].emoji;
    b.lastChild.textContent = t(TABS[id].label);
    b.addEventListener('click', () => openTab(id));
    tabsEl.append(b);
  }
  tabsEl.hidden = cfg.tabs.length < 2;
  tabsEl.dataset.count = cfg.tabs.length; // 5+ tabs → compact labels on phones

  buildButtons();
  if (cfg.tabs.includes('style')) {
    customizer = createCustomizer($('panel-style'), {
      lang: () => cfg.lang,
      getLook: () => look,
      setLook: (partial, opts = {}) => setLook(partial, { ...opts, fromPanel: true }),
      getCoins,
      supportsStyle: () => !!avatar?.supportsStyle,
      supportsHeight: () => avatar?.supportsHeight !== false,
      canSwitchCharacter: () => !cfg.model && !cfg.character, // a host that fixes the character hides the picker
    });
  }
  if (cfg.tabs.includes('play')) {
    games = createGames($('panel-play'), {
      lang: () => cfg.lang,
      react: (reaction, text) => play(reaction, { text }),
      onEvent: (type, payload) => bridge.emit(type, payload),
      getCoins,
      addCoins,
    });
  }
  if (cfg.tabs.includes('feed')) {
    feed = createFeed($('feed-layer'), {
      bgEl: $('feed-bg'),
      listEl: $('panel-feed'),
      lang: () => cfg.lang,
      getName: () => look.name,
      perform,
      addCoins,
      onEvent: (type, payload) => bridge.emit(type, payload),
      onPauseChange: (v) => { feedPaused = v; },
      persist: cfg.persist,
      swipeTarget: stageEl,
    });
  }
  if (cfg.tabs.includes('chat')) {
    chat = createChat($('panel-chat'), {
      lang: () => cfg.lang,
      getName: () => look.name,
      setName: (name) => setLook({ name }, { heightOnly: true }),
      getCoins,
      react: (reaction, text) => { if (!reaction || !play(reaction, { text })) say(text, 4000); },
      openTab: (id) => openTab(id),
      onEvent: (type, payload) => bridge.emit(type, payload),
      endpoint: cfg.chatEndpoint,
      persist: cfg.persist,
    });
  }
  openTab(cfg.tab, { silent: true });
}

function openTab(id, { silent } = {}) {
  if (!cfg.ui || !cfg.tabs.includes(id)) return false;
  for (const tid of Object.keys(TABS)) {
    $(`panel-${tid}`).hidden = tid !== id;
    const btn = $(`tab-${tid}`);
    if (btn) btn.setAttribute('aria-selected', String(tid === id));
  }
  const wasFeed = app.dataset.tab === 'feed';
  app.dataset.tab = id;
  if (id === 'feed') { feed?.show(); applyFrame(); controls?.reset(); } else if (wasFeed) { feed?.hide(); applyFrame(); }
  if (id === 'play') games?.refresh();
  if (id === 'style') customizer?.render();
  if (id === 'chat') chat?.onShow();
  if (!silent) { hideHint(); bridge.emit('tab', { tab: id }); }
  return true;
}

function buildButtons() {
  actionsEl.setAttribute('aria-label', t(UI_TEXT.actionsLabel));
  actionsEl.innerHTML = '';
  for (const name of cfg.reactions) {
    if (!avatar.reactions.includes(name)) continue; // e.g. "Save" (coin drop) is Sparkie-only
    const meta = REACTIONS[name];
    if (!meta) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-btn';
    btn.dataset.reaction = name;
    btn.innerHTML = '<span class="avatar-btn__emoji" aria-hidden="true"></span><span class="avatar-btn__label"></span>';
    btn.firstChild.textContent = meta.emoji;
    btn.lastChild.textContent = t(meta.label);
    btn.addEventListener('click', () => { hideHint(); play(name); });
    actionsEl.append(btn);
  }
}

/** Switch the UI language at runtime ('en' | 'de'). Look, coins and a running game are kept. */
function setLang(lang) {
  const l = lang === 'de' ? 'de' : 'en';
  if (l === cfg.lang) return false;
  cfg.lang = l;
  document.documentElement.lang = l;
  hintEl.textContent = t(UI_TEXT.hint);
  for (const id of cfg.tabs) {
    const b = $(`tab-${id}`);
    if (b) b.lastChild.textContent = t(TABS[id].label);
  }
  if (cfg.ui) buildButtons();
  customizer?.render();
  games?.relabel();
  chat?.relabel();
  feed?.relabel();
  bridge.emit('lang', { lang: l });
  return true;
}

function setActiveButton(name) {
  for (const b of actionsEl.querySelectorAll('.avatar-btn')) b.classList.toggle('is-active', b.dataset.reaction === name);
}

function hideHint() { hintEl.classList.add('is-hidden'); }

function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty('--sp-primary', cfg.primary);
  root.style.setProperty('--sp-accent', cfg.accent);
  root.lang = cfg.lang;
  hintEl.textContent = t(UI_TEXT.hint);
  if (cfg.bg === 'transparent') root.classList.add('bg-transparent');
  else if (cfg.bg !== 'gradient' && CSS.supports('color', cfg.bg)) {
    root.classList.add('bg-solid');
    root.style.setProperty('--sp-bg', cfg.bg);
  }
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
