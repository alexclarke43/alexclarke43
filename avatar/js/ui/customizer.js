import { OPTIONS, PALETTES, HEIGHT_RANGE, DEFAULT_LOOK, NAME_MAX, unlockCost, randomLook } from '../look.js';

const TXT = {
  height: { en: 'Height', de: 'Größe' },
  name: { en: 'Name', de: 'Name' },
  nameHint: { en: 'What should your buddy be called?', de: 'Wie soll dein Buddy heißen?' },
  character: { en: 'Character', de: 'Figur' },
  body: { en: 'Body', de: 'Körper' },
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
  modelNote: {
    en: 'This 3D model keeps its hair, shades and headphones – change skin tone, colours, sneakers and unlock accessories. Male uses the built-in character with the full wardrobe.',
    de: 'Dieses 3D-Modell behält Frisur, Sonnenbrille und Kopfhörer – ändere Hautton, Farben, Sneaker und schalte Accessoires frei. „Männlich“ nutzt die eingebaute Figur mit allen Outfits.',
  },
  glbNote: {
    en: 'Hair and outfit options are available for the built-in avatar. Height works for every model.',
    de: 'Frisur und Outfit gibt es für den eingebauten Avatar. Die Größe funktioniert bei jedem Modell.',
  },
};

/**
 * Renders the "Style" panel. All changes go through setLook(partial) → the app
 * rebuilds the avatar, saves the look and notifies the host page.
 */
export function createCustomizer(root, { lang, getLook, setLook, getCoins, supportsStyle, styleKeys = () => null, supportedExtras = () => null, supportsHeight = () => true, canSwitchCharacter = () => false, canSwitchBody = () => true }) {
  // `lang` may be a string or a function (so the language can change at runtime)
  const lng = () => (typeof lang === 'function' ? lang() : lang);
  const t = (k, n) => (TXT[k][lng()] ?? TXT[k].en).replace('{n}', n);
  const label = (o) => o.label[lng()] ?? o.label.en;

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
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const nameHtml = `
      <section class="cz-sec cz-sec--name">
        <h3><label for="cz-name">${t('name')}</label></h3>
        <input id="cz-name" class="cz-name" type="text" maxlength="${NAME_MAX}" value="${esc(L.name)}" placeholder="${t('nameHint')}" autocomplete="off" enterkeyhint="done">
      </section>`;
    const characterHtml = canSwitchCharacter()
      ? `<section class="cz-sec cz-sec--character"><h3>${t('character')}</h3>${chips('character', OPTIONS.character, L.character)}</section>`
      : '';
    if (!supportsStyle()) {
      const note = L.character === 'sparkie' && canSwitchCharacter() ? t('sparkieNote') : t('glbNote');
      root.innerHTML = `<div class="cz">${nameHtml}${characterHtml}${supportsHeight() ? heightHtml : ''}<p class="cz-note">${note}</p></div>`;
      return;
    }
    const keys = styleKeys();            // null = everything (built-in character)
    const has = (k) => !keys || keys.includes(k);
    const sec = (cond, html) => (cond ? html : '');
    root.innerHTML = `
      <div class="cz">
        ${nameHtml}
        ${characterHtml}
        <div class="cz-actions">
          <button type="button" class="cz-btn" data-act="random">${t('random')}</button>
          <button type="button" class="cz-btn cz-btn--ghost" data-act="reset">${t('reset')}</button>
        </div>
        ${sec(canSwitchBody(), `<section class="cz-sec cz-sec--body"><h3>${t('body')}</h3>${chips('body', OPTIONS.body, L.body)}</section>`)}
        ${heightHtml}
        ${sec(keys, `<p class="cz-note">${t('modelNote')}</p>`)}
        ${sec(has('skin'), `<section class="cz-sec"><h3>${t('skin')}</h3>${swatches('skin', L.skin)}</section>`)}
        ${sec(has('hairStyle'), `<section class="cz-sec"><h3>${t('hair')}</h3>${chips('hairStyle', OPTIONS.hairStyle, L.hairStyle)}${swatches('hairColor', L.hairColor)}
          ${L.hairStyle === 'beanie' ? `<h4>${t('hatColor')}</h4>${swatches('hatColor', L.hatColor)}` : ''}</section>`)}
        ${sec(has('top') || has('topColor'), `<section class="cz-sec"><h3>${t('top')}</h3>${has('top') ? chips('top', OPTIONS.top, L.top) : ''}${swatches('topColor', L.topColor)}</section>`)}
        ${sec(has('bottom') || has('bottomColor'), `<section class="cz-sec"><h3>${t('bottom')}</h3>${has('bottom') ? chips('bottom', OPTIONS.bottom, L.bottom) : ''}${swatches('bottomColor', L.bottomColor)}</section>`)}
        ${sec(has('shoeColor'), `<section class="cz-sec"><h3>${t('shoes')}</h3>${swatches('shoeColor', L.shoeColor)}</section>`)}
        ${sec(has('extras'), `<section class="cz-sec"><h3>${t('extras')}</h3>${chips('extras', OPTIONS.extras.filter((o) => !supportedExtras() || supportedExtras().includes(o.id)), null, true)}</section>`)}
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.act === 'random') { setLook({ ...randomLook(getCoins()), body: getLook().body }, { reaction: 'dance' }); render(); return; } // keep the body (avoids a model reload)
    if (btn.dataset.act === 'reset') { setLook({ ...DEFAULT_LOOK, name: getLook().name }, { reaction: 'greet' }); render(); return; } // keep the name
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

  let nameTimer;
  root.addEventListener('input', (e) => {
    if (e.target.classList.contains('cz-name')) {
      clearTimeout(nameTimer);
      const v = e.target.value;
      if (v.trim()) nameTimer = setTimeout(() => setLook({ name: v }, { heightOnly: true }), 300);
      return;
    }
    if (!e.target.classList.contains('cz-range')) return;
    const h = Number(e.target.value);
    root.querySelector('.cz-height-out').textContent = `${(h / 100).toFixed(2)} m`;
    setLook({ height: h }, { heightOnly: true });
  });

  root.addEventListener('change', (e) => {
    if (!e.target.classList.contains('cz-name')) return;
    clearTimeout(nameTimer);
    if (e.target.value.trim()) setLook({ name: e.target.value }, { reaction: 'greet' });
    e.target.value = getLook().name; // show the cleaned name (or restore if emptied)
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('cz-name')) e.target.blur(); });

  render();
  return { render };
}
