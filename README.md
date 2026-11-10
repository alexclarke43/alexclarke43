# Sparkasse 3D Avatar – standalone, embeddable prototype

An interactive 3D avatar for a Gen Z (16–24) banking experience. It is built with **Three.js + vanilla JavaScript** and needs **no build step and no framework**. It runs as a standalone page, so you can drop it into **any** website (plain HTML, React, Vue, a CMS…) with an `<iframe>`.

| Feature | Details |
|---|---|
| Stylised 3D character | Built-in placeholder: oversized brand-red hoodie, cargo pants, chunky sneakers, curly top, headphones, earring. No 3D asset needed. |
| Rotate with mouse and touch | Drag to spin, with inertia. Vertical page scrolling still works on phones. Arrow keys also rotate. |
| Natural idle | Breathing, weight shifts, glances, random blinks. The head and eyes follow the pointer. |
| Reactions | 👋 greet (wave), 🎉 celebrate (jump + spin + confetti), 👍 nod (thumbs-up + wink), 🤷 shrug, 🎶 dance |
| Buttons and tap | Reaction buttons, plus tapping the avatar itself |
| Responsive | Fills whatever box it's given: phone portrait, desktop, landscape (buttons move to the side) and tiny embeds |
| GLB/GLTF | Load your own model with `?model=…`. Clips are matched to reactions automatically. |
| Host ↔ avatar API | `postMessage` bridge and a tiny optional helper script |
| Languages | English or German UI copy (`?lang=de`) |

---

## 1. Run it locally

ES modules don't work over `file://`, so serve the folder with any static server:

```bash
npx http-server -c-1 -p 8080 .      # or: python3 -m http.server 8080
```

* Avatar only: <http://localhost:8080/avatar/index.html>
* Integration demo: <http://localhost:8080/examples/host-page.html>

## 2. Project structure

```
avatar/                      ← deploy this folder (self-contained)
  index.html                 page loaded inside the iframe
  css/avatar.css             layout, buttons, speech bubble, responsive rules
  js/main.js                 wiring: config → stage → avatar → UI → bridge
  js/config.js               defaults + URL-param / global config parsing
  js/reactions.js            reaction list, button labels, bubble copy (en/de)
  js/stage.js                renderer, camera framing, lights, render loop
  js/DragRotate.js           mouse/touch/keyboard rotation with inertia + tap
  js/bridge.js               postMessage API
  js/avatars/PlaceholderAvatar.js   procedural character + procedural animations
  js/avatars/GltfAvatar.js          GLB/GLTF loader, clip mapping, fallbacks
  js/effects/Confetti.js     celebration particles
  models/                    put your .glb files here
  vendor/three/              Three.js r187 (MIT), vendored – no CDN needed
embed/sparkasse-avatar-embed.js   optional helper for host pages (≈2 KB)
examples/host-page.html      demo of both integration options
tests/smoke.cjs              Playwright end-to-end test
```

## 3. Integrate it into another website

First, deploy the `avatar/` folder to any static host. It can be the same server as the platform (e.g. `/avatar/`) or a CDN or other domain.

### Option A: plain iframe (works everywhere, copy and paste)

```html
<iframe
  src="/avatar/index.html?lang=de"
  title="Interactive 3D avatar"
  style="width:100%; height:520px; border:0;"
  loading="lazy"></iframe>
```

That's it. The avatar's own buttons trigger the reactions.

### Option B: helper script (when the platform should control the avatar)

```html
<div id="avatar"></div>
<script src="/embed/sparkasse-avatar-embed.js"></script>
<script>
  const avatar = SparkasseAvatar.mount('#avatar', {
    src: '/avatar/index.html',
    height: 480,                                    // px or any CSS length
    params: { lang: 'de', ui: false, bg: 'transparent' },
  });

  // e.g. when the user hits a savings goal:
  avatar.play('celebrate', { text: 'Sparziel erreicht! 🎉' });

  avatar.on('ready',    (e) => console.log('avatar ready', e.reactions));
  avatar.on('reaction', (e) => console.log(e.reaction, e.phase)); // start / end
  avatar.on('tap',      (e) => console.log('user tapped the avatar'));
</script>
```

Commands sent before the iframe is ready are queued automatically.

| Method | Description |
|---|---|
| `play(reaction, { text? })` | `greet`, `celebrate`, `nod`, `shrug` or `dance`. `text` overrides the speech bubble. |
| `say(text, durationMs?)` | Show a speech bubble without moving |
| `reset()` | Spin the avatar back to face the user |
| `on(type, fn)` | Events: `ready`, `reaction`, `tap`, `error`, `*`. Returns an unsubscribe function. |
| `destroy()` | Remove the iframe and listeners |

### Option C: React (if the platform turns out to be React)

```jsx
import { useEffect, useRef } from 'react';

export function Avatar({ celebrate }) {
  const box = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    api.current = window.SparkasseAvatar.mount(box.current, {
      src: '/avatar/index.html', height: 480, params: { lang: 'de' },
    });
    return () => api.current.destroy();
  }, []);

  useEffect(() => { if (celebrate) api.current?.play('celebrate'); }, [celebrate]);

  return <div ref={box} />;
}
// Load /embed/sparkasse-avatar-embed.js once (index.html <script> tag or dynamic import).
// Or render a plain <iframe src="/avatar/index.html" … /> – no helper required.
```

