import { reply as localReply, greeting, SUGGESTIONS } from './brain.js';

const TXT = {
  placeholder: { en: 'Message {name}…', de: 'Nachricht an {name}…' },
  send: { en: 'Send', de: 'Senden' },
  typing: { en: '{name} is typing…', de: '{name} schreibt…' },
  online: { en: 'online · your money bestie', de: 'online · dein Money-Bestie' },
  clear: { en: 'Clear chat', de: 'Chat leeren' },
  log: { en: 'Chat with {name}', de: 'Chat mit {name}' },
};

const KEY = 'sparkasse-avatar-chat';
const MAX_STORED = 40;
const REACTIONS = ['greet', 'celebrate', 'coin', 'nod', 'shrug', 'dance'];

/**
 * Chat panel: the avatar talks back like a best friend.
 * Replies come from the built-in brain (offline). If `endpoint` is set, the
 * message is POSTed there first ({ message, history, name, userName, lang } →
 * { reply, reaction? }) and the brain is used as fallback.
 */
export function createChat(root, { lang, getName, setName, getCoins, react, openTab, onEvent, endpoint = '', persist = true }) {
  const lng = () => (typeof lang === 'function' ? lang() : lang);
  const t = (k) => (TXT[k][lng()] ?? TXT[k].en).replaceAll('{name}', getName());
  const state = load();
  let busy = false;

  root.innerHTML = `
    <div class="ch">
      <div class="ch-head">
        <span class="ch-dot" aria-hidden="true"></span>
        <div class="ch-who"><b class="ch-name"></b><small class="ch-status"></small></div>
        <button type="button" class="ch-clear" aria-label="">🗑</button>
      </div>
      <div class="ch-log" role="log" aria-live="polite"></div>
      <div class="ch-chips" role="group"></div>
      <form class="ch-form" autocomplete="off">
        <input class="ch-input" type="text" maxlength="300" enterkeyhint="send">
        <button type="submit" class="ch-send">➤</button>
      </form>
    </div>`;
  const $ = (sel) => root.querySelector(sel);
  const logEl = $('.ch-log');
  const input = $('.ch-input');

  function load() {
    const fresh = { userName: '', messages: [] };
    if (!persist) return fresh;
    try { return { ...fresh, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh; }
  }
  function save() {
    if (!persist) return;
    state.messages = state.messages.slice(-MAX_STORED);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
  }
  const ctx = () => ({ lang: lng(), name: getName(), userName: state.userName, coins: getCoins() });

  function bubble(from, text) {
    const el = document.createElement('div');
    el.className = `ch-msg ch-msg--${from}`;
    el.textContent = text; // never innerHTML: user text and AI replies are untrusted
    logEl.append(el);
    return el;
  }
  function scrollDown() { logEl.scrollTop = logEl.scrollHeight; }

  function renderLog() {
    logEl.innerHTML = '';
    state.messages.forEach((m) => bubble(m.from, m.text));
    scrollDown();
  }

  function renderChips(list) {
    const chips = list || SUGGESTIONS[lng()] || SUGGESTIONS.en;
    const el = $('.ch-chips');
    el.innerHTML = '';
    chips.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch-chip';
      b.textContent = c;
      b.addEventListener('click', () => send(c));
      el.append(b);
    });
  }

  function relabel() {
    $('.ch-name').textContent = getName();
    $('.ch-status').textContent = t('online');
    $('.ch-clear').setAttribute('aria-label', t('clear'));
    $('.ch-clear').title = t('clear');
    $('.ch-send').setAttribute('aria-label', t('send'));
    input.placeholder = t('placeholder');
    input.setAttribute('aria-label', t('placeholder'));
    logEl.setAttribute('aria-label', t('log'));
    renderChips();
  }

  function push(from, text) {
    state.messages.push({ from, text });
    save();
    bubble(from, text);
    scrollDown();
    onEvent?.('chat', { from: from === 'bot' ? 'avatar' : 'user', text });
  }

  /** Short version of a reply for the speech bubble above the avatar. */
  function short(text) {
    if (text.length <= 110) return text;
    const first = text.match(/^.{20,110}?[.!?…](\s|$)/u);
    if (first) return first[0].trim();
    const cut = text.slice(0, 100);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)).replace(/[,;:–—-]\s*$/, '').trim()}…`;
  }

  async function getReply(text) {
    if (endpoint) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: state.messages.slice(-12).map((m) => ({ role: m.from === 'bot' ? 'assistant' : 'user', content: m.text })),
            name: getName(), userName: state.userName, lang: lng(),
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.reply === 'string' && data.reply.trim()) {
            // local brain still handles renaming / opening tabs so those keep working
            const local = localReply(text, ctx());
            return {
              text: data.reply.trim().slice(0, 1200),
              reaction: REACTIONS.includes(data.reaction) ? data.reaction : local.reaction,
              setName: local.setName, setUserName: local.setUserName, tab: local.tab,
            };
          }
        }
      } catch { /* network / timeout → local brain */ }
    }
    return localReply(text, ctx());
  }

  async function send(raw) {
    const text = String(raw || '').trim().slice(0, 300);
    if (!text || busy) return;
    busy = true;
    input.value = '';
    push('user', text);
    const typing = bubble('typing', t('typing'));
    typing.innerHTML = '<span></span><span></span><span></span>';
    typing.setAttribute('aria-label', t('typing'));
    scrollDown();
    const started = performance.now();
    const r = await getReply(text);
    // feel like a human typing: ~0.6–1.6 s depending on length
    const wait = Math.min(1600, 500 + r.text.length * 6) - (performance.now() - started);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    typing.remove();
    if (r.setUserName) state.userName = r.setUserName;
    if (r.setName) setName(r.setName);           // updates look → name shows everywhere
    push('bot', r.text);
    react(r.reaction, short(r.text));
    renderChips(r.chips);
    if (r.tab) setTimeout(() => openTab(r.tab), 1600);
    busy = false;
  }

  $('.ch-form').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  $('.ch-clear').addEventListener('click', () => {
    state.messages = [];
    save();
    renderLog();
    push('bot', greeting(ctx()));
    renderChips();
  });

  relabel();
  renderLog();

  return {
    send,
    relabel,
    /** Called when the chat tab opens: greet on first visit. */
    onShow() {
      relabel();
      if (!state.messages.length) push('bot', greeting(ctx()));
      scrollDown();
    },
    get state() { return state; },
  };
}
