/**
 * Avatar "look" (customisation) data model: options, palettes, unlockables,
 * persistence and randomisation. Pure data – no Three.js here.
 */
export const BASE_HEIGHT = 175; // cm that maps to scale 1.0
export const HEIGHT_RANGE = [150, 200];
export const GOLD = '#d4af37';

export const DEFAULT_LOOK = {
  skin: '#c98d6b',
  hairStyle: 'curls',
  hairColor: '#24170f',
  hatColor: '#f2c14e',
  top: 'hoodie',
  topColor: '#e3000f',
  bottom: 'cargo',
  bottomColor: '#2a2a33',
  shoeColor: '#f7f6f2',
  height: BASE_HEIGHT,
  glasses: false,
  headphones: true,
  earring: true,
  chain: false,
};

const L = (en, de) => ({ en, de });

export const OPTIONS = {
  hairStyle: [
    { id: 'curls', label: L('Curls', 'Locken') },
    { id: 'buzz', label: L('Buzz', 'Buzz Cut') },
    { id: 'bun', label: L('Bun', 'Dutt') },
    { id: 'long', label: L('Long', 'Lang') },
    { id: 'beanie', label: L('Beanie', 'Beanie'), unlock: 50 },
  ],
  top: [
    { id: 'hoodie', label: L('Hoodie', 'Hoodie') },
    { id: 'jacket', label: L('Bomber', 'Bomber') },
    { id: 'tee', label: L('Tee', 'T-Shirt') },
  ],
  bottom: [
    { id: 'cargo', label: L('Cargo', 'Cargo') },
    { id: 'jeans', label: L('Jeans', 'Jeans') },
    { id: 'shorts', label: L('Shorts', 'Shorts') },
    { id: 'skirt', label: L('Skirt', 'Rock') },
  ],
  extras: [
    { id: 'glasses', label: L('Glasses', 'Brille') },
    { id: 'headphones', label: L('Headphones', 'Kopfhörer') },
    { id: 'earring', label: L('Earring', 'Ohrring') },
    { id: 'chain', label: L('Gold chain', 'Goldkette'), unlock: 30 },
  ],
};

export const PALETTES = {
  skin: ['#f3d2b8', '#e8b896', '#c98d6b', '#a8714f', '#7d4f33', '#5a3826'],
  hairColor: ['#24170f', '#5b3a1e', '#a0522d', '#d9b26f', '#e8e2d6', '#b48cf2', '#ff6f91', '#2fb8a6'],
  topColor: ['#e3000f', '#15131a', '#f4f1ea', '#7cf5d0', '#b8a4ff', '#ffd23f', '#3d5a80', '#56704a'],
  bottomColor: ['#2a2a33', '#3d5a80', '#c8b89a', '#56704a', '#f4f1ea', '#15131a'],
  shoeColor: ['#f7f6f2', '#15131a', '#e3000f', '#7cf5d0', { color: GOLD, unlock: 80 }],
  hatColor: ['#f2c14e', '#e3000f', '#15131a', '#7cf5d0', '#b8a4ff', '#f4f1ea'],
};

/** Coins needed for an option (0 = free). */
export function unlockCost(section, value) {
  if (section in OPTIONS) return OPTIONS[section].find((o) => o.id === value)?.unlock || 0;
  const entry = PALETTES[section]?.find((c) => (typeof c === 'object' ? c.color : c) === value);
  return typeof entry === 'object' ? entry.unlock : 0;
}

const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Clean untrusted input (URL, host page, localStorage) into a valid look. */
export function sanitizeLook(input = {}) {
  const out = { ...DEFAULT_LOOK };
  if (!input || typeof input !== 'object') return out;
  for (const k of ['skin', 'hairColor', 'hatColor', 'topColor', 'bottomColor', 'shoeColor']) {
    if (isColor(input[k])) out[k] = input[k];
  }
  for (const k of ['hairStyle', 'top', 'bottom']) {
    if (OPTIONS[k].some((o) => o.id === input[k])) out[k] = input[k];
  }
  for (const k of ['glasses', 'headphones', 'earring', 'chain']) {
    if (typeof input[k] === 'boolean') out[k] = input[k];
  }
  const h = Number(input.height);
  if (Number.isFinite(h)) out.height = Math.round(Math.min(HEIGHT_RANGE[1], Math.max(HEIGHT_RANGE[0], h)));
  return out;
}

/** Remove anything the user hasn't unlocked yet. */
export function enforceUnlocks(look, coins) {
  const l = { ...look };
  if (unlockCost('hairStyle', l.hairStyle) > coins) l.hairStyle = DEFAULT_LOOK.hairStyle;
  if (unlockCost('shoeColor', l.shoeColor) > coins) l.shoeColor = DEFAULT_LOOK.shoeColor;
  if (l.chain && unlockCost('extras', 'chain') > coins) l.chain = false;
  return l;
}

export function randomLook(coins = 0) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const colors = (k) => PALETTES[k].filter((c) => typeof c === 'string' || c.unlock <= coins).map((c) => (typeof c === 'string' ? c : c.color));
  const opts = (k) => OPTIONS[k].filter((o) => (o.unlock || 0) <= coins).map((o) => o.id);
  return {
    skin: pick(PALETTES.skin),
    hairStyle: pick(opts('hairStyle')),
    hairColor: pick(colors('hairColor')),
    hatColor: pick(colors('hatColor')),
    top: pick(opts('top')),
    topColor: pick(colors('topColor')),
    bottom: pick(opts('bottom')),
    bottomColor: pick(colors('bottomColor')),
    shoeColor: pick(colors('shoeColor')),
    height: 155 + Math.round(Math.random() * 40),
    glasses: Math.random() < 0.35,
    headphones: Math.random() < 0.5,
    earring: Math.random() < 0.5,
    chain: coins >= 30 && Math.random() < 0.3,
  };
}

// --- persistence (localStorage may be blocked in third-party iframes → fail silently)
const KEY = 'sparkasse-avatar-look';
export function loadSavedLook() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveLook(look) {
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* ignore */ }
}
