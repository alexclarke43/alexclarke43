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
  // Most checks exercise the built-in character (body "male"); `glb=1` keeps the default 3D model.
  const q = query.includes('look=') || query.includes('glb=1') || query.includes('model=') || query.includes('character=')
    ? query : `${query}${query.includes('?') ? '&' : '?'}look=${encodeURIComponent('{"body":"male"}')}`;
  await page.goto(`${base}/avatar/index.html${q}`);
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
      check('6 reaction buttons', buttons.length === 6, buttons.join(' | '));

      await page.waitForTimeout(1500); // let the software renderer finish compiling shaders (can block the page for seconds)
      for (const name of ['greet', 'celebrate', 'coin', 'nod', 'shrug', 'dance']) {
        await page.click(`.avatar-btn[data-reaction="${name}"]`);
        await page.waitForFunction((n) => window.SparkasseAvatarApp.avatar.current?.name === n && document.querySelector('.avatar-btn.is-active')?.dataset.reaction === n && document.querySelector('#avatar-bubble').classList.contains('is-visible'), name, { timeout: 3000 }).catch(() => {});
        const st = await page.evaluate(() => ({
          current: window.SparkasseAvatarApp.avatar.current?.name,
          active: document.querySelector('.avatar-btn.is-active')?.dataset.reaction,
          bubble: document.querySelector('#avatar-bubble').classList.contains('is-visible'),
          text: document.querySelector('#avatar-bubble').textContent,
        }));
        check(`button "${name}" plays reaction + bubble`, st.current === name && st.active === name && st.bubble, JSON.stringify(st));
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
      check('5 tabs shown', (await page.locator('.dock-tab').count()) === 5);
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
      const kind = () => page.evaluate(() => window.SparkasseAvatarApp.avatar.constructor.name);
      await page.click('#panel-style [data-key="body"][data-value="female"]');
      await page.waitForFunction(() => window.SparkasseAvatarApp.avatar.constructor.name === 'RiggedAvatar', null, { timeout: 30000 }).catch(() => {});
      check('body option: female switches to the 3D model', (await page.evaluate(() => window.SparkasseAvatarApp.look.body)) === 'female' && (await kind()) === 'RiggedAvatar');
      check('3D model: Style panel offers only what the model supports',
        (await page.locator('#panel-style [data-key="hairStyle"]').count()) === 0 && (await page.locator('#panel-style [data-key="topColor"]').count()) > 0 &&
        (await page.locator('#panel-style .cz-note').count()) === 1);
      await page.click('#panel-style [data-key="body"][data-value="male"]');
      await page.waitForFunction(() => window.SparkasseAvatarApp.avatar.constructor.name === 'PlaceholderAvatar', null, { timeout: 30000 }).catch(() => {});
      check('body option: male = built-in character in the same outfit style', (await kind()) === 'PlaceholderAvatar' &&
        (await page.evaluate(() => window.SparkasseAvatarApp.avatar.style.body)) === 'male');
      check('body chip shows as selected', (await page.getAttribute('#panel-style [data-key="body"][data-value="male"]', 'aria-pressed')) === 'true');
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

    console.log('3D model (models/buddy.glb) – default avatar');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0&persist=0&glb=1');
      await page.waitForFunction(() => window.SparkasseAvatarApp.avatar, null, { timeout: 30000 });
      const A = (fn, arg) => page.evaluate(fn, arg);
      check('default avatar is the rigged 3D model', (await A(() => window.SparkasseAvatarApp.avatar.constructor.name)) === 'RiggedAvatar');
      check('model normalised to the stage', await A(() => { const a = window.SparkasseAvatarApp.avatar; const h = a.bones.Head.getWorldPosition(a.bones.Head.position.clone()).y; return h > 1.2 && h < 2.0; }));
      const armQ = () => A(() => window.SparkasseAvatarApp.avatar.bones.RightArm.quaternion.toArray().map((v) => +v.toFixed(3)).join());
      const restArm = await armQ();
      await A(() => window.SparkasseAvatarApp.play('greet'));
      await page.waitForTimeout(900);
      check('reactions are retargeted onto the skeleton (arm moves on greet)', (await armQ()) !== restArm);
      const moves = ['celebrate', 'nod', 'shrug', 'dance', 'coin', 'heart', 'flex', 'mindBlown', 'shuffle', 'bounce', 'point', 'handsUp', 'think', 'sad', 'giggle', 'samba'];
      const missing = await A((ms) => ms.filter((m) => !window.SparkasseAvatarApp.avatar.reactions.includes(m)), moves);
      check('all moves incl. the model\'s own samba clip are available', missing.length === 0, missing.join());
      await A(() => window.SparkasseAvatarApp.perform('samba'));
      await page.waitForTimeout(600);
      check('samba clip plays', (await A(() => window.SparkasseAvatarApp.avatar.current?.name)) === 'samba');
      const nan = await A(() => { let n = 0; window.SparkasseAvatarApp.avatar.model.traverse((o) => { if (o.isBone && (isNaN(o.quaternion.x) || isNaN(o.position.y))) n++; }); return n; });
      check('skeleton stays valid while blending clip + procedural moves', nan === 0);
      await A(() => window.SparkasseAvatarApp.setLook({ topColor: '#e3000f', bottomColor: '#3d5a80', skin: '#e8b896' }));
      const u = await A(() => { const x = window.SparkasseAvatarApp.avatar.uniforms; return [x.uTopOn.value, x.uBottomOn.value, x.uSkinOn.value]; });
      check('Style colours recolour the model (top, joggers, skin)', u.join() === '1,1,1');
      await A(() => window.SparkasseAvatarApp.setLook({ height: 190 }));
      check('height works on the model', Math.abs((await A(() => window.SparkasseAvatarApp.avatar.object3d.scale.y)) - 190 / 175) < 1e-3);
      await A(() => window.SparkasseAvatarApp.setLook({ body: 'male' }));
      await page.waitForFunction(() => window.SparkasseAvatarApp.avatar.constructor.name === 'PlaceholderAvatar', null, { timeout: 30000 }).catch(() => {});
      check('male version uses the built-in character in the same outfit', await A(() => { const a = window.SparkasseAvatarApp.avatar; return a.constructor.name === 'PlaceholderAvatar' && a.style.top === 'tank' && a.style.bottom === 'joggers' && a.style.shades && a.style.headphones; }));
      await A(() => window.SparkasseAvatarApp.setLook({ body: 'female' }));
      await page.waitForFunction(() => window.SparkasseAvatarApp.avatar.constructor.name === 'RiggedAvatar', null, { timeout: 30000 }).catch(() => {});
      check('switching back reuses the downloaded model', (await A(() => window.SparkasseAvatarApp.avatar.constructor.name)) === 'RiggedAvatar');
      await page.click('#tab-feed');
      await A(() => { const f = window.SparkasseAvatarApp.feed; const i = f.clips.findIndex((c) => c.id === 'samba'); while (f.clip.id !== 'samba') f.next(); return i; });
      await page.waitForTimeout(400);
      check('feed plays the samba clip on the model', (await A(() => window.SparkasseAvatarApp.avatar.current?.name)) === 'samba');
      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }

    console.log('Chat + avatar name');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0&persist=0&lang=en&chatEndpoint=https://evil.example/x');
      check('chatEndpoint cannot be set from the URL', (await page.evaluate(() => window.SparkasseAvatarApp.config.chatEndpoint)) === '');
      await page.click('#tab-chat');
      check('chat opens with a greeting using the default name', (await page.textContent('.ch-msg--bot')).includes('Nova'));
      const waitReply = () => page.waitForFunction(() => !document.querySelector('.ch-msg--typing'), null, { timeout: 10000 });
      const send = async (text) => { await page.fill('.ch-input', text); await page.press('.ch-input', 'Enter'); await page.waitForTimeout(50); await waitReply(); };
      await send('How do I save?');
      const last = () => page.locator('.ch-msg--bot').last().textContent();
      check('avatar answers money questions', /save|€|emergency|round up/i.test(await last()));
      check('reply also shows in the speech bubble', (await page.textContent('#avatar-bubble')).length > 10);
      await send("I'll call you Kai");
      check('renaming via chat', (await page.evaluate(() => window.SparkasseAvatarApp.look.name)) === 'Kai' && (await page.textContent('.ch-name')) === 'Kai');
      check('input placeholder uses the new name', (await page.getAttribute('.ch-input', 'placeholder')).includes('Kai'));
      await send('<img src=x onerror="window.__xss=1">');
      check('user text is rendered as text (no HTML injection)', !(await page.evaluate(() => window.__xss)) && (await page.locator('.ch-log img').count()) === 0);
      await page.evaluate(() => window.SparkasseAvatarApp.setLang('de'));
      await send('bin pleite');
      check('chat replies in German after switching', /pleite|Pleite|Budget|Geld/.test(await last()));
      await page.click('#tab-style');
      check('Style panel shows the name', (await page.inputValue('#cz-name')) === 'Kai');
      await page.fill('#cz-name', 'Luna<script>');
      await page.press('#cz-name', 'Enter');
      check('renaming in Style panel (cleaned)', (await page.evaluate(() => window.SparkasseAvatarApp.look.name)) === 'Lunascript');
      await page.click('#tab-chat');
      check('chat header follows the Style name', (await page.textContent('.ch-name')) === 'Lunascript');
      await send('lass uns ein Quiz spielen');
      await page.waitForFunction(() => document.getElementById('tab-play').getAttribute('aria-selected') === 'true', null, { timeout: 5000 }).catch(() => {});
      check('chat can open the games', (await page.getAttribute('#tab-play', 'aria-selected')) === 'true');
      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }

    console.log('For You feed');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0&persist=0&lang=en', { viewport: { width: 400, height: 820 } });
      await page.click('#tab-feed');
      const F = () => page.evaluate(() => { const f = window.SparkasseAvatarApp.feed; return { id: f.clip.id, active: f.active, paused: f.paused, cur: window.SparkasseAvatarApp.avatar.current?.name }; });
      check('feed opens and plays the first clip', (await F()).active && (await page.locator('.fd-caption').isVisible()) && !!(await F()).cur);
      check('avatar handle uses the avatar name', (await page.textContent('.fd-handle b')) === '@nova');
      check('reaction buttons/bubble hidden in feed', !(await page.locator('.avatar-bubble').isVisible()));
      const first = (await F()).id;
      await page.click('.fd-next');
      check('next button → next clip', (await F()).id !== first);
      await page.keyboard.press('ArrowUp');
      check('arrow key → previous clip', (await F()).id === first);
      // swipe up on the stage
      const box = await page.locator('#avatar-stage').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3, { steps: 6 });
      await page.mouse.up();
      check('swipe up → next clip', (await F()).id !== first);
      await page.click('.fd-prev');
      await page.click('.fd-like');
      check('like toggles + counts up', (await page.getAttribute('.fd-like', 'aria-pressed')) === 'true');
      await page.evaluate(() => window.SparkasseAvatarApp.feed.togglePause());
      check('pause shows play button and freezes', (await F()).paused && await page.locator('.fd-paused').isVisible());
      await page.click('.fd-paused');
      check('tap play resumes', !(await F()).paused);
      // finish a learn clip quickly → coins reward once
      const coins0 = await page.evaluate(() => window.SparkasseAvatarApp.coins);
      await page.evaluate(() => { const f = window.SparkasseAvatarApp.feed; for (let i = 0; i < f.clip.steps.length; i++) f.update(30); });
      check('watching a learn clip to the end earns 3 coins', (await page.evaluate(() => window.SparkasseAvatarApp.coins)) === coins0 + 3);
      await page.evaluate(() => window.SparkasseAvatarApp.setLang('de'));
      check('feed relabels live (DE)', (await page.textContent('.fd-tabname')) === 'Für dich');
      await page.evaluate(() => window.SparkasseAvatarApp.setLook({ name: 'Kai' }));
      check('handle follows renaming', (await page.textContent('.fd-handle b')) === '@kai');
      const moves = await page.evaluate(() => ['heart', 'flex', 'mindBlown', 'shuffle', 'bounce', 'point', 'handsUp'].every((m) => window.SparkasseAvatarApp.avatar.reactions.includes(m)));
      check('new emotes/dances available on the avatar', moves);
      await page.click('#tab-chat');
      check('leaving the feed stops it', !(await F()).active && !(await page.locator('#feed-layer').isVisible()));
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
      check('avatar reacts (catches a coin when correct, celebrates streaks)', reactionsSeen.has('coin') && reactionsSeen.has('celebrate'), [...reactionsSeen].join(','));
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

    console.log('Sparkie (teammate\'s mascot) inside the app');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, `?autoGreet=0&persist=0&look=${encodeURIComponent('{"character":"sparkie"}')}`);
      check('Sparkie loads via look.character', (await page.evaluate(() => window.SparkasseAvatarApp.avatar.constructor.name)) === 'SparkieAvatar');
      const labels = await page.locator('.avatar-btn').allTextContents();
      check('Sparkie gets the extra "Save" (coin drop) button', labels.length === 6 && labels.some((l) => l.includes('Save')), labels.join(' | '));
      const action = () => page.evaluate(() => window.SparkasseAvatarApp.avatar.model.action?.name);
      for (const [btn, expected] of [['greet', 'intro'], ['coin', 'coin'], ['nod', 'nod'], ['shrug', 'think'], ['dance', 'dance'], ['greet', 'wave']]) {
        await page.click(`.avatar-btn[data-reaction="${btn}"]`);
        check(`button "${btn}" → Sparkie "${expected}"`, (await action()) === expected);
      }
      await page.click('.avatar-btn[data-reaction="celebrate"]');
      check('celebrate uses Sparkie\'s own confetti', await page.evaluate(() => window.SparkasseAvatarApp.avatar.model.parts.some((q) => q.life > 0)));

      const box = await page.locator('canvas').boundingBox();
      const r0 = await rotY(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2);
      await page.mouse.up();
      check('drag rotates Sparkie', Math.abs((await rotY(page)) - r0) > 1);

      // quiz reward = coin drop
      await page.click('#tab-play');
      await page.click('[data-start="quiz"]');
      const correct = await page.evaluate(() => window.SparkasseAvatarApp.games.state.game.items[0].correct);
      await page.click(`[data-answer="${correct}"]`);
      check('right quiz answer → Sparkie drops a coin', (await action()) === 'coin');

      // switch characters from the Style tab
      await page.click('#tab-style');
      check('character picker shown', await page.locator('#panel-style [data-key="character"]').count() === 2);
      await page.click('#panel-style [data-key="character"][data-value="human"]');
      await page.waitForFunction(() => window.SparkasseAvatarApp.avatar.constructor.name === 'RiggedAvatar', null, { timeout: 30000 }).catch(() => {});
      check('switch to own avatar (3D model)', (await page.evaluate(() => window.SparkasseAvatarApp.avatar.constructor.name)) === 'RiggedAvatar');
      check('outfit colour options appear for own avatar', await page.locator('#panel-style [data-key="topColor"]').count() > 0);
      check('own avatar also has "Save" (catches a coin)', (await page.locator('.avatar-btn[data-reaction="coin"]').count()) === 1);
      await page.click('#panel-style [data-key="character"][data-value="sparkie"]');
      await page.waitForFunction(() => window.SparkasseAvatarApp.avatar.constructor.name === 'SparkieAvatar', null, { timeout: 10000 }).catch(() => {});
      check('switch back to Sparkie', (await page.evaluate(() => window.SparkasseAvatarApp.avatar.constructor.name)) === 'SparkieAvatar');
      check('only one avatar on stage after switching', (await page.evaluate(() => window.SparkasseAvatarApp.avatar.object3d.parent.children.length)) === 1);

      // teammate's original standalone API still works
      const standalone = await page.evaluate(async () => {
        const { Sparkie } = await import('./js/avatars/sparkie.js');
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:300px';
        document.body.append(host);
        let tapped = false;
        const s = new Sparkie(host, { onTap: () => { tapped = true; } });
        s.play('celebrate'); s.play('coin', { queue: true });
        await new Promise((r) => setTimeout(r, 300));
        const ok = host.querySelector('canvas.sparkie-canvas') !== null && s.model.action?.name === 'celebrate' && s.model.queue[0] === 'coin';
        s.renderer.setAnimationLoop(null); host.remove();
        return ok;
      });
      check('original standalone `new Sparkie(host)` API still works', standalone);
      await page.goto(`${base}/avatar/index.html?autoGreet=0&persist=0&character=human&tab=style`);
      await page.waitForFunction(() => window.SparkasseAvatarApp, null, { timeout: 30000 });
      check('?character= fixes the character and hides the picker', (await page.locator('#panel-style [data-key="character"]').count()) === 0);
      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }

    console.log('Drop-in Sparkie replacement (dist/avatar-buddy.js)');
    {
      const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}/examples/sparkie-swap.html`);
      await page.waitForFunction(() => window.sparkie, null, { timeout: 30000 });
      const cur = () => page.evaluate(() => window.sparkie.avatar.current?.name);
      check('`new Sparkie(host, { onTap })` creates our avatar', (await page.evaluate(() => window.sparkie.constructor.name)) === 'AvatarBuddy');
      check('canvas keeps the .sparkie-canvas class', (await page.locator('#buddy canvas.sparkie-canvas').count()) === 1);
      check('play("intro") on start', (await cur()) === 'intro');
      const map = { wave: 'greet', celebrate: 'celebrate', jump: 'jump', coin: 'coin', nod: 'nod', shake: 'shake', think: 'think', sad: 'sad', dance: 'dance', giggle: 'giggle', intro: 'intro' };
      let allMoves = true;
      for (const [move, expected] of Object.entries(map)) {
        await page.evaluate((m) => window.sparkie.play(m), move);
        if ((await cur()) !== expected) { allMoves = false; console.log('    move failed:', move); }
      }
      check('all 11 Sparkie moves play on the avatar', allMoves);
      await page.evaluate(() => window.sparkie.play('coin'));
      const coinSeen = await page.waitForFunction(() => window.sparkie.avatar.parts.coin.visible, null, { timeout: 15000 }).then(() => true).catch(() => false);
      check('coin move shows the falling € coin', coinSeen);
      await page.evaluate(() => { window.sparkie.play('jump'); window.sparkie.play('celebrate', { queue: true }); });
      check('play(name, { queue: true }) queues', (await page.evaluate(() => window.sparkie.queue.slice())).join() === 'celebrate');
      const queued = await page.waitForFunction(() => window.sparkie.avatar.current?.name === 'celebrate', null, { timeout: 30000 }).then(() => true).catch(() => false);
      check('queued move starts after the current one', queued);
      await page.waitForFunction(() => window.sparkie.confetti.active > 0, null, { timeout: 15000 }).catch(() => {});
      check('celebrate bursts confetti', await page.evaluate(() => window.sparkie.confetti.active > 0));

      // tap → onTap (demo plays giggle)
      await page.evaluate(() => window.sparkie.play('nod'));
      const box = await page.locator('#buddy canvas').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
      check('tap on avatar calls onTap', (await cur()) === 'giggle');
      // drag spins, then springs back to the front like Sparkie
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2);
      const during = await page.evaluate(() => window.sparkie.yawTarget);
      await page.mouse.up();
      check('drag spins the avatar', Math.abs(during) > 1);
      const back = await page.waitForFunction(() => Math.abs(window.sparkie.yaw) < 0.05, null, { timeout: 15000 }).then(() => true).catch(() => false);
      check('springs back to face the user on release', back);
      await page.evaluate(() => { window.sparkie.spinEnabled = false; });
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2);
      check('spinEnabled = false blocks spinning', (await page.evaluate(() => window.sparkie.yawTarget)) === 0);
      await page.mouse.up();

      const look = await page.evaluate(() => window.sparkie.setLook({ hairStyle: 'bun', top: 'tee', height: 160 }));
      check('setLook() customises the drop-in avatar', look.hairStyle === 'bun' && look.top === 'tee' && Math.abs(await page.evaluate(() => window.sparkie.avatar.object3d.scale.y) - 160 / 175) < 1e-3);
      const moved = await page.evaluate(() => {
        const el = document.createElement('div'); el.style.cssText = 'width:200px;height:300px'; document.body.append(el);
        window.sparkie.mount(el); return el.querySelector('canvas') !== null;
      });
      check('mount(el) moves it to another container', moved);
      check('no console errors', errors.length === 0, errors.join(' / '));

      await page.goto(`${base}/examples/sparkie-swap.html?original=1`);
      await page.waitForFunction(() => window.sparkie, null, { timeout: 30000 });
      check('same demo page still runs the original Sparkie', (await page.evaluate(() => window.sparkie.model.action?.name)) === 'intro');
      check('no console errors (original)', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }

    console.log('Language switch (EN ⇄ DE)');
    {
      const { ctx, page, errors } = await openAvatar(browser, base, '?autoGreet=0&persist=0&lang=en&tab=play');
      check('starts in English', (await page.textContent('#tab-play')).includes('Play'));
      await page.click('[data-start="quiz"]');
      const correct = await page.evaluate(() => window.SparkasseAvatarApp.games.state.game.items[0].correct);
      await page.click(`[data-answer="${correct}"]`);
      const coinsBefore = await page.evaluate(() => window.SparkasseAvatarApp.coins);
      const qEn = await page.textContent('.gm-q');
      await page.evaluate(() => window.SparkasseAvatarApp.setLang('de'));
      check('tabs relabel live', (await page.textContent('#tab-play')).includes('Spielen') && (await page.textContent('#tab-react')).includes('Reagieren'));
      const qDe = await page.textContent('.gm-q');
      check('running quiz question switches language', qDe !== qEn, qDe.slice(0, 40));
      check('answered state + explanation kept', await page.locator('.gm-feedback').isVisible() && (await page.locator('.gm-answer.is-correct').count()) === 1);
      check('"Next" button translated', (await page.textContent('.gm-next')).includes('Weiter'));
      check('no coins re-awarded on switch', (await page.evaluate(() => window.SparkasseAvatarApp.coins)) === coinsBefore);
      await page.click('#tab-react');
      check('reaction buttons relabel', (await page.locator('.avatar-btn').allTextContents()).some((l) => l.includes('Feiern')));
      await page.click('#tab-style');
      check('style panel relabels', (await page.textContent('#panel-style')).includes('Größe'));
      check('html lang updated', (await page.evaluate(() => document.documentElement.lang)) === 'de');
      check('no console errors', errors.length === 0, errors.join(' / '));
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 500, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/examples/sparkasse-app.html?lang=de`);
      const homeFrame = async () => {
        for (let i = 0; i < 150; i++) {
          const f = page.frames().find((fr) => fr.url().includes('ui=false'));
          if (f && await f.evaluate(() => !!window.SparkasseAvatarApp).catch(() => false)) return f;
          await page.waitForTimeout(200);
        }
      };
      const hf = await homeFrame();
      check('banking prototype starts in German', (await page.textContent('[data-i18n="account"]')) === 'Girokonto' && (await page.textContent('#balance')).includes('1.248,50'));
      await page.click('.lang [data-lang="en"]');
      check('EN switch: app texts', (await page.textContent('[data-i18n="account"]')) === 'Current account' && (await page.textContent('[data-i18n="navHome"]')) === 'Home');
      check('EN switch: number format', (await page.textContent('#balance')).includes('1,248.50'));
      await hf.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 15000 }).catch(() => {});
      check('EN switch reaches the avatar', (await hf.evaluate(() => window.SparkasseAvatarApp.config.lang)) === 'en');
      await page.click('[data-add="10"]');
      await hf.waitForFunction(() => document.getElementById('avatar-bubble').textContent.includes('new phone'), null, { timeout: 15000 }).catch(() => {});
      check('avatar speaks English in the app', (await hf.textContent('#avatar-bubble')).includes('new phone'));
      check('rewards: saving €10 earns 20 points', (await page.evaluate(() => demo.points)) === 140);
      await page.click('.rw[data-id="cinema"] button');
      await hf.waitForFunction(() => document.getElementById('avatar-bubble').textContent.includes('Unlocked'), null, { timeout: 15000 }).catch(() => {});
      check('rewards: unlocking spends points, shows a code and the avatar celebrates',
        (await page.evaluate(() => demo.points)) === 20 && (await page.textContent('.rw[data-id="cinema"] .code')).startsWith('DEMO-') &&
        (await hf.textContent('#avatar-bubble')).includes('Unlocked'));
      check('rewards: locked rewards are disabled', await page.isDisabled('.rw[data-id="twoforone"] button'));
      const txBefore = await page.locator('#tx li').count();
      await page.click('#card-pay');
      check('rewards: card payment adds a transaction and points', (await page.locator('#tx li').count()) === txBefore + 1 && (await page.evaluate(() => demo.points)) === 24);
      await page.click('#rw-chips [data-cat="concerts"]');
      check('rewards: category filter', (await page.locator('#rw-list .rw').count()) === 2);
      await page.click('#rw-chips [data-cat="all"]');
      await page.click('[data-screen="buddy"]');
      let ff;
      for (let i = 0; i < 150 && !ff; i++) {
        const f = page.frames().find((fr) => fr.url().includes('tabs=chat'));
        if (f && await f.evaluate(() => !!window.SparkasseAvatarApp).catch(() => false)) ff = f; else await page.waitForTimeout(200);
      }
      await ff.waitForFunction(() => document.getElementById('tab-play')?.textContent.includes('Play'), null, { timeout: 15000 }).catch(() => {});
      check('Buddy tab opens in English', (await ff.textContent('#tab-play')).includes('Play'));
      check('Buddy screen opens on the chat', (await ff.getAttribute('#tab-chat', 'aria-selected')) === 'true');
      await page.click('[data-screen="feed"]');
      await ff.waitForFunction(() => window.SparkasseAvatarApp.feed.active, null, { timeout: 15000 }).catch(() => {});
      check('"For You" nav opens the feed', await ff.evaluate(() => window.SparkasseAvatarApp.feed.active));
      await page.click('[data-screen="home"]');
      await ff.waitForFunction(() => window.SparkasseAvatarApp.feed.paused, null, { timeout: 15000 }).catch(() => {});
      check('leaving the Buddy screen pauses the clip', await ff.evaluate(() => window.SparkasseAvatarApp.feed.paused));
      await page.click('[data-screen="buddy"]');
      await ff.evaluate(() => window.SparkasseAvatarApp.openTab('chat'));
      await page.evaluate(() => demo.getFull().chat("I'll call you Zoe"));
      await ff.waitForFunction(() => window.SparkasseAvatarApp.look.name === 'Zoe', null, { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(() => document.getElementById('buddy-name').textContent === 'Zoe', null, { timeout: 15000 }).catch(() => {});
      check('host chat() → avatar renames itself, home card follows', (await page.textContent('#buddy-name')) === 'Zoe');
      check('home avatar gets the new name too', (await hf.evaluate(() => window.SparkasseAvatarApp.look.name)) === 'Zoe');
      await page.click('.lang [data-lang="de"]');
      await ff.waitForFunction(() => document.getElementById('tab-play').textContent.includes('Spielen'), null, { timeout: 15000 }).catch(() => {});
      check('DE switch reaches the Buddy tab live', (await ff.textContent('#tab-play')).includes('Spielen'));
      await page.click('.lang [data-lang="en"]');
      await page.goto(`${base}/examples/sparkasse-app.html`); // no ?lang → saved choice wins
      await page.waitForFunction(() => document.querySelector('[data-i18n="account"]').textContent !== '');
      check('language choice remembered across visits', (await page.textContent('[data-i18n="account"]')) === 'Current account');
      check('no page errors', errors.length === 0, errors.join(' / '));
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
