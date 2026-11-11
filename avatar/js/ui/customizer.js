import { OPTIONS, PALETTES, HEIGHT_RANGE, DEFAULT_LOOK, unlockCost, randomLook } from '../look.js';

const TXT = {
  height: { en: 'Height', de: 'Größe' },
  character: { en: 'Character', de: 'Figur' },
  sparkieNote: {
    en: 'Sparkie keeps its signature look. Pick “You” to style your own avatar.',
    de: 'Sparkie bleibt, wie er ist. Wähle „Du“, um deinen eigenen Avatar zu stylen.',
  },
  skin: { en: 'Skin tone', de: 'Hautton' },
  hair: { en: 'Hair', de: 'Haare' },
  hatColor: { en: 'Beanie colour', de: 'Mützenfarbe' },
  top: { en: 'Top', de: 'Oberteil' },
  bottom: { en: 'Bottoms', de: 'Unterteil' },
  shoes: { en: 'Sneakers', de: 'Sneaker' },
  extras: { en: 'Extras', de: 'Extras' },
  random: { en: '🎲 Surprise me', de: '🎲 Überrasch mich' },
  reset: { en: '↺ Reset', de: '↺ Zurücksetzen' },
  locked: { en: 'Earn {n} coins in Play to unlock', de: 'Sammle {n} Coins unter „Spielen“, um das freizuschalten' },
  glbNote: {
    en: 'Hair and outfit options are available for the built-in avatar. Height works for every model.',
    de: 'Frisur und Outfit gibt es für den eingebauten Avatar. Die Größe funktioniert bei jedem Modell.',
  },
};

/**
 * Renders the "Style" panel. All changes go through setLook(partial) → the app
 * rebuilds the avatar, saves the look and notifies the host page.
 */
export function createCustomizer(root, { lang, getLook, setLook, getCoins, supportsStyle, supportsHeight = () => true, canSwitchCharacter = () => false }) {
  const t = (k, n) => (TXT[k][lang] ?? TXT[k].en).replace('{n}', n);
  const label = (o) => o.label[lang] ?? o.label.en;

  function lockAttrs(cost) {
    if (!cost || cost <= getCoins()) return '';
    return ` disabled data-locked="${cost}" title="${t('locked', cost)}" aria-label="${t('locked', cost)}"`;
  }

  function chips(key, options, current, isToggle = false) {
    return `<div class="cz-chips" role="group">${options.map((o) => {
      const on = isToggle ? !!getLook()[o.id] : current === o.id;
      const lock = lockAttrs(o.unlock);
      return `<button type="button" class="cz-chip" data-type="${isToggle ? 'toggle' : 'opt'}" data-key="${isToggle ? o.id : key}" data-value="${o.id}" aria-pressed="${on}"${lock}>${label(o)}${lock ? ` <span class="cz-lock">🔒${o.unlock}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function swatches(key, current) {
    return `<div class="cz-swatches" role="group">${PALETTES[key].map((entry, i) => {
      const color = typeof entry === 'string' ? entry : entry.color;
      const lock = lockAttrs(typeof entry === 'object' ? entry.unlock : 0);
      return `<button type="button" class="cz-swatch" style="--c:${color}" data-type="color" data-key="${key}" data-value="${color}" aria-pressed="${current.toLowerCase() === color.toLowerCase()}"${lock || ` aria-label="${key} ${i + 1}"`}>${lock ? '<span class="cz-lock">🔒</span>' : ''}</button>`;
    }).join('')}</div>`;
  }

  function render() {
    const L = getLook();
    const heightHtml = `
      <section class="cz-sec">
        <h3>${t('height')} <output class="cz-height-out">${(L.height / 100).toFixed(2)} m</output></h3>
        <input class="cz-range" type="range" min="${HEIGHT_RANGE[0]}" max="${HEIGHT_RANGE[1]}" step="1" value="${L.height}" aria-label="${t('height')}">
      </section>`;
    const characterHtml = canSwitchCharacter()
      ? `<section class="cz-sec cz-sec--character"><h3>${t('character')}</h3>${chips('character', OPTIONS.character, L.character)}</section>`
      : '';
    if (!supportsStyle()) {
      const note = L.character === 'sparkie' && canSwitchCharacter() ? t('sparkieNote') : t('glbNote');
      root.innerHTML = `<div class="cz">${characterHtml}${supportsHeight() ? heightHtml : ''}<p class="cz-note">${note}</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="cz">
        ${characterHtml}
        <div class="cz-actions">
          <button type="button" class="cz-btn" data-act="random">${t('random')}</button>
          <button type="button" class="cz-btn cz-btn--ghost" data-act="reset">${t('reset')}</button>
        </div>
        ${heightHtml}
        <section class="cz-sec"><h3>${t('skin')}</h3>${swatches('skin', L.skin)}</section>
        <section class="cz-sec"><h3>${t('hair')}</h3>${chips('hairStyle', OPTIONS.hairStyle, L.hairStyle)}${swatches('hairColor', L.hairColor)}
          ${L.hairStyle === 'beanie' ? `<h4>${t('hatColor')}</h4>${swatches('hatColor', L.hatColor)}` : ''}</section>
        <section class="cz-sec"><h3>${t('top')}</h3>${chips('top', OPTIONS.top, L.top)}${swatches('topColor', L.topColor)}</section>
        <section class="cz-sec"><h3>${t('bottom')}</h3>${chips('bottom', OPTIONS.bottom, L.bottom)}${swatches('bottomColor', L.bottomColor)}</section>
        <section class="cz-sec"><h3>${t('shoes')}</h3>${swatches('shoeColor', L.shoeColor)}</section>
        <section class="cz-sec"><h3>${t('extras')}</h3>${chips('extras', OPTIONS.extras, null, true)}</section>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.act === 'random') { setLook({ ...randomLook(getCoins()) }, { reaction: 'dance' }); render(); return; }
    if (btn.dataset.act === 'reset') { setLook({ ...DEFAULT_LOOK }, { reaction: 'greet' }); render(); return; }
    const { type, key, value } = btn.dataset;
    if (!type) return;
    if (unlockCost(type === 'toggle' ? 'extras' : key, value) > getCoins()) return;
    if (type === 'toggle') setLook({ [key]: !getLook()[key] });
    else setLook({ [key]: value });
    const scroll = root.scrollTop;
    render();
    root.scrollTop = scroll;
    root.querySelector(`[data-key="${key}"][data-value="${CSS.escape(value)}"]`)?.focus({ preventScroll: true });
  });

  root.addEventListener('input', (e) => {
    if (!e.target.classList.contains('cz-range')) return;
    const h = Number(e.target.value);
    root.querySelector('.cz-height-out').textContent = `${(h / 100).toFixed(2)} m`;
    setLook({ height: h }, { heightOnly: true });
  });

  render();
  return { render };
}
