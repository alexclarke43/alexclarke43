/**
 * Avatar "look" (customisation) data model: options, palettes, unlockables,
 * persistence and randomisation. Pure data – no Three.js here.
 */
export const BASE_HEIGHT = 175; // cm that maps to scale 1.0
export const HEIGHT_RANGE = [150, 200];
export const GOLD = '#d4af37';
export const DEFAULT_NAME = 'Nova';
export const NAME_MAX = 16;

/** Letters, digits, space, - and ' only; max 16 chars. */
export function cleanAvatarName(raw) {
  return String(raw ?? '').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

export const DEFAULT_LOOK = {
  name: DEFAULT_NAME,   // the avatar's name (user can rename it)
  character: 'human',   // 'human' (customisable) | 'sparkie' (mascot)
  body: 'female',       // 'female' = the 3D model (models/buddy.glb) | 'male' = matching built-in character
  // Defaults follow the uploaded model's outfit: grey crop/tank top, yellow joggers, chunky sneakers, red headphones, shades
  skin: '#613d26',
  hairStyle: 'curls',
  hairColor: '#25221e',
  hatColor: '#f2c14e',
  top: 'tank',
  topColor: '#746764',
  bottom: 'joggers',
  bottomColor: '#fbda53',
  shoeColor: '#f7f6f2',
  height: BASE_HEIGHT,
  glasses: false,
  shades: true,
  headphones: true,
  earring: false,
  chain: false,
  watch: false,
  bag: false,
};

const L = (en, de) => ({ en, de });

export const OPTIONS = {
  character: [
    { id: 'human', label: L('You', 'Du') },
    { id: 'sparkie', label: L('Sparkie', 'Sparkie') },
  ],
  body: [
    { id: 'male', label: L('Male', 'Männlich') },
    { id: 'female', label: L('Female', 'Weiblich') },
  ],
  hairStyle: [
    { id: 'curls', label: L('Curls', 'Locken') },
    { id: 'buzz', label: L('Buzz', 'Buzz Cut') },
    { id: 'bun', label: L('Bun', 'Dutt') },
    { id: 'long', label: L('Long', 'Lang') },
    { id: 'beanie', label: L('Beanie', 'Beanie'), unlock: 50 },
  ],
  top: [
    { id: 'tank', label: L('Tank', 'Tanktop') },
    { id: 'hoodie', label: L('Hoodie', 'Hoodie') },
    { id: 'jacket', label: L('Bomber', 'Bomber') },
    { id: 'tee', label: L('Tee', 'T-Shirt') },
  ],
  bottom: [
    { id: 'joggers', label: L('Joggers', 'Jogger') },
    { id: 'cargo', label: L('Cargo', 'Cargo') },
    { id: 'jeans', label: L('Jeans', 'Jeans') },
    { id: 'shorts', label: L('Shorts', 'Shorts') },
    { id: 'skirt', label: L('Skirt', 'Rock') },
  ],
  extras: [
    { id: 'shades', label: L('Shades', 'Sonnenbrille') },
    { id: 'glasses', label: L('Glasses', 'Brille') },
    { id: 'headphones', label: L('Headphones', 'Kopfhörer') },
    { id: 'earring', label: L('Earring', 'Ohrring') },
    { id: 'watch', label: L('Smartwatch', 'Smartwatch'), unlock: 20 },
    { id: 'chain', label: L('Gold chain', 'Goldkette'), unlock: 30 },
    { id: 'bag', label: L('Crossbody bag', 'Crossbody-Bag'), unlock: 60 },
  ],
};

export const PALETTES = {
  skin: ['#f3d2b8', '#e8b896', '#c98d6b', '#a8714f', '#7d4f33', '#613d26', '#4a2c1c'],
  hairColor: ['#25221e', '#24170f', '#5b3a1e', '#a0522d', '#d9b26f', '#e8e2d6', '#b48cf2', '#ff6f91', '#2fb8a6'],
  topColor: ['#746764', '#e3000f', '#15131a', '#f4f1ea', '#7cf5d0', '#b8a4ff', '#ffd23f', '#3d5a80', '#56704a'],
  bottomColor: ['#fbda53', '#2a2a33', '#3d5a80', '#c8b89a', '#56704a', '#f4f1ea', '#15131a'],
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
  for (const k of ['character', 'body', 'hairStyle', 'top', 'bottom']) {
    if (OPTIONS[k].some((o) => o.id === input[k])) out[k] = input[k];
  }
  for (const k of OPTIONS.extras.map((o) => o.id)) {
    if (typeof input[k] === 'boolean') out[k] = input[k];
  }
  if (typeof input.name === 'string' && cleanAvatarName(input.name)) out.name = cleanAvatarName(input.name);
  const h = Number(input.height);
  if (Number.isFinite(h)) out.height = Math.round(Math.min(HEIGHT_RANGE[1], Math.max(HEIGHT_RANGE[0], h)));
  return out;
}

/** Remove anything the user hasn't unlocked yet. */
export function enforceUnlocks(look, coins) {
  const l = { ...look };
  if (unlockCost('hairStyle', l.hairStyle) > coins) l.hairStyle = DEFAULT_LOOK.hairStyle;
  if (unlockCost('shoeColor', l.shoeColor) > coins) l.shoeColor = DEFAULT_LOOK.shoeColor;
  for (const o of OPTIONS.extras) if (l[o.id] && (o.unlock || 0) > coins) l[o.id] = false;
  return l;
}

export function randomLook(coins = 0) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const colors = (k) => PALETTES[k].filter((c) => typeof c === 'string' || c.unlock <= coins).map((c) => (typeof c === 'string' ? c : c.color));
  const opts = (k) => OPTIONS[k].filter((o) => (o.unlock || 0) <= coins).map((o) => o.id);
  return {
    character: 'human',
    body: pick(opts('body')),
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
    glasses: Math.random() < 0.25,
    shades: Math.random() < 0.35,
    headphones: Math.random() < 0.5,
    earring: Math.random() < 0.5,
    chain: coins >= 30 && Math.random() < 0.3,
    watch: coins >= 20 && Math.random() < 0.4,
    bag: coins >= 60 && Math.random() < 0.3,
  };
}

// --- persistence (localStorage may be blocked in third-party iframes → fail silently)
const KEY = 'sparkasse-avatar-look';
// Bump when the default avatar changes: older saved looks keep only the name and height,
// so returning users see the new avatar instead of their old outfit.
export const LOOK_VERSION = 2;
export function loadSavedLook() {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const saved = JSON.parse(s);
    if (saved?.v === LOOK_VERSION) return saved;
    return { name: saved?.name, height: saved?.height };
  } catch { return null; }
}
export function saveLook(look) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...look, v: LOOK_VERSION })); } catch { /* ignore */ }
}
