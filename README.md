# Sparkasse 3D Avatar – standalone, embeddable prototype

An interactive, customisable 3D avatar for a Gen Z (16–24) banking experience, with built-in money-knowledge games. It is built with **Three.js + vanilla JavaScript** and needs **no build step and no framework**. It runs as a standalone page, so you can drop it into **any** website (plain HTML, React, Vue, a CMS…) with an `<iframe>`.

| Feature | Details |
|---|---|
| **3D character** | Default: the rigged 3D model `avatar/models/buddy.glb` (crop top, yellow joggers, chunky sneakers, red headphones, shades). Every reaction, dance and emote is retargeted onto its skeleton, and its own Samba clip is an extra dance. **Male** version: the built-in character in the same outfit style (tank, joggers with knee stripes, shades, headphones). See section 7a. |
| Rotate with mouse and touch | Drag to spin, with inertia. Vertical page scrolling still works on phones. Arrow keys also rotate. |
| Natural idle | Breathing, weight shifts, glances, random blinks. The head and eyes follow the pointer. |
| Reactions | 👋 greet (wave), 🎉 celebrate (jump + spin + confetti), 👍 nod (thumbs-up + wink), 🤷 shrug, 🎶 dance |
| Buttons and tap | Reaction buttons, plus tapping the avatar itself |
| **Sparkie mascot** | The team's savings buddy (`sparkie.js`) runs inside the app as a second character, with its drop-in intro, coin drop, confetti and mood eyes. Users switch between **Sparkie** and **You** in the Style tab, or the platform picks one with `?character=sparkie`. |
| **Customisable** | **Style** tab: name, body (female = 3D model / male), height (1.50–2.00 m), skin tone and clothing colours (recoloured on the 3D model). The male character also has 5 hairstyles, 4 tops, 5 bottoms, sneakers and extras (shades, glasses, headphones, earring, chain). The look is saved and can also be set by the platform. |
| **Money games** | **Play** tab: *Money Quiz* (18 questions, 8 per round) and *Need or Want?*. The avatar reacts to every answer, explains the right answer, and coins unlock cosmetic items. |
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
  js/look.js                 customisation options, palettes, unlock costs, save/load
  js/progress.js             coins (stored locally)
  js/ui/customizer.js        Style tab
  js/games/content.js        quiz questions + need/want items (en/de) – edit content here
  js/games/games.js          Play tab: game flow, scoring, avatar reactions
  js/stage.js                renderer, camera framing, lights, render loop
  js/DragRotate.js           mouse/touch/keyboard rotation with inertia + tap
  js/bridge.js               postMessage API
  js/avatars/PlaceholderAvatar.js   procedural, customisable character + animations
  js/avatars/sparkie.js             Sparkie (teammate's mascot): SparkieModel + standalone Sparkie class
  js/avatars/SparkieAvatar.js       adapter that plugs Sparkie into the app
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
| `setLook(partialLook)` | Change the outfit or name, e.g. `{ name: 'Kai', body: 'female', hairStyle: 'bun', top: 'tee', height: 168 }` |
| `openTab(tab)` | `react`, `chat`, `feed`, `style` or `play` |
| `feed(action)` | For You feed: `play` (opens it), `pause`, `next` or `prev`. Pause it when the user leaves the screen. |
| `chat(text)` | Send a chat message as the user. Opens the Chat tab and the avatar replies. |
| `setLang(lang)` | `en` or `de`. Switches all avatar texts **live**: tabs, buttons, Style panel, games (even mid-quiz). The look, coins and a running game are kept. |
| `startGame(game)` | `quiz` or `sort` (Need or Want?) |
| `on(type, fn)` | Events: `ready`, `reaction`, `tap`, `look`, `game`, `coins`, `tab`, `lang`, `character`, `chat`, `feed`, `error`, `*`. Returns an unsubscribe function. |

Useful events for the platform:

```js
avatar.on('game',  (e) => { /* phase: 'start' | 'answer' | 'end'; on end: score, total, coinsEarned */ });
avatar.on('look',  (e) => saveToUserProfile(e.look));   // persist the look server-side if you like
avatar.on('coins', (e) => console.log(e.coins, e.delta));
avatar.on('character', (e) => console.log('now showing', e.character)); // 'human' | 'sparkie'
avatar.on('chat',  (e) => console.log(e.from, e.text));   // from: 'user' | 'avatar'
avatar.on('feed',  (e) => console.log(e.phase, e.clip));  // phase: 'start' | 'end' | 'like' | 'save' | 'share'
```
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
| `model` | *(empty)* | URL of a `.glb` / `.gltf` used for **everyone**, overriding the two below. |
| `femaleModel` | `models/buddy.glb` | 3D model for body `female` (default avatar). Empty means the built-in character. |
| `maleModel` | *(empty)* | Optional 3D model for body `male`. Empty means the built-in character in the matching outfit. |
| `clips` | – | JSON map from reaction to clip name, e.g. `{"greet":"Wave_01","celebrate":"Victory"}` |
| `lang` | `en` | `en` or `de` (buttons, bubbles, hint, games). Can be changed later with `setLang()`. |
| `ui` | `true` | Show the tab dock (buttons, Style, Play). Set `0` for a pure avatar. |
| `character` | – | `human` or `sparkie`. Overrides the user's saved choice. |
| `reactions` | `greet,celebrate,coin,nod,shrug,dance` | Which buttons to show, in order. Reactions the current character can't do are skipped (🪙 `coin` is Sparkie-only). |
| `tabs` | `react,chat,feed,style,play` | Which panels to offer. For example, `tabs=play` gives a games-only widget, `tabs=chat` a chat-only buddy, `tabs=feed` a clips-only widget. With 5 tabs on a phone, only the selected tab shows its label. |
| `tab` | `react` | Panel that is open on load |
| `look` | – | JSON look, e.g. `{"hairStyle":"long","top":"jacket","height":170}` (overrides the saved look) |
| `persist` | `true` | Remember the look and coins in `localStorage` |
| `bubble` | `true` | Show speech bubbles |
| `hint` | `true` | Show the "Drag to spin" hint |
| `autoGreet` | `true` | Wave once after loading |
| `lookAtPointer` | `true` | Head and eyes follow the pointer |
| `bg` | `gradient` | `gradient`, `transparent` or any CSS colour |
| `primary` | `#e3000f` | Brand colour for the UI and the default top colour (`e3000f` without `#` also works in URLs) |
| `accent` | `#7cf5d0` | Highlights: headphones, sneakers, focus rings |
| `skin`, `hair` | – | Placeholder character colours |
| `chatEndpoint` | – | Optional AI backend for the chat (see 5c). Only settable via `window.SPARKASSE_AVATAR_CONFIG`, never via URL. |
| `parentOrigin` | `*` | Only accept messages from (and send to) this origin. The helper sets it automatically. |

Booleans accept `0/1`, `true/false`, `on/off`.

## 4a. Banking-app prototype

`examples/sparkasse-app.html` is a phone-style prototype of a banking app with the avatar built in (demo data, no logins, no official logos). It shows:

* the avatar on the Start screen reacting to the app: saving catches a coin, reaching the goal celebrates, tapping a transaction gives a tip
* the full avatar (Chat / For You / React / Style / Play) in a Buddy tab that opens on the chat. The **For You** item in the bottom bar jumps straight into the clips feed, and leaving the screen pauses it. The name and outfit stay in sync with the Start screen, whose card shows the buddy's name.
* a **Rewards** section: saving earns 2 points per €1 and card payments earn 1 point per €1 (try *Pay by card (demo)*). Points unlock perks for concerts, events and shopping, filterable by category. Unlocking shows a voucher code and the avatar celebrates. All partners and codes are made up; the data lives in `REWARDS` in the page script.
* an **EN / DE switch** in the header. On first visit it uses `?lang=`, then the saved choice, then the browser language. Switching updates texts and number formats (`1.248,50 €` ↔ `€1,248.50`) and both avatars live through `setLang()`.

## 4b. Replacing Sparkie in the platform (drop-in)

If the platform already shows Sparkie with `sparkie.js`, you can swap in our avatar **without changing any other code**.

1. Copy **`dist/avatar-buddy.js`** and **`dist/buddy.glb`** next to `sparkie.js`. The script is a single file of about 60 KB and uses the platform's existing `three` / `three/addons/` imports (GLTFLoader, SkeletonUtils, RoomEnvironment). It loads `buddy.glb` from its own folder; pass `models: { female: '/path/buddy.glb', male: '' }` to change that. Until the model has loaded, nothing is drawn; if it fails, the built-in character appears.
2. Change one import:

```diff
- import { Sparkie } from './sparkie.js';
+ import { Sparkie } from './avatar-buddy.js';
```

Everything else stays the same: `new Sparkie(host, { onTap })`, `.play(name, { queue })`, `.burst()`, `.mount(el)`, `.spinEnabled`, and the `.sparkie-canvas` CSS class. All 11 Sparkie moves are mapped to the avatar:

| Sparkie move | Avatar does |
|---|---|
| `intro` | drops in with a spin, lands, waves |
| `wave` | waves hello |
| `celebrate` | jump-spin, arms up, confetti |
| `jump` | happy hop, arms up |
| `coin` | looks up, catches a falling € coin, smiles, pockets it |
| `nod` | thumbs-up, nod and wink |
| `shake` | "no" head shake |
| `think` | hand to chin, eyes up |
| `sad` | head and shoulders drop, worried brows, frown |
| `dance` | 120 bpm groove |
| `giggle` | shoulders bounce, eyes squeeze shut |

Optional extras: pass a look with `new Sparkie(host, { onTap, look: { hairStyle: 'bun', top: 'tee', height: 168 } })`, or call `buddy.setLook({...})` / `buddy.getLook()` (keys as in `look.js`), and `buddy.dispose()`. The platform can store the user's look and pass it in on load.

**Demo:** `examples/sparkie-swap.html` runs the same calls the platform makes. Add `?original=1` to compare with the original Sparkie.

**Rebuilding the bundle** after editing the avatar code: `npm run build:buddy`. The source is `avatar/js/buddy/AvatarBuddy.js`.

## 5. Sparkie

`avatar/js/avatars/sparkie.js` is the team's mascot code, split into two parts:

* **`SparkieModel`**: the character and its animation library (intro, wave, celebrate, coin, nod, think, dance, sad, shake, giggle, jump), with no renderer. The app adds `model.group` to its own scene.
* **`Sparkie`**: the original standalone class with the **same API as before** (`new Sparkie(host, { onTap })`, `.play(name, { queue })`, `.burst()`, `.mount(el)`, `.spinEnabled`). Existing code that used the file keeps working.

The helpers and the animation library are unchanged from the original file. `SparkieAvatar.js` maps the app's reactions onto Sparkie's moves:

| App reaction | Sparkie |
|---|---|
| greet | `intro` the first time (drop-in, spin, land, wave), then `wave` |
| celebrate | `celebrate` (jump spin + its own confetti) |
| coin (🪙 Save) | `coin`: the coin drops into Sparkie's head |
| nod / shrug / dance | `nod` / `think` / `dance` |

In the games, Sparkie **drops a coin for every right answer**. The human avatar gives a thumbs-up instead. Sparkie keeps its own red look, shadow and Neutral tone mapping. Height and outfit options apply only to the human avatar.

To make Sparkie the default for everyone, set `character: 'sparkie'` in `DEFAULTS` in `config.js`, or pass `?character=sparkie` / `params: { character: 'sparkie' }` from the platform.

## 5b. Customisation

All options are listed in `avatar/js/look.js`:

| Key | Values |
|---|---|
| `body` | `female` (default) = the 3D model `femaleModel`; `male` = `maleModel` if set, otherwise the built-in character. Switching loads the other avatar live; a downloaded model is cached. |
| `height` | 150–200 (cm). Scales the whole avatar, 3D model included. |
| `skin`, `topColor`, `bottomColor`, `shoeColor` | hex colours. On the 3D model they recolour the skin, crop top, joggers and sneakers in the shader; the defaults equal the model's own colours. Gold sneakers 🔒80 also get a metallic shine. |
| `hairColor`, `hatColor` | hex colours (built-in character only). The UI offers curated palettes, while the API accepts any `#rrggbb`. |
| `hairStyle` | `curls`, `buzz`, `bun`, `long`, `beanie` 🔒50 (built-in character) |
| `top` | `tank` (default, like the model's top), `hoodie`, `jacket` (bomber), `tee` |
| `bottom` | `joggers` (default: baggy, knee stripes, cuffs), `cargo`, `jeans`, `shorts`, `skirt` |
| `watch` 🔒20, `chain` 🔒30, `bag` 🔒60 | unlockable accessories (smartwatch, gold chain, crossbody bag). They work on **both** the 3D model and the built-in character (`accessories.js` places them from body anchors and attaches them to the bones). |
| `shades`, `glasses`, `headphones`, `earring` | booleans (built-in character). The 3D model wears its own shades and headphones. |

On the 3D model the Style tab shows name, body, height, skin tone, top/joggers/sneaker colours and the unlockable accessories (watch, chain, bag), with a short note. Hairstyles and garments belong to the male (built-in) character.

**Earning coins:** coins come from the games, from watching learn clips in the feed, and from the platform. `avatar.addCoins(n)` (helper) or the `addCoins` message rewards real behaviour. The banking prototype gives **1 coin per €5 saved**, so the more you save, the more you unlock. Coins are shared by all avatar frames on a page.

🔒 = unlocked with coins earned in the games. Gold sneakers cost 80. To add or rename options, edit `OPTIONS`/`PALETTES` in `look.js`. To add new geometry, edit the matching `_build…` method in `PlaceholderAvatar.js`. Changing the look rebuilds the meshes, so running animations keep playing.

The look is saved in the iframe's `localStorage`, and the platform receives a `look` event whenever it changes. To store it per user account, save it from that event and pass it back with `params.look` or `setLook()`.

## 5c. Chat and avatar name

The **Chat** tab lets the user talk to the avatar. It answers like a best friend, using Gen Z slang in English and German (“no cap”, “bestie”, “lowkey”, “läuft bei dir”, “safe”, …), and knows money basics. It acts on what you say:

* **Money topics:** saving, budgeting (50/30/20), being broke, debt and “buy now pay later”, investing and ETFs, subscriptions, payday, taxes, interest and inflation.
* **Safety:** asking about PIN/TAN/phishing gets a clear scam warning. Messages about self-harm get a caring reply with the Telefonseelsorge numbers (0800 111 0 111 / 0800 111 0 222) and 112.
* **Feelings and small talk:** greetings, “how are you”, bad days, good news (it celebrates), jokes, compliments, goodbyes.
* **Actions:** the avatar plays a matching reaction and shows a short version of the reply in its speech bubble. “Let's play” opens the games, and “change your outfit” opens Style.
* **Names:** “I'll call you Kai” / “Ich nenn dich Kai” renames the avatar. “My name is Lea” / “Ich heiße Lea” makes it remember the user's name.
* **Suggestions:** chips under the chat offer starter questions.

The avatar's **name** is part of the look (`look.name`, default `Nova`, at most 16 letters, digits, spaces, `-` or `'`). It can be changed in the chat, in the **Name** field at the top of the Style tab, or by the host with `setLook({ name: 'Kai' })`. Reset keeps the name. Chat history (last 40 messages) and the user's name are saved in localStorage when `persist` is on.

The replies come from a built-in, offline “brain” (`avatar/js/chat/brain.js`): keyword intents plus several reply variants each. Add topics by adding an entry to `INTENTS`. No data leaves the device.

**Plugging in a real AI (optional).** Set `chatEndpoint` in `window.SPARKASSE_AVATAR_CONFIG`. Each message is then POSTed as JSON:

```json
{ "message": "How do I save?", "history": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }],
  "name": "Nova", "userName": "Lea", "lang": "en" }
