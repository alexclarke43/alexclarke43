import * as THREE from 'three';
import { loadConfig } from './config.js';
import { REACTIONS, UI_TEXT } from './reactions.js';
import { createStage } from './stage.js';
import { DragRotate } from './DragRotate.js';
import { Confetti } from './effects/Confetti.js';
import { createBridge } from './bridge.js';
import { PlaceholderAvatar } from './avatars/PlaceholderAvatar.js';
import { GltfAvatar } from './avatars/GltfAvatar.js';
import { DEFAULT_LOOK, BASE_HEIGHT, OPTIONS, PALETTES, sanitizeLook, enforceUnlocks, loadSavedLook, saveLook } from './look.js';
import { getCoins, addCoins, onCoins, setPersist } from './progress.js';
import { createCustomizer } from './ui/customizer.js';
import { createGames } from './games/games.js';

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
    startGame: (d) => { if (openTab('play')) games?.startGame(d.game); },
  },
});

let avatar;
let controls;
let customizer;
let games;
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
  const stage = createStage(stageEl, cfg);
  avatar = await createAvatar();
  stage.turntable.add(avatar.object3d);
  applyHeight();

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
    avatar.update(dt);
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
    play, say, setLook, openTab,
    reset: () => controls.reset(),
    get look() { return { ...look }; },
    get coins() { return getCoins(); },
    config: cfg, avatar, games, customizer,
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
  return new PlaceholderAvatar(cfg, look);
}

// --------------------------------------------------------------------------- look

function initialLook() {
  const hex = (c) => `#${new THREE.Color(c).getHexString()}`;
  const fromCfg = { topColor: hex(cfg.primary), skin: hex(cfg.skin), hairColor: hex(cfg.hair) };
  const saved = cfg.persist ? loadSavedLook() : null;
  return enforceUnlocks(sanitizeLook({ ...DEFAULT_LOOK, ...fromCfg, ...saved, ...(cfg.look || {}) }), getCoins());
}

let lookEventTimer;
/** Change the avatar's look. `partial` may contain any key of DEFAULT_LOOK. */
function setLook(partial, { reaction, heightOnly, fromPanel } = {}) {
  look = enforceUnlocks(sanitizeLook({ ...look, ...partial }), getCoins());
  if (avatar) {
    applyHeight();
    if (!heightOnly && avatar.supportsStyle) avatar.setStyle(look);
  }
  if (!fromPanel) customizer?.render(); // keep the Style panel in sync with API/host changes
  if (cfg.persist) saveLook(look);
  clearTimeout(lookEventTimer);
  lookEventTimer = setTimeout(() => bridge.emit('look', { look }), 250);
  if (reaction) play(reaction);
  return { ...look };
}

function applyHeight() {
  avatar.object3d.scale.setScalar(look.height / BASE_HEIGHT);
}

// --------------------------------------------------------------------------- coins

const UNLOCKS = [
  ...OPTIONS.hairStyle.filter((o) => o.unlock).map((o) => ({ n: o.unlock, name: o.label })),
  ...OPTIONS.extras.filter((o) => o.unlock).map((o) => ({ n: o.unlock, name: o.label })),
  ...PALETTES.shoeColor.filter((c) => typeof c === 'object').map((c) => ({ n: c.unlock, name: { en: 'Gold sneakers', de: 'Gold-Sneaker' } })),
];

function updateCoins(total, delta) {
  coinsEl.hidden = !cfg.tabs.includes('play') && total === 0;
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

/** Trigger a reaction. Returns false if unknown. */
function play(name, { text } = {}) {
  const meta = REACTIONS[name];
  if (!meta || !avatar) return false;
  const seconds = avatar.play(name);
  if (!seconds) return false;
  busyUntil = performance.now() + seconds * 1000;
  if (meta.confettiAt != null) {
    setTimeout(() => confetti.burst(new THREE.Vector3(0, (avatar.height || 1.9) * avatar.object3d.scale.y + 0.1, 0.1)), meta.confettiAt * 1000);
  }
  say(text || t(meta.say), Math.max(1800, seconds * 1000));
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
  const r = stage.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  if (!raycaster.intersectObject(avatar.object3d, true).length) return;
  hideHint();
  const list = ['greet', 'nod', 'dance', 'celebrate', 'shrug'];
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

  buildButtons();
  if (cfg.tabs.includes('style')) {
    customizer = createCustomizer($('panel-style'), {
      lang: cfg.lang,
      getLook: () => look,
      setLook: (partial, opts = {}) => setLook(partial, { ...opts, fromPanel: true }),
      getCoins,
      supportsStyle: () => !!avatar?.supportsStyle,
    });
  }
  if (cfg.tabs.includes('play')) {
    games = createGames($('panel-play'), {
      lang: cfg.lang,
      react: (reaction, text) => play(reaction, { text }),
      onEvent: (type, payload) => bridge.emit(type, payload),
      getCoins,
      addCoins,
    });
  }
  openTab(cfg.tab, { silent: true });
}

function openTab(id, { silent } = {}) {
  if (!cfg.ui || !cfg.tabs.includes(id)) return false;
  for (const tid of ['react', 'style', 'play']) {
    $(`panel-${tid}`).hidden = tid !== id;
    const btn = $(`tab-${tid}`);
    if (btn) btn.setAttribute('aria-selected', String(tid === id));
  }
  app.dataset.tab = id;
  if (id === 'play') games?.refresh();
  if (id === 'style') customizer?.render();
  if (!silent) { hideHint(); bridge.emit('tab', { tab: id }); }
  return true;
}

function buildButtons() {
  actionsEl.setAttribute('aria-label', t(UI_TEXT.actionsLabel));
  actionsEl.innerHTML = '';
  for (const name of cfg.reactions) {
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
