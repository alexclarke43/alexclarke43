/**
 * postMessage bridge between the avatar (inside an iframe) and the host page.
 *
 * Host → avatar:  { target: 'sparkasse-avatar', type: 'play', reaction: 'celebrate', text?: '…' }
 *                 { target: 'sparkasse-avatar', type: 'say',  text: '…', duration?: ms }
 *                 { target: 'sparkasse-avatar', type: 'reset' }
 *                 { target: 'sparkasse-avatar', type: 'setLook', look: { hairStyle: 'bun', height: 168, … } }
 *                 { target: 'sparkasse-avatar', type: 'openTab', tab: 'react' | 'chat' | 'feed' | 'style' | 'play' }
 *                 { target: 'sparkasse-avatar', type: 'startGame', game: 'quiz' | 'sort' }
 *                 { target: 'sparkasse-avatar', type: 'setLang', lang: 'en' | 'de' }
 *                 { target: 'sparkasse-avatar', type: 'chat', text: 'How do I save?' }
 *                 { target: 'sparkasse-avatar', type: 'addCoins', amount: 5 }   (1–100, e.g. a reward for saving)
 *                 { target: 'sparkasse-avatar', type: 'feed', action: 'play' | 'pause' | 'next' | 'prev' }
 * Avatar → host:  { source: 'sparkasse-avatar', type: 'ready' | 'reaction' | 'tap' | 'look' | 'game' | 'coins' | 'tab' | 'lang' | 'character' | 'chat' | 'feed' | 'error', … }
 *                 chat events: { type: 'chat', from: 'user' | 'avatar', text }
 *
 * The same events are also dispatched on window as `sparkasse-avatar:<type>` CustomEvents.
 */
export function createBridge({ parentOrigin = '*', handlers = {} }) {
  const parent = window.parent !== window ? window.parent : null;

  window.addEventListener('message', (e) => {
    if (parentOrigin !== '*' && e.origin !== parentOrigin) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.target !== 'sparkasse-avatar') return;
    const fn = handlers[d.type];
    if (typeof fn === 'function') fn(d);
  });

  return {
    emit(type, payload = {}) {
      const msg = { source: 'sparkasse-avatar', type, ...payload };
      if (parent) parent.postMessage(msg, parentOrigin);
      window.dispatchEvent(new CustomEvent(`sparkasse-avatar:${type}`, { detail: msg }));
    },
  };
}
