/*
 * End-to-end smoke test for the avatar. Starts its own static server, drives Chromium
 * with Playwright and checks every interaction.
 *
 *   npm install            (installs playwright as a dev dependency)
 *   npm test
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json' };

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!ok) failures++;
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/test-model.glb') {
      res.writeHead(200, { 'Content-Type': MIME['.glb'] });
      return res.end(makeTestGlb());
    }
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/** Minimal rigged-ish GLB: a box node called "Head" with "Idle" and "Wave" clips. */
function makeTestGlb() {
  const pos = new Float32Array([-.3, 0, -.3, .3, 0, -.3, .3, 1.8, -.3, -.3, 1.8, -.3, -.3, 0, .3, .3, 0, .3, .3, 1.8, .3, -.3, 1.8, .3]);
  const idx = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  const idleT = new Float32Array([0, 1]);
  const idleV = new Float32Array([0, 0, 0, 0, 0.02, 0]);
  const waveT = new Float32Array([0, 0.5, 1]);
  const s = Math.sin(0.2), c = Math.cos(0.2);
  const waveV = new Float32Array([0, 0, 0, 1, 0, 0, s, c, 0, 0, 0, 1]);
  const parts = [pos, idx, idleT, idleV, waveT, waveV];
  const views = []; let off = 0;
  for (const p of parts) { views.push({ buffer: 0, byteOffset: off, byteLength: p.byteLength }); off += p.byteLength; }
  const bin = Buffer.concat(parts.map((p) => Buffer.from(p.buffer)));
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Root', children: [1] }, { name: 'Head', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-.3, 0, -.3], max: [.3, 1.8, .3] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3' },
      { bufferView: 4, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 5, componentType: 5126, count: 3, type: 'VEC4' },
    ],
    animations: [
      { name: 'Idle', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] },
      { name: 'Wave', samplers: [{ input: 4, output: 5 }], channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }] },
    ],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binBuf = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const chunk = (buf, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buf]); };
  return Buffer.concat([header, chunk(jsonBuf, 0x4e4f534a), chunk(binBuf, 0x004e4942)]);
}

