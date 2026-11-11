/**
 * Configuration for the avatar.
 *
 * Priority (lowest → highest):
 *   1. DEFAULTS below
 *   2. window.SPARKASSE_AVATAR_CONFIG  (set in a <script> before main.js)
 *   3. URL query parameters            (e.g. index.html?model=models/me.glb&ui=0)
 */
export const DEFAULTS = {
  model: '',                 // URL of a .glb/.gltf file. Empty → built-in placeholder character
  clips: null,               // optional JSON map reaction → clip name, e.g. {"greet":"Wave"}
  ui: true,                  // show the reaction buttons
  bubble: true,              // show speech bubbles
  hint: true,                // show "drag to spin" hint
  badge: true,               // show the coins badge (hide it if the host page shows coins itself)
  autoGreet: true,           // wave once on load
  lookAtPointer: true,       // head follows the mouse / finger
  lang: 'en',                // 'en' | 'de'
  bg: 'gradient',            // 'gradient' | 'transparent' | any CSS colour
  primary: '#e3000f',        // hoodie / brand colour
  accent: '#7cf5d0',         // highlight colour (headphones, sneakers, UI)
  skin: '#c98d6b',
  hair: '#24170f',
  reactions: 'greet,celebrate,coin,nod,shrug,dance', // buttons to show (order matters; unsupported ones are skipped)
  character: '',             // 'human' | 'sparkie' – overrides the saved choice
  tabs: 'react,style,play',  // which panels to offer: react (buttons), style (customiser), play (games)
  tab: 'react',              // panel open on load
  look: null,                // JSON look, e.g. {"hairStyle":"bun","top":"tee","height":168} (see look.js)
  persist: true,             // remember look + coins in localStorage
  parentOrigin: '*',         // restrict postMessage to this origin, e.g. https://bank.example
};

const BOOL_KEYS = ['ui', 'bubble', 'hint', 'autoGreet', 'lookAtPointer', 'persist', 'badge'];
const COLOR_KEYS = ['primary', 'accent', 'skin', 'hair'];

function toBool(v) {
  if (typeof v === 'boolean') return v;
  return !['0', 'false', 'no', 'off', ''].includes(String(v).toLowerCase());
}

/** Accepts "#ff0000", "ff0000" (handy in URLs where # must be encoded) or CSS names. */
function toColor(v, fallback) {
  if (typeof v !== 'string') return fallback;
  const s = /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? `#${v}` : v;
  return typeof CSS !== 'undefined' && CSS.supports('color', s) ? s : fallback;
}

export function loadConfig(search = window.location.search) {
  const cfg = { ...DEFAULTS, ...(window.SPARKASSE_AVATAR_CONFIG || {}) };
  const params = new URLSearchParams(search);
  for (const key of Object.keys(DEFAULTS)) {
    if (params.has(key)) cfg[key] = params.get(key);
  }

  for (const k of BOOL_KEYS) cfg[k] = toBool(cfg[k]);
  for (const k of COLOR_KEYS) cfg[k] = toColor(cfg[k], DEFAULTS[k]);

  if (typeof cfg.clips === 'string') {
    try { cfg.clips = JSON.parse(cfg.clips); } catch { cfg.clips = null; }
  }
  if (typeof cfg.look === 'string') {
    try { cfg.look = JSON.parse(cfg.look); } catch { cfg.look = null; }
  }
  if (typeof cfg.tabs === 'string') {
    cfg.tabs = cfg.tabs.split(',').map((s) => s.trim()).filter((s) => ['react', 'style', 'play'].includes(s));
  }
  if (!cfg.tabs.length) cfg.tabs = ['react'];
  if (!cfg.tabs.includes(cfg.tab)) cfg.tab = cfg.tabs[0];
  if (typeof cfg.reactions === 'string') {
    cfg.reactions = cfg.reactions.split(',').map((s) => s.trim()).filter(Boolean);
  }
  cfg.lang = cfg.lang === 'de' ? 'de' : 'en';
  return cfg;
}
