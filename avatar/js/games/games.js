import { QUIZ, NEEDS_WANTS } from './content.js';
import { OPTIONS, PALETTES } from '../look.js';

const QUIZ_LEN = 8;
const SORT_LEN = 10;
const COINS = { quiz: 10, sort: 5, streakBonus: 5 };

const TXT = {
  coins: { en: 'coins', de: 'Coins' },
  nextUnlock: { en: 'Next unlock: {item} at {n} 🪙', de: 'Nächstes Unlock: {item} ab {n} 🪙' },
  allUnlocked: { en: 'Everything unlocked – legend! 🏆', de: 'Alles freigeschaltet – Legende! 🏆' },
  quizTitle: { en: 'Money Quiz', de: 'Money Quiz' },
  quizSub: { en: '{n} questions · 10 🪙 per right answer', de: '{n} Fragen · 10 🪙 pro richtiger Antwort' },
  sortTitle: { en: 'Need or Want?', de: 'Brauch ich’s oder will ich’s?' },
  sortSub: { en: 'Sort {n} items · 5 🪙 each', de: '{n} Dinge sortieren · je 5 🪙' },
  best: { en: 'Best: {s}', de: 'Rekord: {s}' },
  quit: { en: 'Quit game', de: 'Spiel beenden' },
  next: { en: 'Next →', de: 'Weiter →' },
  finish: { en: 'See result', de: 'Zum Ergebnis' },
  need: { en: 'Need', de: 'Brauch ich' },
  want: { en: 'Want', de: 'Will ich' },
  isNeed: { en: '✔ That’s a need', de: '✔ Das brauchst du' },
  isWant: { en: '✔ That’s a want – fine sometimes, but optional', de: '✔ Das willst du – okay ab und zu, aber optional' },
  wrongNeed: { en: '✘ Actually a need – hard to live without', de: '✘ Eigentlich nötig – schwer, darauf zu verzichten' },
  wrongWant: { en: '✘ Actually a want – nice, but you’d manage without', de: '✘ Eigentlich ein Wunsch – schön, aber es geht auch ohne' },
  sayRight: { en: 'Correct! +{n} 🪙', de: 'Richtig! +{n} 🪙' },
  sayStreak: { en: '{s} in a row! 🔥 Bonus +{n}', de: '{s} in Folge! 🔥 Bonus +{n}' },
  sayWrong: { en: 'Not quite – check the tip 👇', de: 'Knapp daneben – schau dir den Tipp an 👇' },
  resultGreat: { en: 'Money pro! 💸', de: 'Finanz-Profi! 💸' },
  resultOk: { en: 'Solid! A bit more and you’re a pro 💪', de: 'Solide! Noch etwas üben und du bist Profi 💪' },
  resultLow: { en: 'Good start – every round makes you smarter 🌱', de: 'Guter Start – jede Runde macht dich schlauer 🌱' },
  earned: { en: '+{n} coins earned', de: '+{n} Coins verdient' },
  again: { en: 'Play again', de: 'Nochmal' },
  menu: { en: 'All games', de: 'Alle Spiele' },
  sayStart: { en: 'Let’s go – you got this! 💪', de: 'Los geht’s – du schaffst das! 💪' },
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Renders the "Play" panel.
 * react(reaction, text) makes the avatar respond; onEvent(type, payload) informs the host page.
 */
export function createGames(root, { lang, react, onEvent, getCoins, addCoins }) {
  const t = (k, vars = {}) => Object.entries(vars).reduce((s, [k2, v]) => s.replace(`{${k2}}`, v), TXT[k][lang] ?? TXT[k].en);
  const L = (o) => o[lang] ?? o.en;
  const state = { screen: 'menu', game: null };

  const bestKey = (g) => `sparkasse-avatar-best-${g}`;
  const getBest = (g) => { try { return localStorage.getItem(bestKey(g)); } catch { return null; } };
  const setBest = (g, score, total) => {
    try {
      const prev = getBest(g);
      if (!prev || score / total > Number(prev.split('/')[0]) / Number(prev.split('/')[1])) localStorage.setItem(bestKey(g), `${score}/${total}`);
    } catch { /* ignore */ }
  };

  function nextUnlock() {
    const items = [
      ...OPTIONS.hairStyle.filter((o) => o.unlock).map((o) => ({ n: o.unlock, item: L(o.label) })),
      ...OPTIONS.extras.filter((o) => o.unlock).map((o) => ({ n: o.unlock, item: L(o.label) })),
      ...PALETTES.shoeColor.filter((c) => typeof c === 'object').map((c) => ({ n: c.unlock, item: lang === 'de' ? 'Gold-Sneaker' : 'Gold sneakers' })),
    ].sort((a, b) => a.n - b.n);
    const next = items.find((i) => i.n > getCoins());
    return next ? t('nextUnlock', next) : t('allUnlocked');
  }

  // ---------------------------------------------------------------- menu
  function showMenu() {
    state.screen = 'menu';
    state.game = null;
    const bq = getBest('quiz');
    const bs = getBest('sort');
    root.innerHTML = `
      <div class="gm">
        <div class="gm-wallet"><span class="gm-coins">🪙 <b>${getCoins()}</b> ${t('coins')}</span><span class="gm-unlock">${esc(nextUnlock())}</span></div>
        <button type="button" class="gm-card" data-start="quiz">
          <span class="gm-card__emoji" aria-hidden="true">🧠</span>
          <span class="gm-card__text"><b>${t('quizTitle')}</b><small>${t('quizSub', { n: QUIZ_LEN })}</small>${bq ? `<small class="gm-best">${t('best', { s: bq })}</small>` : ''}</span>
        </button>
        <button type="button" class="gm-card" data-start="sort">
          <span class="gm-card__emoji" aria-hidden="true">🛒</span>
          <span class="gm-card__text"><b>${t('sortTitle')}</b><small>${t('sortSub', { n: SORT_LEN })}</small>${bs ? `<small class="gm-best">${t('best', { s: bs })}</small>` : ''}</span>
        </button>
      </div>`;
  }

  // ---------------------------------------------------------------- shared
  function startGame(id) {
    if (!['quiz', 'sort'].includes(id)) return false;
    const items = id === 'quiz'
      ? shuffle(QUIZ).slice(0, QUIZ_LEN).map((q) => {
        const order = shuffle(q.a.map((_, i) => i));
        return { ...q, order, correct: order.indexOf(q.c) };
      })
      : shuffle(NEEDS_WANTS).slice(0, SORT_LEN);
    state.game = { id, items, i: 0, score: 0, streak: 0, earned: 0, answered: false };
    state.screen = 'play';
    react('greet', t('sayStart'));
    onEvent('game', { game: id, phase: 'start', total: items.length });
    renderQuestion();
    return true;
  }

  function header() {
    const g = state.game;
    const pct = (g.i / g.items.length) * 100;
    return `<div class="gm-top">
        <button type="button" class="gm-x" data-act="quit" aria-label="${t('quit')}">✕</button>
        <div class="gm-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${g.items.length}" aria-valuenow="${g.i}"><div style="width:${pct}%"></div></div>
        <span class="gm-count">${g.i + 1}/${g.items.length}</span>
        <span class="gm-earned">🪙 +${g.earned}</span>
      </div>`;
  }

  function renderQuestion() {
    const g = state.game;
    g.answered = false;
    const item = g.items[g.i];
    if (g.id === 'quiz') {
      root.innerHTML = `<div class="gm gm-play">${header()}
        <p class="gm-q">${esc(L(item.q))}</p>
        <div class="gm-answers">${item.order.map((orig, k) => `<button type="button" class="gm-answer" data-answer="${k}">${esc(L(item.a[orig]))}</button>`).join('')}</div>
        <div class="gm-feedback" hidden></div>
      </div>`;
    } else {
      root.innerHTML = `<div class="gm gm-play">${header()}
        <div class="gm-item"><span class="gm-item__emoji" aria-hidden="true">${item.emoji}</span><span class="gm-item__label">${esc(L(item.label))}</span></div>
        <div class="gm-sort">
          <button type="button" class="gm-answer gm-answer--need" data-sort="need">✅ ${t('need')}</button>
          <button type="button" class="gm-answer gm-answer--want" data-sort="want">✨ ${t('want')}</button>
        </div>
        <div class="gm-feedback" hidden></div>
      </div>`;
    }
    root.scrollTop = 0;
  }

  function answer(isRight, chosenBtn, correctBtn, explanation) {
    const g = state.game;
    g.answered = true;
    root.querySelectorAll('.gm-answer').forEach((b) => { b.disabled = true; });
    chosenBtn.classList.add(isRight ? 'is-correct' : 'is-wrong');
    correctBtn?.classList.add('is-correct');
    const per = COINS[g.id];
    if (isRight) {
      g.score++;
      g.streak++;
      g.earned += per;
      addCoins(per);
      if (g.streak % 3 === 0) {
        g.earned += COINS.streakBonus;
        addCoins(COINS.streakBonus);
        react('celebrate', t('sayStreak', { s: g.streak, n: COINS.streakBonus }));
      } else {
        react('nod', t('sayRight', { n: per }));
      }
    } else {
      g.streak = 0;
      react('shrug', t('sayWrong'));
    }
    root.querySelector('.gm-earned').textContent = `🪙 +${g.earned}`;
    onEvent('game', { game: g.id, phase: 'answer', correct: isRight, index: g.i });

    const fb = root.querySelector('.gm-feedback');
    const last = g.i === g.items.length - 1;
    fb.innerHTML = `<p>${esc(explanation)}</p><button type="button" class="gm-next" data-act="next">${last ? t('finish') : t('next')}</button>`;
    fb.hidden = false;
    fb.classList.toggle('is-right', isRight);
    fb.querySelector('.gm-next').focus({ preventScroll: true });
    fb.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function next() {
    const g = state.game;
    g.i++;
    if (g.i >= g.items.length) return showResult();
    renderQuestion();
  }

  function showResult() {
    const g = state.game;
    state.screen = 'result';
    const ratio = g.score / g.items.length;
    setBest(g.id, g.score, g.items.length);
    const msg = ratio >= 0.75 ? t('resultGreat') : ratio >= 0.5 ? t('resultOk') : t('resultLow');
    react(ratio >= 0.75 ? 'celebrate' : ratio >= 0.5 ? 'dance' : 'greet', `${g.score}/${g.items.length} – ${msg}`);
    onEvent('game', { game: g.id, phase: 'end', score: g.score, total: g.items.length, coinsEarned: g.earned, coins: getCoins() });
    root.innerHTML = `<div class="gm gm-result">
        <div class="gm-score"><b>${g.score}</b><span>/${g.items.length}</span></div>
        <p class="gm-msg">${esc(msg)}</p>
        <p class="gm-earned-total">🪙 ${t('earned', { n: g.earned })}</p>
        <p class="gm-unlock">${esc(nextUnlock())}</p>
        <div class="gm-row">
          <button type="button" class="gm-next" data-start="${g.id}">${t('again')}</button>
          <button type="button" class="gm-next gm-next--ghost" data-act="menu">${t('menu')}</button>
        </div>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.start) return startGame(btn.dataset.start);
    if (btn.dataset.act === 'quit' || btn.dataset.act === 'menu') return showMenu();
    if (btn.dataset.act === 'next') return next();
    const g = state.game;
    if (!g || g.answered) return;
    const item = g.items[g.i];
    if (btn.dataset.answer != null) {
      const k = Number(btn.dataset.answer);
      answer(k === item.correct, btn, root.querySelector(`[data-answer="${item.correct}"]`), L(item.why));
    } else if (btn.dataset.sort) {
      const saidNeed = btn.dataset.sort === 'need';
      const right = saidNeed === item.need;
      const tip = right ? (item.need ? t('isNeed') : t('isWant')) : (item.need ? t('wrongNeed') : t('wrongWant'));
      answer(right, btn, root.querySelector(`[data-sort="${item.need ? 'need' : 'want'}"]`), tip);
    }
  });

  showMenu();
  return { state, showMenu, startGame, refresh: () => { if (state.screen === 'menu') showMenu(); } };
}
