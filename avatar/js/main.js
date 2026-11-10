import * as THREE from 'three';
import { loadConfig } from './config.js';
import { REACTIONS, UI_TEXT } from './reactions.js';
import { createStage } from './stage.js';
import { DragRotate } from './DragRotate.js';
import { Confetti } from './effects/Confetti.js';
import { createBridge } from './bridge.js';
import { PlaceholderAvatar } from './avatars/PlaceholderAvatar.js';
import { GltfAvatar } from './avatars/GltfAvatar.js';

const cfg = loadConfig();
const app = document.getElementById('avatar-app');
const stageEl = document.getElementById('avatar-stage');
const bubbleEl = document.getElementById('avatar-bubble');
const loaderEl = document.getElementById('avatar-loader');
const hintEl = document.getElementById('avatar-hint');
const actionsEl = document.getElementById('avatar-actions');
const t = (entry) => entry[cfg.lang] ?? entry.en;

applyTheme();
const bridge = createBridge({
  parentOrigin: cfg.parentOrigin,
  handlers: {
    play: (d) => play(d.reaction, { text: d.text }),
    say: (d) => say(String(d.text ?? ''), Number(d.duration) || 3000),
    reset: () => controls?.reset(),
  },
});

let avatar;
let controls;
let busyUntil = 0;
let bubbleTimer;
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

  const confetti = new Confetti(stage.scene, [cfg.primary, '#ffffff', cfg.accent, '#ffd23f', '#b8a4ff']);
  avatar.onConfetti = () => confetti.burst(new THREE.Vector3(0, (avatar.height || 1.9) + 0.1, 0.1));

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

  buildButtons();
  loaderEl.hidden = true;
  app.classList.add('is-ready');
  if (!cfg.hint) hintEl.hidden = true;

  window.SparkasseAvatarApp = { play, say, reset: () => controls.reset(), config: cfg, avatar };
  bridge.emit('ready', { reactions: avatar.reactions, model: cfg.model || 'placeholder' });

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
  return new PlaceholderAvatar(cfg);
}

/** Trigger a reaction. Returns false if unknown. */
function play(name, { text } = {}) {
  const meta = REACTIONS[name];
  if (!meta || !avatar) return false;
  const seconds = avatar.play(name);
  if (!seconds) return false;
  busyUntil = performance.now() + seconds * 1000;
  if (meta.confettiAt != null) setTimeout(() => avatar.onConfetti(), meta.confettiAt * 1000);
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

function buildButtons() {
  if (!cfg.ui) { actionsEl.hidden = true; app.classList.add('no-ui'); return; }
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