### Raw postMessage protocol (no helper)

```js
iframe.contentWindow.postMessage(
  { target: 'sparkasse-avatar', type: 'play', reaction: 'celebrate', text: 'Nice!' },
  'https://avatar-host.example'      // origin of the avatar page
);
window.addEventListener('message', (e) => {
  if (e.data?.source === 'sparkasse-avatar') console.log(e.data); // ready / reaction / tap / error
});
```

## 4. Configuration

Pass options as URL params (`index.html?lang=de&ui=0`), via the helper's `params`, or by setting `window.SPARKASSE_AVATAR_CONFIG = {…}` before `main.js` in `index.html`.

| Option | Default | Description |
|---|---|---|
| `model` | *(empty)* | URL of a `.glb` / `.gltf`. Empty means the built-in placeholder. |
| `clips` | – | JSON map from reaction to clip name, e.g. `{"greet":"Wave_01","celebrate":"Victory"}` |
| `lang` | `en` | `en` or `de` (buttons, bubbles, hint) |
| `ui` | `true` | Show the reaction buttons |
| `reactions` | `greet,celebrate,nod,shrug,dance` | Which buttons to show, in order |
| `bubble` | `true` | Show speech bubbles |
| `hint` | `true` | Show the "Drag to spin" hint |
| `autoGreet` | `true` | Wave once after loading |
| `lookAtPointer` | `true` | Head and eyes follow the pointer |
| `bg` | `gradient` | `gradient`, `transparent` or any CSS colour |
| `primary` | `#e3000f` | Hoodie and brand colour (`e3000f` without `#` also works in URLs) |
| `accent` | `#7cf5d0` | Highlights: headphones, sneakers, focus rings |
| `skin`, `hair` | – | Placeholder character colours |
| `parentOrigin` | `*` | Only accept messages from (and send to) this origin. The helper sets it automatically. |

Booleans accept `0/1`, `true/false`, `on/off`.

## 5. Using your own GLB/GLTF model

1. Put the file in `avatar/models/` (or host it anywhere CORS allows).
2. Open `index.html?model=models/my-avatar.glb`.

The model is automatically scaled to about 1.85 m, centred, and its feet are placed on the floor. Animation clips are matched to reactions **by name**:

| Reaction | Clip names matched (case-insensitive) |
|---|---|
| idle (loops) | `idle`, `breath`, `stand` |
| greet | `wave`, `greet`, `hello`, `hi` |
| celebrate | `celebrate`, `cheer`, `victory`, `win`, `jump`, `hooray` |
| nod | `nod`, `yes`, `agree`, `thumb` |
| shrug | `shrug`, `think`, `no`, `confus`, `unsure` |
| dance | `dance`, `groove` |

If the names differ, use `clips={"greet":"MyWaveClip"}`. **A reaction without a clip falls back to procedural motion** (hop, jump-spin, sway…), so even a static model reacts. A bone or node named `head` is used for pointer look-at.

Tips: keep models under about 5 MB and textures at 1024 px or smaller, and use `gltf-transform` or Blender's glTF exporter with compression. Mixamo-style animations work after you export them as glTF clips. Draco/Meshopt-compressed files would need the respective decoder added to `GltfAvatar.js`.

## 6. Hosting notes

* **Same origin vs. cross origin**: both work. On a different domain, the platform's Content-Security-Policy must allow it in `frame-src`, and the avatar host must not send `X-Frame-Options: DENY`.
* **Security**: in production, set `parentOrigin` to the platform's origin. The helper does this automatically. The avatar never sends user data, only UI events.
* **Transparent background**: use `bg=transparent`. The iframe then blends into the host page.
* **Performance**: rendering pauses when the tab is hidden, and the pixel ratio is capped at 2. The placeholder needs no downloads beyond Three.js (≈0.85 MB minified, cacheable).
* **Browser support**: current Chrome, Edge, Firefox and Safari (iOS 16.4+), because import maps and WebGL 2 are required.

## 7. Tests

```bash
npm install          # installs Playwright (dev only)
npm test
```

The test starts its own server and checks in Chromium:

* every button, the bubble text and the confetti
* idle motion, mouse drag, real touch drag, tap on the avatar, keyboard rotation and reset
* the mobile layout and German labels
* GLB loading with clip mapping and fallbacks, and fallback to the placeholder when a model is missing
* both iframe integration options, including the postMessage round-trip

## 8. Notes and next steps

* The placeholder uses a brand-red colour but **no logos or trademarks**. Check final visuals against the Sparkasse brand guidelines.
* For production, swap the placeholder for a professionally modelled GLB with face blend shapes (`?model=…`). The rest of the system stays the same.
* Possible extensions: more reactions (add metadata in `reactions.js` and a pose in `PlaceholderAvatar.js`), voice or lip-sync, and reduced-motion handling for the 3D animations.