```

The endpoint should answer `{ "reply": "…", "reaction": "nod" }` (`reaction` is optional: `greet`, `celebrate`, `coin`, `nod`, `shrug` or `dance`). If the request fails or times out (12 s), the built-in brain answers instead. Renaming and opening tabs still work. Keep API keys on that server (for example a Cloudflare Worker), never in the page.

## 5d. “For You” feed

The **For You** tab (`▶️`) is a TikTok-style vertical feed in which the user's own customised avatar performs short clips:

* **Learn clips** explain a money concept in 4–5 captioned steps: compound interest, 50/30/20, buy now pay later, emergency fund, spotting scams, inflation and ETFs. Watching one to the end earns **3 coins** (once per clip).
* **Dance clips:** payday shuffle, hype hands, Friday bounce.
* **Emote clips:** heart hands, flex, sad, giggle and more, with relatable money captions.

The avatar has seven new original moves for this: `heart`, `flex`, `mindBlown`, `shuffle`, `bounce`, `point` and `handsUp`. Avatars without them (Sparkie, GLB models) fall back to the closest move they have.

Controls:

* swipe up/down, the ▲▼ buttons, the mouse wheel or ↑/↓ move between clips;
* tap pauses (the avatar freezes like a paused video), double-tap likes with a heart burst, and Space toggles pause;
* the side buttons like, save, share (native share sheet or copy) and toggle sound;
* clips auto-advance.

The background colour changes per clip. The handle is `@` plus the avatar's name, and the music line reads “original sound – {name}”. Sound is an optional beat generated with Web Audio (no audio files), off until the user taps 🔇. On wide screens the side panel lists all clips and shows which learn rewards were earned. Likes, saves and rewards are kept in localStorage.

Clips are plain data in `avatar/js/feed/clips.js`: each has a `kind` (`learn` / `dance` / `emote`), a background, a title, hashtags and `steps` of `{ move, text: { en, de } }`. Add an entry to publish a new clip.

## 6. Money games

| Game | How it works | Coins |
|---|---|---|
| 🧠 **Money Quiz** | 8 random questions from a pool of 18. Answers are shuffled. After each answer the player sees a short explanation. | 10 per correct answer, +5 for every 3 in a row |
| 🛒 **Need or Want?** | Sort 10 everyday expenses into needs and wants | 5 per correct answer |

Topics: compound interest, inflation, phishing/PIN safety, the 50/30/20 budget, gross vs. net pay, overdrafts, emergency funds, diversification, ETFs, scam red flags, Buy-now-pay-later, credit scores, subscriptions, deposit protection, effective annual interest, the rule of 72, "pay yourself first", and debit vs. credit cards.

The avatar is the game buddy. It waves at the start, gives a thumbs-up and "+10 🪙" for right answers, shrugs and points to the tip for wrong ones, celebrates with confetti on streaks, and reacts to the final score. Best scores are saved locally.

**Editing content**: all text is in `avatar/js/games/content.js` (English and German side by side). Keep questions general and timeless. Have someone from the bank review them for compliance before going live.

## 7a. The 3D model (`buddy.glb`) and how it's animated

`avatar/models/buddy.glb` (copied to `dist/buddy.glb` for the drop-in) is a rigged character with a Mixamo-style skeleton (`mixamorig:Hips`, `…LeftArm`, …), one 512 px texture atlas, and two clips (`SambaDance`, `TPose`). `RiggedAvatar.js` makes it behave exactly like the built-in character:

* **Retargeting:** a hidden built-in character computes every pose (idle, reactions, feed dances and emotes, pointer look-at, crouch/jump). Each frame its joint rotations are applied to the model's bones (arms are first rotated from T-pose to the same arms-down rest pose). The hips follow the crouch, and the lowest foot is kept on the floor. All 20 moves work, including the coin catch at the model's hand.
* **Model clips:** clips with a matching name become extra moves (`samba`), blended in and out over the procedural pose.
* **Recolouring:** the shader detects the joggers (yellow), the crop top (grey, in its atlas area) and the skin (warm brown) and recolours them from the look's `bottomColor`, `topColor` and `skin`. The reference colours live in `RECOLOR` at the bottom of `RiggedAvatar.js`.
* No facial animation: the model has no blendshapes, so expressions such as smile and wink only exist on the built-in character.

**A male 3D model:** export a male character from the same source with the same rig (Mixamo: download as FBX "T-pose", convert to GLB with Blender), put it in `avatar/models/`, and set `maleModel: 'models/buddy-male.glb'` (or `?maleModel=…`; for the drop-in, `models: { male: … }`). Any Mixamo-rigged GLB gets the full motion library. If its texture colours differ, adjust the masks and reference colours in `RiggedAvatar.js`.

## 7. Using your own GLB/GLTF model

1. Put the file in `avatar/models/` (or host it anywhere CORS allows).
2. Open `index.html?model=models/my-avatar.glb`.

**Mixamo-style rigs** are detected automatically (a bone ending in `Hips`) and handled by `RiggedAvatar` (section 7a), which gives them all moves. Other models use `GltfAvatar`, described below. The model is automatically scaled to about 1.85 m, centred, and its feet are placed on the floor. Animation clips are matched to reactions **by name**:

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

## 8. Hosting notes

* **Same origin vs. cross origin**: both work. On a different domain, the platform's Content-Security-Policy must allow it in `frame-src`, and the avatar host must not send `X-Frame-Options: DENY`.
* **Security**: in production, set `parentOrigin` to the platform's origin. The helper does this automatically. The avatar never sends user data, only UI events.
* **Transparent background**: use `bg=transparent`. The iframe then blends into the host page.
* **Performance**: rendering pauses when the tab is hidden, and the pixel ratio is capped at 2. The placeholder needs no downloads beyond Three.js (≈0.85 MB minified, cacheable).
* **Browser support**: current Chrome, Edge, Firefox and Safari (iOS 16.4+), because import maps and WebGL 2 are required.
* **Updates and caching**: run `npm run stamp` before publishing. It writes a version into the import map of `avatar/index.html` (every module becomes `file.js?v=…`) and into the example pages, so phones never mix cached old files with new ones. Saved looks carry a `LOOK_VERSION` (`look.js`). Bump it when the default avatar changes, and older saved looks then keep only the name and height.
* **The 3D model** adds a one-time ≈3 MB download, cached afterwards. The male built-in character needs none.

## 9. Tests

```bash
npm install          # installs Playwright (dev only)
npm test
```

The test starts its own server and checks in Chromium:

* every button, the bubble text and the confetti
* idle motion, mouse drag, real touch drag, tap on the avatar, keyboard rotation and reset
* the mobile layout and German labels
* every hairstyle, top and bottom option; colours, glasses, the height slider, "Surprise me", locked items, saving across reloads, and the `look` URL parameter
* the drop-in replacement: all 11 Sparkie moves, the coin prop, queueing, confetti, tap → `onTap`, drag spin with spring-back, `spinEnabled`, `setLook`, `mount`, and the original Sparkie on the same demo page
* Sparkie: every button mapped to the right Sparkie move, its own confetti, drag, the coin reward in the quiz, switching characters both ways, and the original standalone `new Sparkie(host)` API
* a full Money Quiz round (feedback, coins, streak bonus, avatar reactions), a full Need-or-Want round, and coins unlocking the beanie
* GLB loading with clip mapping and fallbacks, and fallback to the placeholder when a model is missing
* the live language switch: tabs, buttons, Style panel and a running quiz relabel without losing state or re-awarding coins; the banking prototype's EN/DE switch reaches both avatars and is remembered
* both iframe integration options, including the postMessage round-trip, `setLook`, `startGame` and game events

## 10. Notes and next steps

* The placeholder uses a brand-red colour but **no logos or trademarks**. Check final visuals against the Sparkasse brand guidelines.
* For production, swap the placeholder for a professionally modelled GLB with face blend shapes (`?model=…`). The rest of the system stays the same.
* Coins and looks are stored on the device only. For accounts across devices, persist them on the platform via the `look`/`coins`/`game` events.
* Possible extensions: more reactions (add metadata in `reactions.js` and a pose in `PlaceholderAvatar.js`), more games or question packs, voice or lip-sync, and reduced-motion handling for the 3D animations.
