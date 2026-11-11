/** Coins earned in the games. Stored locally (if allowed); the host page also gets `coins` events. */
const KEY = 'sparkasse-avatar-coins';
const listeners = new Set();
let persist = true;
let coins = 0;
try { coins = Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0); } catch { /* storage blocked */ }

export const getCoins = () => coins;

/** persist=false → start from 0 and never write to storage. */
export function setPersist(value) {
  persist = value;
  if (!persist) coins = 0;
}

export function addCoins(n) {
  coins = Math.max(0, coins + n);
  if (persist) { try { localStorage.setItem(KEY, String(coins)); } catch { /* ignore */ } }
  listeners.forEach((fn) => fn(coins, n));
  return coins;
}

export function onCoins(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Several avatar frames on one page (e.g. home card + Buddy screen) share the coin balance.
try {
  addEventListener('storage', (e) => {
    if (!persist || e.key !== KEY) return;
    const next = Math.max(0, parseInt(e.newValue, 10) || 0);
    if (next === coins) return;
    const delta = next - coins;
    coins = next;
    listeners.forEach((fn) => fn(coins, delta));
  });
} catch { /* no window */ }