async function openAvatar(browser, base, query, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/avatar/index.html${query}`);
  await page.waitForFunction(() => window.SparkasseAvatarApp, null, { timeout: 30000 });
  return { ctx, page, errors };
}

const rotY = (page) => page.evaluate(() => window.SparkasseAvatarApp.avatar.object3d.parent.rotation.y);

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  try {
    console.log('Desktop – placeholder avatar');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0');
      check('loader hidden after load', await page.locator('#avatar-loader').isHidden());
      check('canvas rendered', (await page.locator('canvas.avatar-canvas').count()) === 1);
      const buttons = await page.locator('.avatar-btn').allTextContents();
      check('5 reaction buttons', buttons.length === 5, buttons.join(' | '));

      for (const name of ['greet', 'celebrate', 'nod', 'shrug', 'dance']) {
        await page.click(`.avatar-btn[data-reaction="${name}"]`);
        await page.waitForTimeout(250);
        const st = await page.evaluate(() => ({
          current: window.SparkasseAvatarApp.avatar.current?.name,
          active: document.querySelector('.avatar-btn.is-active')?.dataset.reaction,
          bubble: document.querySelector('#avatar-bubble').classList.contains('is-visible'),
          text: document.querySelector('#avatar-bubble').textContent,
        }));
        check(`button "${name}" plays reaction + bubble`, st.current === name && st.active === name && st.bubble, st.text);
      }
      // Celebration spawns confetti
      await page.click('.avatar-btn[data-reaction="celebrate"]');
      await page.waitForTimeout(900);
      check('celebrate shows confetti', await page.evaluate(() => {
        let vis = false;
        window.SparkasseAvatarApp.avatar.object3d.parent.parent.traverse((o) => { if (o.isInstancedMesh && o.visible) vis = true; });
        return vis;
      }));

      // Idle animation actually moves joints
      const a = await page.evaluate(() => window.SparkasseAvatarApp.avatar.joints.head.rotation.y);
      const moved = await page.waitForFunction((v) => Math.abs(window.SparkasseAvatarApp.avatar.joints.head.rotation.y - v) > 1e-4, a, { timeout: 5000 })
        .then(() => true).catch(() => false);
      check('idle animation moves the head', moved);

      // Mouse drag rotates
      const box = await page.locator('canvas').boundingBox();
      const r0 = await rotY(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2);
      await page.mouse.up();
      const r1 = await rotY(page);
      check('mouse drag rotates avatar', Math.abs(r1 - r0) > 1, `Δ=${(r1 - r0).toFixed(2)} rad`);
      check('drag hides hint', await page.evaluate(() => document.querySelector('#avatar-hint').classList.contains('is-hidden')));

      // Reset via API
      await page.evaluate(() => window.SparkasseAvatarApp.reset());
      await page.waitForTimeout(1500);
      const r2 = await rotY(page);
      check('reset turns avatar back to front', Math.abs(Math.sin(r2)) < 0.05 && Math.cos(r2) > 0.99, r2.toFixed(3));

      // Click on the avatar → reaction (wait for current reaction to finish first)
      await page.waitForTimeout(3500);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
      await page.waitForTimeout(150);
      check('tap on avatar triggers reaction', !!(await page.evaluate(() => window.SparkasseAvatarApp.avatar.current?.name)));

      // Keyboard rotation (accessibility)
      await page.focus('canvas');
      const k0 = await rotY(page);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      check('arrow key rotates avatar', (await rotY(page)) > k0);

      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }

    console.log('Mobile (touch) – iPhone-sized viewport');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0&lang=de', {
        viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
      });
      const btns = page.locator('.avatar-btn');
      const n = await btns.count();
      let allVisible = true;
      for (let i = 0; i < n; i++) {
        const bb = await btns.nth(i).boundingBox();
        if (!bb || bb.x < 0 || bb.x + bb.width > 390 || bb.y + bb.height > 700 || bb.height < 40) allVisible = false;
      }
      check('all buttons inside viewport, ≥40px touch targets', allVisible);
      check('German labels', (await btns.nth(1).textContent()).includes('Feiern'));

      await btns.nth(1).tap();
      await page.waitForTimeout(200);
      check('tap button triggers celebrate', (await page.evaluate(() => window.SparkasseAvatarApp.avatar.current?.name)) === 'celebrate');

      // Real touch drag via CDP
      const cdp = await ctx.newCDPSession(page);
      const box = await page.locator('canvas').boundingBox();
      const y = box.y + box.height / 2;
      const r0 = await rotY(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100 + i * 20, y }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const r1 = await rotY(page);
      check('touch drag rotates avatar', Math.abs(r1 - r0) > 0.8, `Δ=${(r1 - r0).toFixed(2)} rad`);
      check('no console errors', errors.length === 0, errors.join(' / '));
      fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
      await page.screenshot({ path: path.join(__dirname, 'output', 'mobile.png') }).catch(() => {});
      await ctx.close();
    }

    console.log('Customisation (Style tab)');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0');
      check('3 tabs shown', (await page.locator('.dock-tab').count()) === 3);
      await page.click('#tab-style');
      check('style panel opens', await page.locator('#panel-style').isVisible());
      const meshCount = () => page.evaluate(() => { let n = 0; window.SparkasseAvatarApp.avatar.object3d.traverse((o) => { if (o.isMesh) n++; }); return n; });
      const before = await meshCount();
      const combos = [['hairStyle', 'bun'], ['hairStyle', 'long'], ['hairStyle', 'buzz'], ['top', 'jacket'], ['top', 'tee'], ['bottom', 'jeans'], ['bottom', 'shorts'], ['bottom', 'skirt']];
      let allOk = true;
      for (const [key, value] of combos) {
        await page.click(`#panel-style [data-key="${key}"][data-value="${value}"]`);
        const look = await page.evaluate(() => window.SparkasseAvatarApp.look);
        if (look[key] !== value) allOk = false;
      }
      check('hair / top / bottom options apply', allOk);
      check('avatar geometry rebuilt', (await meshCount()) !== before);
      await page.click('#panel-style [data-key="topColor"][data-value="#7cf5d0"]');
      const color = await page.evaluate(() => {
        let c = null;
        window.SparkasseAvatarApp.avatar.joints.spine.children.forEach((m) => { if (m.isMesh && !c) c = m.material.color.getHexString(); });
        return c;
      });
      check('colour swatch recolours clothing', color === '7cf5d0', color);
      await page.click('#panel-style [data-type="toggle"][data-key="glasses"]');
      check('glasses toggle', (await page.evaluate(() => window.SparkasseAvatarApp.look.glasses)) === true);
      await page.locator('#panel-style .cz-range').fill('195');
      const scale = await page.evaluate(() => window.SparkasseAvatarApp.avatar.object3d.scale.y);
      check('height slider scales avatar', Math.abs(scale - 195 / 175) < 0.001, scale.toFixed(3));
      check('height label updates', (await page.textContent('.cz-height-out')).includes('1.95'));
      check('locked items disabled at 0 coins', await page.locator('#panel-style [data-value="beanie"]').isDisabled());
      await page.click('#panel-style [data-act="random"]');
      check('"surprise me" randomises + avatar reacts', (await page.evaluate(() => window.SparkasseAvatarApp.avatar.current?.name)) === 'dance');

      // persistence across reloads
      const saved = await page.evaluate(() => window.SparkasseAvatarApp.look);
      await page.reload();
      await page.waitForFunction(() => window.SparkasseAvatarApp, null, { timeout: 30000 });
      const reloaded = await page.evaluate(() => window.SparkasseAvatarApp.look);
      check('look persists after reload', JSON.stringify(saved) === JSON.stringify(reloaded));
      // look passed via URL wins
      await page.goto(`${base}/avatar/index.html?autoGreet=0&look=${encodeURIComponent('{"hairStyle":"bun","height":160}')}`);
      await page.waitForFunction(() => window.SparkasseAvatarApp, null, { timeout: 30000 });
      const urlLook = await page.evaluate(() => window.SparkasseAvatarApp.look);
      check('look from URL param', urlLook.hairStyle === 'bun' && urlLook.height === 160);
      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }

    console.log('Games (Play tab)');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0&persist=0&tab=play');
      check('play tab open via config', await page.locator('#panel-play').isVisible());
      check('two games listed', (await page.locator('#panel-play .gm-card').count()) === 2);

      // Money Quiz: answer everything correctly
      await page.click('[data-start="quiz"]');
      const total = await page.evaluate(() => window.SparkasseAvatarApp.games.state.game.items.length);
      let reactionsSeen = new Set();
      for (let i = 0; i < total; i++) {
        const correct = await page.evaluate(() => { const g = window.SparkasseAvatarApp.games.state.game; return g.items[g.i].correct; });
        await page.click(`[data-answer="${correct}"]`);
        reactionsSeen.add(await page.evaluate(() => window.SparkasseAvatarApp.avatar.current?.name));
        check(`quiz Q${i + 1}: feedback + explanation shown`, await page.locator('.gm-feedback').isVisible());
        await page.click('[data-act="next"]');
      }
      check('quiz result screen', (await page.textContent('.gm-score')).replace(/\s/g, '') === `${total}/${total}`);
      const coins = await page.evaluate(() => window.SparkasseAvatarApp.coins);
      check('coins awarded incl. streak bonus', coins === total * 10 + Math.floor(total / 3) * 5, `${coins} coins`);
      check('avatar reacts (nod on correct, celebrate on streak)', reactionsSeen.has('nod') && reactionsSeen.has('celebrate'), [...reactionsSeen].join(','));
      check('coins badge updates', (await page.textContent('#avatar-coins')).includes(String(coins)));

      // Need or Want: answer everything wrong
      await page.click('[data-act="menu"]');
      await page.click('[data-start="sort"]');
      const n = await page.evaluate(() => window.SparkasseAvatarApp.games.state.game.items.length);
      for (let i = 0; i < n; i++) {
        const need = await page.evaluate(() => { const g = window.SparkasseAvatarApp.games.state.game; return g.items[g.i].need; });
        await page.click(`[data-sort="${need ? 'want' : 'need'}"]`);
        if (i === 0) check('wrong answer → avatar shrugs', (await page.evaluate(() => window.SparkasseAvatarApp.avatar.current?.name)) === 'shrug');
        await page.click('[data-act="next"]');
      }
      check('need-or-want result screen', (await page.textContent('.gm-score')).replace(/\s/g, '') === `0/${n}`);

      // Unlocks: 80+ coins → beanie, chain, gold sneakers available
      await page.click('#tab-style');
      check('beanie unlocked after earning coins', !(await page.locator('#panel-style [data-value="beanie"]').isDisabled()));
      await page.click('#panel-style [data-value="beanie"]');
      check('beanie can be worn', (await page.evaluate(() => window.SparkasseAvatarApp.look.hairStyle)) === 'beanie');
      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }

    console.log('GLB model support');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0&model=/test-model.glb');
      const info = await page.evaluate(() => {
        const av = window.SparkasseAvatarApp.avatar;
        return {
          type: av.constructor.name, clips: av.clipNames, head: av.headBone?.name,
          mapped: Object.keys(av.actions), greet: av.play('greet'), dance: av.play('dance'),
        };
      });
      check('GLB loaded as GltfAvatar', info.type === 'GltfAvatar', info.clips.join(','));
      check('clips mapped by name (Idle→idle, Wave→greet)', info.mapped.includes('idle') && info.mapped.includes('greet'), info.mapped.join(','));
      check('head bone found for look-at', info.head === 'Head');
      check('greet uses clip, dance uses procedural fallback', info.greet === 1 && info.dance > 3);
      await page.evaluate(() => window.SparkasseAvatarApp.setLook({ height: 190 }));
      check('height works for GLB models', Math.abs((await page.evaluate(() => window.SparkasseAvatarApp.avatar.object3d.scale.y)) - 190 / 175) < 0.001);
      await page.click('#tab-style');
      check('style tab explains GLB limits', await page.locator('#panel-style .cz-note').isVisible());
      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }
    {
      const { ctx, page } = await openAvatar(browser, base, '?autoGreet=0&model=/does-not-exist.glb');
      const type = await page.evaluate(() => window.SparkasseAvatarApp.avatar.constructor.name);
      check('missing model falls back to placeholder', type === 'PlaceholderAvatar');
      await ctx.close();
    }

    console.log('Iframe integration (examples/host-page.html)');
    {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/examples/host-page.html`);
      await page.waitForFunction(() => document.getElementById('log').textContent.includes('"ready"'), null, { timeout: 30000 });
      check('helper iframe sends "ready"', true);
      await page.click('#goal');
      // Software-rendered WebGL in CI can be slow, so allow generous time for the round-trip.
      await page.waitForFunction(() => document.getElementById('log').textContent.includes('"reaction":"celebrate"'), null, { timeout: 20000 }).catch(() => {});
      check('host button → celebrate (postMessage round-trip)', (await page.textContent('#log')).includes('"reaction":"celebrate"'));
      const frame = page.frames().find((f) => f.url().includes('tabs=style'));
      check('tabs param limits tabs (no React tab)', (await frame.locator('.dock-tab').count()) === 2);
      const bubble = await frame.textContent('#avatar-bubble');
      check('custom bubble text from host', bubble.includes('Savings goal reached'), bubble);
      await page.click('#outfit');
      await frame.waitForFunction(() => window.SparkasseAvatarApp.look.top === 'tee', null, { timeout: 20000 }).catch(() => {});
      check('host setLook changes outfit', (await frame.evaluate(() => window.SparkasseAvatarApp.look.top)) === 'tee');
      await page.click('#quiz');
      await frame.waitForSelector('.gm-q', { timeout: 20000 }).catch(() => {});
      check('host startGame opens the quiz', await frame.locator('.gm-q').isVisible());
      await page.waitForFunction(() => document.getElementById('log').textContent.includes('"type":"game"'), null, { timeout: 20000 }).catch(() => {});
      check('game events reach host', (await page.textContent('#log')).includes('"phase":"start"'));

      const plain = page.frames().find((f) => f.url().includes('lang=en') && !f.url().includes('tabs='));
      await plain.waitForFunction(() => window.SparkasseAvatarApp, null, { timeout: 30000 });
      await page.click('text=Make it dance');
      await page.waitForTimeout(300);
      check('plain iframe accepts postMessage', (await plain.evaluate(() => window.SparkasseAvatarApp.avatar.current?.name)) === 'dance');
      check('no page errors', errors.length === 0, errors.join(' / '));
      await page.screenshot({ path: path.join(__dirname, 'output', 'host-page.png') }).catch(() => {});
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
