/*!
 * Avatar embed helper – optional convenience wrapper around a plain <iframe>.
 * No dependencies, no build step. Works in plain HTML, React, Vue, etc.
 *
 *   <div id="avatar"></div>
 *   <script src="embed/sparkasse-avatar-embed.js"></script>
 *   <script>
 *     const avatar = SparkasseAvatar.mount('#avatar', {
 *       src: '/avatar/index.html',          // where the avatar folder is hosted
 *       height: 520,                        // px or any CSS length
 *       params: { lang: 'de', ui: true },   // any config option (see README)
 *     });
 *     avatar.on('ready', () => avatar.play('greet'));
 *     avatar.play('celebrate', { text: 'Sparziel erreicht! 🎉' });
 *     avatar.startGame('quiz');                      // open the financial quiz
 *     avatar.on('game', (e) => e.phase === 'end' && console.log(e.score, e.total));
 *   </script>
 */
(function (global) {
  'use strict';

  function mount(target, options) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('SparkasseAvatar.mount: target not found');
    var o = Object.assign({ src: 'avatar/index.html', height: 520, title: 'Interactive 3D avatar', params: {} }, options);

    var url = new URL(o.src, document.baseURI);
    Object.keys(o.params).forEach(function (k) {
      var v = o.params[k];
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    // Let the avatar only accept messages from this page (skipped for file:// pages).
    if (location.origin && location.origin !== 'null') url.searchParams.set('parentOrigin', location.origin);
    var targetOrigin = url.origin && url.origin !== 'null' ? url.origin : '*';

    var iframe = document.createElement('iframe');
    iframe.src = url.toString();
    iframe.title = o.title;
    iframe.loading = 'lazy';
    iframe.setAttribute('allowtransparency', 'true');
    iframe.style.cssText = 'display:block;width:100%;border:0;background:transparent;color-scheme:normal;height:' +
      (typeof o.height === 'number' ? o.height + 'px' : o.height);
    el.appendChild(iframe);

    var ready = false;
    var queue = [];
    var listeners = {};

    function post(msg) {
      msg.target = 'sparkasse-avatar';
      if (!ready) { queue.push(msg); return; }
      iframe.contentWindow.postMessage(msg, targetOrigin);
    }

    function onMessage(e) {
      if (e.source !== iframe.contentWindow) return;
      var d = e.data;
      if (!d || d.source !== 'sparkasse-avatar') return;
      if (d.type === 'ready') {
        ready = true;
        queue.splice(0).forEach(post);
      }
      (listeners[d.type] || []).concat(listeners['*'] || []).forEach(function (fn) { fn(d); });
    }
    window.addEventListener('message', onMessage);

    return {
      iframe: iframe,
      /** reaction: 'greet' | 'celebrate' | 'nod' | 'shrug' | 'dance'; opts.text overrides the bubble text */
      play: function (reaction, opts) { post(Object.assign({ type: 'play', reaction: reaction }, opts)); },
      say: function (text, durationMs) { post({ type: 'say', text: text, duration: durationMs }); },
      reset: function () { post({ type: 'reset' }); },
      /** look: partial object, e.g. { hairStyle: 'bun', top: 'tee', topColor: '#7cf5d0', height: 168 } */
      setLook: function (look) { post({ type: 'setLook', look: look }); },
      /** tab: 'react' | 'style' | 'play' */
      openTab: function (tab) { post({ type: 'openTab', tab: tab }); },
      /** lang: 'en' | 'de' – switches the avatar's UI language live */
      setLang: function (lang) { post({ type: 'setLang', lang: lang }); },
      /** game: 'quiz' | 'sort' */
      startGame: function (game) { post({ type: 'startGame', game: game }); },
      /** events: 'ready' | 'reaction' | 'tap' | 'look' | 'game' | 'coins' | 'tab' | 'lang' | 'character' | 'error' | '*' – returns an unsubscribe function */
      on: function (type, fn) {
        (listeners[type] = listeners[type] || []).push(fn);
        return function () { listeners[type] = listeners[type].filter(function (f) { return f !== fn; }); };
      },
      destroy: function () {
        window.removeEventListener('message', onMessage);
        iframe.remove();
      },
    };
  }

  global.SparkasseAvatar = { mount: mount };
})(window);
