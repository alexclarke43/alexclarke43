import * as THREE from 'three';
import { DEFAULT_LOOK, GOLD } from '../look.js';

/**
 * Built-in stylised character made from primitives, so the prototype works without
 * any 3D asset. Fully customisable via setStyle(): 5 hair styles, 3 tops, 4 bottoms,
 * colours and extras (glasses, headphones, earring, chain). Default look: brand-red
 * hoodie, cargo pants, chunky sneakers, curly top, headphones, silver earring.
 *
 * Animation is procedural: every frame we compute an "idle" pose plus an optional
 * reaction pose (offsets from the rest pose) and cross-fade between them.
 *
 * Public interface (shared with GltfAvatar):
 *   object3d, reactions, play(name) → seconds, update(dt), setLookTarget(x, y),
 *   headAnchor (Object3D for the speech bubble), height
 */

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
/** 0→1 between a..b, hold, 1→0 between c..d */
const env = (t, a, b, c, d) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const LEG = 0.46; // thigh / shin length (approx.) used for crouch maths

export class PlaceholderAvatar {
  constructor(opts, style = {}) {
    this.opts = opts;
    this.style = { ...DEFAULT_LOOK, ...style };
    this.supportsStyle = true;
    this.object3d = new THREE.Group();
    this.object3d.name = 'PlaceholderAvatar';
    this.joints = {};
    this.rest = {};
    this.parts = {};
    this.height = 2.0;

    this.time = Math.random() * 100;
    this.current = null;        // active reaction
    this.final = {};            // last applied channel values
    this.from = null;           // snapshot for cross-fades
    this.fade = 1;              // 0..1 cross-fade progress
    this.gaze = new THREE.Vector2();
    this.gazeTarget = new THREE.Vector2();
    this.blinkIn = 1.5;
    this.blinkT = -1;

    this._build();
  }

  get reactions() { return Object.keys(MOTIONS); }

  play(name) {
    const motion = MOTIONS[name];
    if (!motion) return 0;
    this.current = { name, t: 0, motion };
    this._startFade();
    return motion.duration;
  }

  setLookTarget(x, y) { this.gazeTarget.set(x, y); }

  update(dt) {
    this.time += dt;
    const t = this.time;

    // 1. Idle layer (always running)
    const idle = idlePose(t);

    // 2. Reaction layer
    let target = idle;
    let lookWeight = 1;
    if (this.current) {
      const c = this.current;
      c.t += dt;
      if (c.t >= c.motion.duration) {
        this.current = null;
        this._startFade();
      } else {
        const r = c.motion.pose(c.t, c.motion.duration);
        target = {};
        const keep = c.motion.idleBlend ?? 0.35;
        for (const k in idle) target[k] = k.startsWith('face.') ? idle[k] : idle[k] * keep;
        for (const k in r) target[k] = k.startsWith('face.') ? r[k] : (target[k] || 0) + r[k];
        lookWeight = c.motion.look ?? 0.3;
      }
    }

    // 3. Cross-fade from the previous pose when a reaction starts/ends
    this.fade = Math.min(1, this.fade + dt / 0.3);
    let out = target;
    if (this.from && this.fade < 1) {
      const w = smooth(this.fade);
      out = {};
      const keys = new Set([...Object.keys(this.from), ...Object.keys(target)]);
      for (const k of keys) {
        const a = this.from[k] ?? (k.startsWith('face.') ? FACE_DEFAULTS[k] ?? 0 : 0);
        const b = target[k] ?? (k.startsWith('face.') ? FACE_DEFAULTS[k] ?? 0 : 0);
        out[k] = a + (b - a) * w;
      }
    }
    this.final = out;

    // 4. Look-at (pointer) – eased, weighted down during big reactions
    const k = 1 - Math.exp(-6 * dt);
    this.gaze.x += (this.gazeTarget.x - this.gaze.x) * k;
    this.gaze.y += (this.gazeTarget.y - this.gaze.y) * k;
    this._lookWeight = (this._lookWeight ?? 1) + (lookWeight - (this._lookWeight ?? 1)) * k;

    this._apply(out, dt);
  }

  // ---------------------------------------------------------------------------

  _startFade() {
    this.from = {};
    for (const k in this.final) {
      this.from[k] = /\.r[xyz]$/.test(k) ? wrapAngle(this.final[k]) : this.final[k];
    }
    this.fade = 0;
  }

  _apply(p, dt) {
    const J = this.joints;
    for (const name in J) {
      const j = J[name];
      const r = this.rest[name];
      j.position.set(
        r.p.x + (p[`${name}.px`] || 0),
        r.p.y + (p[`${name}.py`] || 0),
        r.p.z + (p[`${name}.pz`] || 0),
      );
      j.rotation.set(
        r.r.x + (p[`${name}.rx`] || 0),
        r.r.y + (p[`${name}.ry`] || 0),
        r.r.z + (p[`${name}.rz`] || 0),
      );
    }

    // Pointer look-at on top of everything
    const lw = this._lookWeight;
    J.head.rotation.y += this.gaze.x * 0.55 * lw;
    J.head.rotation.x += -this.gaze.y * 0.3 * lw;
    J.neck.rotation.y += this.gaze.x * 0.2 * lw;

    // --- Face ---
    const f = (key) => p[key] ?? FACE_DEFAULTS[key] ?? 0;
    const P = this.parts;

    // blinking
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) this.blinkT = 0;
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.sin(Math.min(1, this.blinkT / 0.16) * Math.PI);
      if (this.blinkT >= 0.16) {
        this.blinkT = -1;
        this.blinkIn = Math.random() < 0.2 ? 0.18 : 2 + Math.random() * 3.5; // sometimes double-blink
      }
    }
    const squint = f('face.squint');
    const wink = f('face.wink');
    const open = (1 - blink) * (1 - squint * 0.6);
    P.eyeL.scale.y = Math.max(0.07, open * (1 - wink * 0.93));
    P.eyeR.scale.y = Math.max(0.07, open);

    const ex = f('face.eyeX') + this.gaze.x * 0.8 * lw;
    const ey = f('face.eyeY') + this.gaze.y * 0.6 * lw;
    for (const iris of [P.irisL, P.irisR]) iris.position.set(ex * 0.0065, ey * 0.0055, iris.position.z);

    const brow = f('face.brow');
    const tilt = f('face.browTilt');
    const asym = f('face.browAsym');
    P.browL.position.y = P.browL.userData.y + (brow + asym) * 0.02 - squint * 0.006;
    P.browR.position.y = P.browR.userData.y + (brow - asym) * 0.02 - squint * 0.006;
    P.browL.rotation.z = -tilt * 0.35 + asym * 0.15;
    P.browR.rotation.z = tilt * 0.35 + asym * 0.15;

    const smile = f('face.smile');
    const mouthOpen = f('face.open');
    // negative smile = frown (the lip arc flips)
    const frown = smile < 0;
    const sm = Math.abs(smile);
    P.smile.rotation.z = frown ? 0 : Math.PI;
    P.smile.position.y = frown ? -0.008 : 0.01;
    P.smile.scale.set(0.75 + sm * (frown ? 0.2 : 0.45), 0.25 + sm * (frown ? 0.45 : 0.85), 1);
    P.smile.visible = mouthOpen < 0.55;
    P.mouthOpen.scale.set(0.8 + Math.max(0, smile) * 0.35, Math.max(0.02, mouthOpen), 1);
    P.mouthOpen.visible = mouthOpen > 0.03;
    P.mouth.position.x = f('face.mouthX') * 0.02;
    P.mouth.rotation.z = f('face.mouthX') * 0.25;

    this._applyCoin(p['prop.coin'] || 0);
  }

  /** Coin prop for the "coin" move: falls from above into the right hand, then gets pocketed. */
  _applyCoin(c) {
    const coin = this.parts.coin;
    if (!coin) return;
    coin.visible = c > 0.01 && c < 0.995;
    if (!coin.visible) return;
    this.object3d.updateMatrixWorld(true);
    const palm = this.joints.handR.localToWorld(this._v1.set(0, -0.06, 0));
    this.object3d.worldToLocal(palm);
    palm.y += 0.045;
    const fall = Math.min(1, c / 0.52);
    coin.position.set(palm.x, palm.y + 1.5 * (1 - fall * fall), palm.z);
    coin.rotation.set(Math.PI / 2 * (1 - fall) + 0.2, c * 30 * (1 - fall) + 0.3, 0);
    const pop = Math.min(1, c / 0.06);
    const pocket = 1 - Math.max(0, (c - 0.86) / 0.14);
    coin.scale.setScalar(Math.max(0.001, pop * pocket));
  }

  // ---------------------------------------------------------------------------
  // Modelling – everything below reads this.style (see look.js), so a new look
  // is applied by simply rebuilding the meshes. Joint names stay the same, so
  // running animations continue seamlessly.

  /** Free GPU memory when the avatar is removed (e.g. switching to Sparkie). */
  dispose() {
    this.object3d.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }

  /** Rebuild the character with a new look (hair, clothes, colours, extras). */
  setStyle(style) {
    this.style = { ...this.style, ...style };
    this.object3d.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    this.object3d.clear();
    this.joints = {};
    this.rest = {};
    this.parts = {};
    this._build();
    this._apply(this.final, 0);
  }

  _build() {
    const o = this.opts;
    const S = this.style;
    const std = (color, roughness = 0.7, metalness = 0, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    // Fabric: soft sheen makes cloth read as cloth instead of plastic.
    const cloth = (color, roughness = 0.85, extra = {}) => {
      const c = new THREE.Color(color);
      return new THREE.MeshPhysicalMaterial({
        color: c, roughness, sheen: 0.45, sheenRoughness: 0.6,
        sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.15), ...extra,
      });
    };
    const skinColor = new THREE.Color(S.skin);
    const topColor = new THREE.Color(S.topColor);
    const bottomColor = new THREE.Color(S.bottomColor);
    const goldShoes = S.shoeColor.toLowerCase() === GOLD;
    const M = {
      skin: new THREE.MeshPhysicalMaterial({ color: skinColor, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffd8c8') }),
      skinShade: std(skinColor.clone().multiplyScalar(0.9), 0.6),
      lips: std(skinColor.clone().lerp(new THREE.Color('#b0414b'), 0.42).multiplyScalar(0.92), 0.45),
      lipsFem: std(skinColor.clone().lerp(new THREE.Color('#c0394f'), 0.6).multiplyScalar(0.92), 0.35),
      top: cloth(topColor),
      topDark: cloth(topColor.clone().multiplyScalar(0.72), 0.9),
      rib: cloth('#1d1c22', 0.9),
      bottom: cloth(bottomColor, 0.9),
      bottomDark: cloth(bottomColor.clone().multiplyScalar(0.78), 0.95),
      bottomLight: cloth(bottomColor.clone().lerp(new THREE.Color('#ffffff'), 0.25), 0.95),
      skirt: cloth(bottomColor, 0.85, { flatShading: true, side: THREE.DoubleSide }),
      shoe: goldShoes ? std(GOLD, 0.28, 0.9) : std(S.shoeColor, 0.45),
      sole: std('#ebe7df', 0.65),
      sock: cloth('#f4f2ee', 0.9),
      accent: std(o.accent, 0.35),
      hair: new THREE.MeshPhysicalMaterial({ color: S.hairColor, roughness: 0.62, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(S.hairColor).lerp(new THREE.Color('#ffffff'), 0.3) }),
      hat: cloth(S.hatColor, 0.95),
      white: std('#ffffff', 0.25),
      sclera: std('#f6f3ef', 0.3),
      iris: new THREE.MeshBasicMaterial({ color: '#3d2416' }), // unlit so both eyes match regardless of light direction
      pupil: std('#0c0c10', 0.2),
      dark: std('#18181d', 0.45, 0.2),
      mouth: std('#4a1a20', 0.7),
      silver: std('#e8e8ee', 0.2, 1),
      gold: std(GOLD, 0.22, 1),
      shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };

    const J = (name, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      g.rotation.set(rx, ry, rz);
      parent.add(g);
      this.joints[name] = g;
      this.rest[name] = { p: g.position.clone(), r: g.rotation.clone() };
      return g;
    };
    const add = (parent, geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...p);
      m.scale.set(...s);
      m.rotation.set(...r);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
    const sph = (r, w = 28, h = 20) => new THREE.SphereGeometry(r, w, h);
    const cyl = (rt, rb, h, s = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
    const K = { M, J, add, cap, sph, cyl };

    const body = J('body', this.object3d, 0, 0, 0);
    const fem = S.body === 'female';
    const hips = J('hips', body, 0, 1.02, 0);
    add(hips, sph(0.19), S.bottom === 'skirt' ? M.skin : M.bottom, [0, 0.0, 0], fem ? [1.12, 0.64, 0.78] : [1.0, 0.6, 0.72]);

    const spine = J('spine', hips, 0, 0.04, 0);
    this._buildTop(spine, K);
    if (S.headphones) this._buildHeadphones(spine, K);
    if (S.chain) {
      add(spine, new THREE.TorusGeometry(0.12, 0.006, 8, 48), M.gold, [0, 0.505, 0.045], [1, 1, 1], [Math.PI / 2 + 0.6, 0, 0]);
      add(spine, cyl(0.018, 0.018, 0.005, 20), M.gold, [0, 0.425, 0.15], [1, 1, 1], [Math.PI / 2 - 0.3, 0, 0]);
    }

    const neck = J('neck', spine, 0, 0.53, 0);
    add(neck, fem ? cyl(0.041, 0.049, 0.17) : cyl(0.047, 0.055, 0.17), M.skinShade, [0, 0.055, 0]);
    const head = J('head', neck, 0, 0.115, 0);
    head.scale.setScalar(0.86); // smaller head → more grown-up, semi-realistic proportions
    this._buildHead(head, K);

    this._buildArms(spine, K);
    this._buildLegs(hips, K);

    // € coin prop (hidden until the "coin" move)
    const coinGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 36);
    coinGeo.rotateX(Math.PI / 2);
    const coin = new THREE.Mesh(coinGeo, [M.gold, coinFaceMaterial(), coinFaceMaterial()]);
    coin.visible = false;
    this.object3d.add(coin);
    this.parts.coin = coin;
    this._v1 = new THREE.Vector3();

    this.headAnchor = new THREE.Object3D();
    this.headAnchor.position.set(0, 0.4, 0);
    head.add(this.headAnchor);
  }

  /** Shaped torso (chest → waist → hem) built as a lathe instead of a capsule. */
  _torsoGeometry(scale = 1) {
    const pts = this.style.body === 'female'
      // fuller hips, defined waist, narrower shoulders
      ? [[0.001, -0.08], [0.208, -0.08], [0.214, -0.03], [0.186, 0.07], [0.156, 0.17], [0.17, 0.27], [0.186, 0.35], [0.176, 0.43], [0.146, 0.5], [0.095, 0.543], [0.001, 0.56]]
      : [[0.001, -0.08], [0.188, -0.08], [0.198, -0.03], [0.19, 0.08], [0.186, 0.17], [0.2, 0.28], [0.212, 0.38], [0.205, 0.45], [0.17, 0.51], [0.105, 0.548], [0.001, 0.56]];
    const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r * scale, y)));
    return new THREE.LatheGeometry(curve.getPoints(40), 40);
  }

  _buildTop(spine, { M, add, cyl }) {
    const S = this.style;
    if (S.top === 'hoodie') {
      add(spine, this._torsoGeometry(1.04), M.top, [0, 0, 0], [1.08, 1, 0.74]);
      add(spine, cyl(0.206, 0.206, 0.075, 32), M.topDark, [0, -0.05, 0], [1.1, 1, 0.76]); // ribbed hem
      add(spine, new THREE.CylinderGeometry(0.2, 0.198, 0.11, 24, 1, true, -0.62, 1.24), M.topDark, [0, 0.085, 0], [1.1, 1, 0.76]); // kangaroo pocket
      add(spine, new THREE.BoxGeometry(0.06, 0.022, 0.005), M.accent, [0.085, 0.4, 0.154], [1, 1, 1], [-0.3, 0.3, 0]);
      add(spine, new THREE.TorusGeometry(0.105, 0.05, 14, 32), M.topDark, [0, 0.54, -0.03], [1.15, 1, 0.95], [Math.PI / 2 - 0.25, 0, 0]); // hood
      for (const sx of [-1, 1]) {
        add(spine, cyl(0.0055, 0.0055, 0.17, 8), M.white, [sx * 0.04, 0.43, 0.15], [1, 1, 1], [-0.22, 0, sx * 0.05]);
        add(spine, cyl(0.009, 0.009, 0.022, 10), M.accent, [sx * 0.044, 0.34, 0.165], [1, 1, 1], [-0.22, 0, 0]);
      }
    } else if (S.top === 'jacket') {
      add(spine, this._torsoGeometry(1.05), M.top, [0, 0, 0], [1.08, 1, 0.76]);
      add(spine, cyl(0.205, 0.2, 0.065, 32), M.rib, [0, -0.05, 0], [1.1, 1, 0.78]);
      add(spine, cyl(0.2065, 0.2065, 0.01, 32), M.accent, [0, -0.045, 0], [1.1, 1, 0.78]); // stripe on the rib
      add(spine, new THREE.BoxGeometry(0.01, 0.3, 0.01), M.silver, [0, 0.22, 0.154]); // zipper
      add(spine, new THREE.TorusGeometry(0.085, 0.026, 10, 28), M.rib, [0, 0.53, 0.0], [1.2, 1, 1], [Math.PI / 2 - 0.25, 0, 0]); // collar
      add(spine, cyl(0.065, 0.07, 0.05), M.white, [0, 0.52, 0.0]); // tee peeking out
      for (const sx of [-1, 1]) add(spine, new THREE.BoxGeometry(0.07, 0.008, 0.01), M.topDark, [sx * 0.095, 0.15, 0.146], [1, 1, 1], [0, sx * 0.45, 0]);
    } else { // tee – fitted
      add(spine, this._torsoGeometry(0.97), M.top, [0, 0, 0], [1.05, 1, 0.7]);
      add(spine, new THREE.TorusGeometry(0.062, 0.01, 8, 28), M.topDark, [0, 0.535, 0.01], [1.15, 1, 1], [Math.PI / 2 - 0.25, 0, 0]);
      add(spine, new THREE.RingGeometry(0.022, 0.034, 28), M.accent, [0.0, 0.33, 0.146], [1, 1, 1], [-0.12, 0, 0]);
      add(spine, new THREE.CircleGeometry(0.01, 16), M.accent, [0.0, 0.33, 0.147], [1, 1, 1], [-0.12, 0, 0]);
    }
  }

  _buildHeadphones(spine, { M, add, cyl }) {
    const phones = new THREE.Group();
    phones.position.set(0, 0.57, 0.04);
    phones.rotation.x = 0.5;
    spine.add(phones);
    add(phones, new THREE.TorusGeometry(0.125, 0.012, 10, 40, Math.PI), M.dark, [0, 0, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) {
      const cup = add(phones, cyl(0.05, 0.05, 0.035, 28), M.dark, [sx * 0.13, -0.01, 0.035], [1, 1, 1], [0, 0, Math.PI / 2]);
      cup.rotation.y = sx * 0.5;
      add(phones, cyl(0.039, 0.039, 0.01, 28), M.accent, [sx * 0.15, -0.01, 0.048], [1, 1, 1], [0, sx * 0.5, Math.PI / 2]);
    }
  }

  _buildArms(spine, { M, J, add, cap, sph, cyl }) {
    const S = this.style;
    const tee = S.top === 'tee';
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const fem = S.body === 'female';
      const sh = J(`shoulder${side}`, spine, sx * (fem ? 0.192 : 0.225), 0.45, 0, 0, 0, sx * 0.11);
      add(sh, sph(tee ? 0.056 : 0.06), M.top, [0, -0.035, 0]);
      if (tee) {
        add(sh, cap(0.062, 0.05), M.top, [0, -0.065, 0]); // short sleeve
        add(sh, cap(0.042, 0.22), M.skin, [0, -0.16, 0]);
      } else {
        add(sh, cap(0.058, 0.21), M.top, [0, -0.15, 0]);
        if (S.top === 'jacket' && side === 'L') {
          add(sh, new THREE.CircleGeometry(0.024, 20), M.accent, [0.059, -0.1, 0], [1, 1, 1], [0, Math.PI / 2, 0]); // sleeve patch
        }
      }
      const el = J(`elbow${side}`, sh, 0, -0.3, 0, -0.14, 0, 0);
      if (tee) {
        add(el, cap(0.037, 0.21), M.skin, [0, -0.14, 0]);
      } else {
        add(el, cap(0.052, 0.18), M.top, [0, -0.125, 0]);
        add(el, cyl(0.046, 0.049, 0.045), S.top === 'jacket' ? M.rib : M.topDark, [0, -0.24, 0]);
        add(el, cap(0.034, 0.05), M.skin, [0, -0.25, 0]); // wrist
      }
      const hand = J(`hand${side}`, el, 0, -0.27, 0);
      add(hand, sph(0.047), M.skin, [0, -0.048, 0.003], [0.5, 1.1, 1.0]); // palm
      // four fingers on a "knuckle" joint so poses can curl them into a fist
      const fingers = J(`fingers${side}`, hand, 0, -0.092, 0, 0, 0, -sx * 0.18);
      [[0.029, 0.042], [0.0105, 0.049], [-0.008, 0.047], [-0.026, 0.038]].forEach(([z, len]) => {
        add(fingers, cap(0.0108, len), M.skin, [0, -len / 2 - 0.004, z + 0.003]);
      });
      const thumb = J(`thumb${side}`, hand, -sx * 0.014, -0.03, 0.032, 0.5, 0, 0);
      add(thumb, cap(0.0145, 0.044), M.skin, [0, -0.032, 0]);
    }
  }

  _buildLegs(hips, { M, J, add, cap, cyl }) {
    const S = this.style;
    const b = S.bottom;
    if (b === 'skirt') {
      const w = S.body === 'female' ? 1.13 : 1; // wider hips → wider skirt
      add(hips, cyl(0.19, 0.29, 0.36, 18, true), M.skirt, [0, -0.14, 0], [w, 1, 0.82 * w]); // pleats via flat shading
      add(hips, cyl(0.195, 0.195, 0.04, 28), M.bottomDark, [0, 0.03, 0], [w, 1, 0.82 * w]); // waistband
    }
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const leg = J(`leg${side}`, hips, sx * 0.098, -0.03, 0, 0, 0, sx * 0.022);
      const knee = J(`knee${side}`, leg, 0, -0.47, 0);
      if (b === 'cargo') {
        add(leg, cap(0.092, 0.37), M.bottom, [0, -0.235, 0]);
        add(leg, new THREE.BoxGeometry(0.035, 0.1, 0.07), M.bottomDark, [sx * 0.09, -0.28, 0.0]);
        add(knee, cyl(0.082, 0.09, 0.42), M.bottom, [0, -0.2, 0]);
        add(knee, new THREE.TorusGeometry(0.078, 0.017, 10, 28), M.bottomDark, [0, -0.39, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      } else if (b === 'jeans') {
        add(leg, cap(0.078, 0.38), M.bottom, [0, -0.24, 0]);
        add(knee, cyl(0.064, 0.074, 0.42), M.bottom, [0, -0.2, 0]);
        add(knee, cyl(0.07, 0.07, 0.045, 24), M.bottomLight, [0, -0.385, 0]); // rolled hem
      } else { // shorts or skirt → bare legs + socks
        if (b === 'shorts') {
          add(leg, cap(0.09, 0.13), M.bottom, [0, -0.12, 0]);
          add(leg, cyl(0.09, 0.09, 0.03, 24), M.bottomDark, [0, -0.245, 0]);
        }
        add(leg, cap(0.062, 0.36), M.skin, [0, -0.25, 0]);
        add(knee, cap(0.048, 0.37), M.skin, [0, -0.2, 0]);
        add(knee, cyl(0.045, 0.047, 0.1), M.sock, [0, -0.39, 0]);
      }
      const foot = J(`foot${side}`, knee, 0, -0.45, 0, 0, sx * 0.1, 0);
      add(foot, cap(0.05, 0.14), M.shoe, [0, -0.01, 0.05], [1.02, 0.82, 1], [Math.PI / 2, 0, 0]);
      add(foot, cap(0.056, 0.15), M.sole, [0, -0.05, 0.05], [1.06, 0.36, 1.02], [Math.PI / 2, 0, 0]);
      for (const ss of [-1, 1]) {
        add(foot, new THREE.BoxGeometry(0.005, 0.02, 0.11), M.accent, [ss * 0.052, -0.015, 0.045], [1, 1, 1], [0.15, 0, 0]);
      }
      add(foot, cyl(0.044, 0.05, 0.04), M.dark, [0, 0.035, -0.005]);
    }
  }

  _buildHead(head, K) {
    const { M, add, sph, cap } = K;
    const S = this.style;
    const P = this.parts;
    // skull, jaw and chin
    add(head, sph(0.17, 48, 36), M.skin, [0, 0.16, 0], [0.92, 1.06, 0.97]);
    const fem = S.body === 'female';
    add(head, sph(0.07), M.skin, fem ? [0, 0.078, 0.055] : [0, 0.072, 0.055], fem ? [0.98, 0.8, 0.96] : [1.12, 0.85, 1.0]); // softer jaw for female
    // ears
    for (const sx of [-1, 1]) {
      add(head, sph(0.034), M.skin, [sx * 0.153, 0.15, -0.005], [0.42, 1, 0.68], [0, 0, -sx * 0.1]);
      add(head, sph(0.017), M.skinShade, [sx * 0.158, 0.15, 0.0], [0.3, 1, 0.6]);
    }
    if (S.earring) add(head, new THREE.TorusGeometry(0.014, 0.003, 8, 24), M.silver, [0.158, 0.102, 0.005], [1, 1, 1], [0, Math.PI / 2, 0]);
    // nose: bridge, tip and nostril wings
    add(head, cap(0.011, 0.04), M.skin, [0, 0.162, 0.157], [1, 1, 0.9], [-0.32, 0, 0]);
    add(head, sph(0.018), M.skin, [0, 0.133, 0.17], [1, 0.82, 0.9]);
    for (const sx of [-1, 1]) add(head, sph(0.011), M.skinShade, [sx * 0.015, 0.128, 0.161]);

    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.056, 0.18, 0.14);
      eye.rotation.y = sx * 0.22;
      head.add(eye);
      add(eye, sph(0.029), M.sclera, [0, 0, 0], [1.2, 0.95, 0.55]);
      const iris = new THREE.Group();
      iris.position.z = 0.0162;
      eye.add(iris);
      add(iris, new THREE.CircleGeometry(0.0158, 24), M.iris);
      add(iris, new THREE.CircleGeometry(0.0072, 20), M.pupil, [0, 0, 0.0005]);
      add(iris, new THREE.CircleGeometry(0.0034, 12), M.shine, [0.004, 0.005, 0.001]);
      // upper eyelid (skin) gives a natural almond / hooded shape; lash line on its edge
      add(eye, new THREE.SphereGeometry(0.0305, 24, 12, 0, TAU, 0, 0.8), M.skin, [0, 0.001, 0.0], [1.22, 0.98, 0.62], [0.12, 0, 0]);
      add(eye, new THREE.TorusGeometry(0.029, fem ? 0.0042 : 0.0028, 6, 24, Math.PI * 0.92), M.dark, [0, 0.002, 0.004], [1.2, 0.92, 0.6], [0.1, 0, Math.PI * 0.04]);
      if (fem) add(eye, cap(0.0026, 0.012), M.dark, [sx * 0.034, 0.008, 0.004], [1, 1, 1], [0, 0, sx * 1.0]); // lash flick
      P[`eye${side}`] = eye;
      P[`iris${side}`] = iris;

      const brow = new THREE.Group();
      brow.position.set(sx * 0.058, 0.218, 0.147);
      brow.rotation.y = sx * 0.3;
      brow.userData.y = brow.position.y;
      head.add(brow);
      add(brow, new THREE.TorusGeometry(0.042, fem ? 0.0042 : 0.0062, 6, 16, 0.85), M.hair, [0, -0.04, 0], [1, 1, 0.6], [0, 0, Math.PI / 2 - 0.425]);
      P[`brow${side}`] = brow;

      if (S.glasses) {
        add(head, new THREE.TorusGeometry(0.034, 0.0045, 8, 32), M.dark, [sx * 0.057, 0.178, 0.17], [1.15, 0.88, 1], [0, sx * 0.2, 0]);
        add(head, new THREE.BoxGeometry(0.004, 0.006, 0.15), M.dark, [sx * 0.146, 0.186, 0.092], [1, 1, 1], [0, sx * 0.08, 0]);
      }
    }
    if (S.glasses) add(head, new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, 8), M.dark, [0, 0.185, 0.176], [1, 1, 1], [0, 0, Math.PI / 2]);

    const mouth = new THREE.Group();
    mouth.position.set(0, 0.09, 0.149);
    mouth.rotation.x = -0.25;
    head.add(mouth);
    P.mouth = mouth;
    P.smile = add(mouth, new THREE.TorusGeometry(0.024, fem ? 0.0082 : 0.0068, 10, 28, Math.PI), fem ? M.lipsFem : M.lips, [0, 0.01, 0], [1, 1, 0.8], [0, 0, Math.PI]);
    const openGeo = new THREE.SphereGeometry(0.023, 20, 14);
    openGeo.scale(1, 1, 0.35);
    openGeo.translate(0, -0.011, 0);
    P.mouthOpen = add(mouth, openGeo, M.mouth, [0, 0.012, 0]);

    this._buildHair(head, K);
  }

  _buildHair(head, { M, add, sph, cap }) {
    const style = this.style.hairStyle;
    // short back & sides (fade) – shared by most styles so the head is never bald
    add(head, new THREE.SphereGeometry(0.1735, 40, 20, 0, TAU, 0, 1.45), M.hair, [0, 0.162, -0.004], [0.95, 1.05, 0.99], [-1.2, 0, 0]);

    const top = new THREE.Group(); // tilted frame matching the skull's top
    top.position.set(0, 0.165, -0.008);
    top.rotation.x = -0.42;
    head.add(top);
    const capGeo = (r, len = 1.25) => new THREE.SphereGeometry(r, 40, 24, 0, TAU, 0, len);

    if (style === 'curls') {
      add(top, capGeo(0.176), M.hair, [0, 0, 0], [0.98, 1.05, 1.02]);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const dir = new THREE.Vector3();
      for (let i = 0; i < 90; i++) {
        const theta = Math.sqrt(rnd()) * 1.22;
        const phi = rnd() * TAU;
        dir.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
        add(top, sph(0.03 + rnd() * 0.022, 12, 9), M.hair, [dir.x * 0.172, dir.y * 0.172 + 0.008, dir.z * 0.172]);
      }
      add(head, sph(0.03, 14, 10), M.hair, [0.035, 0.288, 0.12]);
      add(head, sph(0.024, 14, 10), M.hair, [-0.02, 0.292, 0.125]);
    } else if (style === 'buzz') {
      add(top, capGeo(0.1745, 1.3), M.hair, [0, 0, 0], [0.96, 1.03, 1.0]);
    } else if (style === 'bun') {
      add(top, capGeo(0.178, 1.3), M.hair, [0, 0, 0], [0.97, 1.05, 1.01]);
      add(head, sph(0.075, 24, 18), M.hair, [0, 0.355, -0.075]);
      add(head, new THREE.TorusGeometry(0.052, 0.014, 10, 28), M.accent, [0, 0.315, -0.06], [1, 1, 1], [Math.PI / 2 + 0.6, 0, 0]);
    } else if (style === 'long') {
      add(top, capGeo(0.181, 1.55), M.hair, [0, 0, 0], [0.98, 1.05, 1.03]);
      add(head, cap(0.15, 0.2), M.hair, [0, 0.06, -0.06], [1.1, 1, 0.62]);          // hair down the back
      for (const sx of [-1, 1]) {
        add(head, cap(0.06, 0.2), M.hair, [sx * 0.15, 0.09, -0.015], [0.55, 1, 1.45], [0, 0, sx * 0.06]); // side panels
      }
      add(head, sph(0.1, 24, 16), M.hair, [0.035, 0.282, 0.068], [1.2, 0.42, 0.85], [0.35, 0, -0.28]); // swept fringe
    } else if (style === 'beanie') {
      const hat = new THREE.Group();
      hat.position.set(0, 0.17, -0.01);
      hat.rotation.x = -0.25;
      head.add(hat);
      add(hat, new THREE.SphereGeometry(0.19, 40, 24, 0, TAU, 0, 1.45), M.hat, [0, 0, 0], [0.98, 1.08, 1.02]);
      add(hat, new THREE.TorusGeometry(0.183, 0.03, 12, 40), M.hat, [0, 0.04, 0], [0.98, 1, 1.02], [Math.PI / 2, 0, 0]); // folded cuff
      add(hat, new THREE.BoxGeometry(0.05, 0.03, 0.01), M.accent, [0, 0.045, 0.205]); // label
    }
  }
}

let coinTex;
function coinFaceMaterial() {
  if (!coinTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(50, 45, 10, 64, 64, 64);
    g.addColorStop(0, '#ffe58a'); g.addColorStop(0.6, '#ffc21a'); g.addColorStop(1, '#e09a00');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(160,100,0,.55)'; x.lineWidth = 6;
    x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(150,90,0,.85)'; x.font = '900 76px Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('€', 64, 69);
    coinTex = new THREE.CanvasTexture(c); coinTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.55, roughness: 0.3 });
}

// -----------------------------------------------------------------------------
// Poses. Keys are "<joint>.<px|py|pz|rx|ry|rz>" (offsets from rest) or "face.<x>".

const FACE_DEFAULTS = {
  'face.smile': 0.35, 'face.open': 0, 'face.squint': 0, 'face.wink': 0,
  'face.brow': 0, 'face.browTilt': 0, 'face.browAsym': 0,
  'face.eyeX': 0, 'face.eyeY': 0, 'face.mouthX': 0,
};

/** Knee bend that keeps the feet on the floor. */
function crouch(p, a, sides = ['L', 'R']) {
  for (const s of sides) {
    p[`leg${s}.rx`] = (p[`leg${s}.rx`] || 0) - a;
    p[`knee${s}.rx`] = (p[`knee${s}.rx`] || 0) + 2 * a;
    p[`foot${s}.rx`] = (p[`foot${s}.rx`] || 0) - a;
  }
  p['hips.py'] = (p['hips.py'] || 0) - 2 * LEG * (1 - Math.cos(a));
}

/** Counter-rotate legs so that hip sway doesn't make the feet slide. */
function plantFeet(p) {
  const comp = -(p['hips.rz'] || 0) - (p['hips.px'] || 0) / (2 * LEG);
  p['legL.rz'] = (p['legL.rz'] || 0) + comp;
  p['legR.rz'] = (p['legR.rz'] || 0) + comp;
  p['footL.rz'] = (p['footL.rz'] || 0) - comp;
  p['footR.rz'] = (p['footR.rz'] || 0) - comp;
}

function idlePose(t) {
  const breathe = Math.sin(t * 1.7);
  const shift = Math.sin(t * 0.42) + 0.3 * Math.sin(t * 0.17);
  const p = {
    'spine.rx': 0.018 * breathe,
    'spine.rz': -0.025 * shift,
    'spine.ry': 0.03 * Math.sin(t * 0.31),
    'hips.px': 0.022 * shift,
    'hips.rz': 0.022 * shift,
    'hips.py': 0.003 * breathe,
    'shoulderL.rz': 0.02 * breathe + 0.015 * shift,
    'shoulderR.rz': -0.02 * breathe + 0.015 * shift,
    'shoulderL.rx': 0.035 * Math.sin(t * 0.9 + 1.0),
    'shoulderR.rx': 0.035 * Math.sin(t * 0.9 + 2.3),
    'elbowL.rx': -0.05 * (1 + Math.sin(t * 0.8 + 1.4)),
    'elbowR.rx': -0.05 * (1 + Math.sin(t * 0.8 + 2.9)),
    'head.ry': 0.13 * Math.sin(t * 0.37) + 0.05 * Math.sin(t * 0.91),
    'head.rx': 0.035 * Math.sin(t * 0.53) - 0.012 * breathe,
    'head.rz': 0.045 * Math.sin(t * 0.29) - 0.02 * shift,
    'face.smile': 0.38 + 0.12 * Math.sin(t * 0.23),
    'face.brow': 0.08 * Math.max(0, Math.sin(t * 0.61)),
    'face.eyeX': 0.35 * Math.sin(t * 0.37 + 0.4),
  };
  plantFeet(p);
  return p;
}

const MOTIONS = {
  // Big friendly wave with the right hand.
  greet: {
    duration: 2.5,
    look: 0.6,
    pose(t, d) {
      const up = env(t, 0, 0.35, d - 0.45, d);
      const wave = Math.sin((t - 0.3) * 13);
      const p = {
        'shoulderR.rz': -1.8 * up,
        'shoulderR.rx': 0.2 * up,
        'elbowR.rz': (-1.15 + 0.4 * wave) * up,
        'elbowR.rx': 0.14 * up,
        'handR.rz': 0.25 * wave * up,
        'handR.ry': 0.6 * up,
        'spine.rz': 0.06 * up,
        'spine.rx': -0.04 * up,
        'head.rz': 0.13 * up,
        'head.rx': -0.06 * up,
        'shoulderL.rz': 0.05 * up,
        'hips.py': 0.025 * Math.sin(Math.min(1, t / 0.45) * Math.PI),
        'face.smile': 1,
        'face.open': 0.45 * env(t, 0.1, 0.3, 0.9, 1.3),
        'face.squint': 0.35 * up,
        'face.brow': 0.7 * up,
      };
      return p;
    },
  },

  // Anticipation crouch → jump with 360° spin → arms up fist pumps.
  celebrate: {
    duration: 3.3,
    look: 0.15,
    idleBlend: 0.1,
    pose(t, d) {
      const p = {};
      const jt = (t - 0.38) / 0.72; // airborne 0..1
      const air = jt > 0 && jt < 1;
      const pre = env(t, 0, 0.3, 0.32, 0.4);
      const land = env(t, 1.08, 1.16, 1.2, 1.45);
      const after = smooth((t - 1.2) / 0.3) * (1 - smooth((t - (d - 0.5)) / 0.5));
      const pump = 0.5 + 0.5 * Math.sin((t - 1.2) * 11);
      const armsUp = smooth((t - 0.25) / 0.25) * (1 - smooth((t - (d - 0.45)) / 0.45));

      crouch(p, 0.38 * pre + 0.3 * land + 0.12 * pump * after);
      if (air) {
        const h = 4 * 0.34 * jt * (1 - jt);
        p['body.py'] = h;
        p['body.ry'] = smooth(jt) * TAU;
        const tuck = Math.sin(jt * Math.PI);
        p['legL.rx'] = -0.55 * tuck; p['kneeL.rx'] = 1.0 * tuck;
        p['legR.rx'] = -0.25 * tuck; p['kneeR.rx'] = 0.7 * tuck;
      }
      p['shoulderL.rz'] = 2.55 * armsUp;
      p['shoulderR.rz'] = -2.55 * armsUp;
      p['elbowL.rz'] = 0.55 * pump * after;
      p['elbowR.rz'] = -0.55 * pump * after;
      p['elbowL.rx'] = 0.14 * armsUp;
      p['elbowR.rx'] = 0.14 * armsUp;
      p['spine.rx'] = -0.12 * armsUp + 0.12 * pre;
      p['head.rx'] = -0.2 * armsUp;
      p['head.rz'] = 0.08 * Math.sin(t * 6) * after;
      p['face.smile'] = 1;
      p['face.open'] = 0.85 * smooth(t / 0.4) * (1 - smooth((t - (d - 0.3)) / 0.3));
      p['face.squint'] = 0.85 * smooth((t - 0.2) / 0.3);
      p['face.brow'] = 0.8;
      return p;
    },
  },

  // Thumbs up + nod + wink.
  nod: {
    duration: 2.1,
    look: 0.5,
    pose(t, d) {
      const up = env(t, 0, 0.35, d - 0.45, d);
      const nod = Math.max(0, Math.sin((t - 0.35) * 8.5)) * env(t, 0.35, 0.45, 1.3, 1.6);
      return {
        'shoulderR.rx': -0.7 * up,
        'shoulderR.rz': 0.18 * up,
        'elbowR.rx': -1.35 * up,
        'elbowR.ry': -0.25 * up,
        'handR.ry': -1.4 * up,
        'handR.rx': -0.15 * up,
        'thumbR.rx': -1.05 * up,
        'fingersR.rz': 1.5 * up,
        'thumbR.rz': 0.4 * up,
        'spine.ry': -0.12 * up,
        'spine.rx': 0.03 * up,
        'head.rx': 0.17 * nod - 0.03 * up,
        'head.rz': -0.08 * up,
        'face.smile': 0.95,
        'face.squint': 0.25 * up,
        'face.wink': env(t, 0.5, 0.65, 1.3, 1.45),
        'face.brow': 0.35 * up,
        'face.browAsym': 0.4 * env(t, 0.5, 0.65, 1.3, 1.45),
      };
    },
  },

  // Palms-up shrug with a "not sure" face.
  shrug: {
    duration: 2.3,
    look: 0.3,
    pose(t, d) {
      const up = env(t, 0, 0.4, d - 0.5, d);
      const pop = env(t, 0.25, 0.45, 0.9, 1.5);
      const p = {
        'face.smile': 0.12,
        'face.mouthX': 0.6 * up,
        'face.browTilt': 0.55 * up,
        'face.browAsym': 0.5 * up,
        'face.eyeY': 0.6 * up,
        'face.eyeX': -0.4 * up,
        'head.rz': 0.17 * up,
        'head.ry': -0.12 * up,
        'head.rx': -0.04 * up,
        'spine.rx': -0.03 * up,
      };
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        p[`shoulder${s}.py`] = 0.035 * pop + 0.01 * up;
        p[`shoulder${s}.rz`] = sx * 0.32 * up;
        p[`shoulder${s}.rx`] = -0.12 * up;
        p[`elbow${s}.rx`] = -1.25 * up;
        p[`elbow${s}.ry`] = sx * 0.45 * up;
        p[`hand${s}.ry`] = -sx * 1.4 * up;
        p[`hand${s}.rz`] = sx * 0.25 * up;
      }
      return p;
    },
  },

  // Groovy two-step at 120 bpm.
  dance: {
    duration: 4.2,
    look: 0.2,
    idleBlend: 0,
    pose(t, d) {
      const on = env(t, 0, 0.3, d - 0.4, d);
      const beat = t * TAU * 2.0;
      const half = beat / 2;
      const p = {};
      crouch(p, (0.1 + 0.09 * (0.5 + 0.5 * Math.cos(beat))) * on);
      p['hips.px'] = 0.045 * Math.sin(half) * on;
      p['hips.rz'] = 0.07 * Math.sin(half) * on;
      p['hips.ry'] = 0.12 * Math.sin(half) * on;
      p['spine.rz'] = -0.12 * Math.sin(half) * on;
      p['spine.ry'] = -0.18 * Math.sin(half) * on;
      p['body.ry'] = 0.3 * Math.sin(beat / 4) * on;
      plantFeet(p);
      const a = Math.sin(half);
      p['shoulderL.rz'] = (0.45 + 0.35 * a) * on;
      p['shoulderR.rz'] = -(0.45 - 0.35 * a) * on;
      p['shoulderL.rx'] = -0.35 * on;
      p['shoulderR.rx'] = -0.35 * on;
      p['elbowL.rx'] = (-1.3 + 0.35 * Math.cos(beat)) * on;
      p['elbowR.rx'] = (-1.3 - 0.35 * Math.cos(beat)) * on;
      p['head.rz'] = 0.12 * Math.sin(half + 0.5) * on;
      p['head.rx'] = 0.07 * Math.cos(beat) * on;
      p['face.smile'] = 0.95;
      p['face.squint'] = 0.65 * on;
      p['face.open'] = (0.1 + 0.12 * Math.max(0, Math.sin(beat))) * on;
      p['face.brow'] = 0.3 * on;
      return p;
    },
  },

  // ---- Moves that mirror Sparkie's library, so this avatar can replace Sparkie 1:1 ----

  // Pop-in entrance: drop in with a spin, land, then wave.
  intro: {
    duration: 3.0,
    look: 0.3,
    idleBlend: 0.1,
    pose(t, d) {
      const f = clamp01(t / 0.9);
      const land = env(t, 0.85, 0.95, 1.0, 1.35);
      const p = t >= 1.05 ? MOTIONS.greet.pose(t - 1.05, d - 1.05) : {};
      if (t < 0.92) {
        p['body.py'] = 1.1 * (1 - f) * (1 - f);
        p['body.ry'] = (1 - (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2)) * TAU * 2;
        p['shoulderL.rz'] = 0.6 * (1 - f); p['shoulderR.rz'] = -0.6 * (1 - f);
        p['legL.rx'] = -0.3 * (1 - f); p['kneeL.rx'] = 0.6 * (1 - f);
        p['face.smile'] = 1; p['face.squint'] = 0.6; p['face.open'] = 0.3;
      }
      crouch(p, 0.3 * land);
      return p;
    },
  },

  // Quick happy hop.
  jump: {
    duration: 1.0,
    look: 0.3,
    idleBlend: 0.1,
    pose(t) {
      const p = {};
      const pre = env(t, 0, 0.16, 0.18, 0.24);
      const jt = (t - 0.22) / 0.42;
      const land = env(t, 0.62, 0.68, 0.72, 0.92);
      crouch(p, 0.32 * pre + 0.25 * land);
      if (jt > 0 && jt < 1) {
        p['body.py'] = 4 * 0.26 * jt * (1 - jt);
        const tuck = Math.sin(jt * Math.PI);
        for (const s of ['L', 'R']) { p[`leg${s}.rx`] = -0.35 * tuck; p[`knee${s}.rx`] = 0.7 * tuck; }
      }
      const up = env(t, 0.15, 0.3, 0.7, 0.95);
      p['shoulderL.rz'] = 2.3 * up; p['shoulderR.rz'] = -2.3 * up;
      p['elbowL.rz'] = 0.25 * up; p['elbowR.rz'] = -0.25 * up;
      p['elbowL.rx'] = 0.14 * up; p['elbowR.rx'] = 0.14 * up;
      p['face.smile'] = 1; p['face.squint'] = 0.55 * up; p['face.open'] = 0.5 * up; p['face.brow'] = 0.5 * up;
      return p;
    },
  },

  // Catch a falling € coin, smile, pocket it.
  coin: {
    duration: 2.0,
    look: 0.1,
    pose(t, d) {
      const reach = env(t, 0.05, 0.35, 1.15, 1.45);
      const lookUp = env(t, 0.05, 0.3, 0.8, 1.0);
      const happy = smooth((t - 0.95) / 0.2) * (1 - smooth((t - (d - 0.35)) / 0.35));
      const c = (t - 0.25) / 1.25;
      return {
        'shoulderR.rx': -0.85 * reach,
        'shoulderR.rz': 0.12 * reach,
        'elbowR.rx': -0.55 * reach,
        'handR.ry': -1.5 * reach,
        'fingersR.rz': 0.35 * reach,
        'head.rx': -0.32 * lookUp + 0.1 * env(t, 0.95, 1.05, 1.3, 1.5),
        'body.py': 0.05 * Math.sin(clamp01((t - 0.95) / 0.4) * Math.PI),
        'face.eyeY': 0.8 * lookUp - 0.4 * env(t, 0.95, 1.05, 1.3, 1.5),
        'face.open': 0.4 * env(t, 0.2, 0.4, 0.85, 1.0),
        'face.smile': 0.6 + 0.4 * happy,
        'face.squint': 0.8 * happy,
        'face.brow': 0.5,
        'prop.coin': c > 0 && c < 1 ? c : 0,
      };
    },
  },

  // Disappointed: head and shoulders drop, worried brows, frown.
  sad: {
    duration: 2.2,
    look: 0.1,
    pose(t, d) {
      const e = env(t, 0, 0.4, d - 0.5, d);
      return {
        'head.rx': 0.3 * e, 'neck.rx': 0.08 * e, 'spine.rx': 0.12 * e,
        'head.rz': 0.05 * Math.sin(t * Math.PI) * e,
        'shoulderL.py': -0.02 * e, 'shoulderR.py': -0.02 * e,
        'shoulderL.rz': -0.07 * e, 'shoulderR.rz': 0.07 * e,
        'shoulderL.rx': 0.12 * e, 'shoulderR.rx': 0.12 * e,
        'hips.py': -0.01 * e,
        'face.smile': -0.75 * e, 'face.browTilt': 0.9 * e, 'face.eyeY': -0.6 * e, 'face.squint': 0.15 * e,
      };
    },
  },

  // "No" head shake.
  shake: {
    duration: 1.0,
    look: 0,
    pose(t, d) {
      const e = env(t, 0, 0.1, d - 0.3, d);
      const w = Math.sin(t * 18) * e;
      return {
        'head.ry': 0.33 * w, 'neck.ry': 0.1 * w,
        'face.smile': 0.05, 'face.browTilt': -0.35 * e, 'face.brow': -0.2 * e, 'face.mouthX': 0.25 * e,
      };
    },
  },

  // Hand to chin, eyes up: thinking.
  think: {
    duration: 2.4,
    look: 0.2,
    pose(t, d) {
      const e = env(t, 0, 0.45, d - 0.5, d);
      return {
        'shoulderR.rx': -0.9 * e, 'shoulderR.rz': 0.5 * e,
        'elbowR.rx': -1.95 * e, 'elbowR.ry': -0.35 * e,
        'handR.rx': 0.35 * e, 'fingersR.rz': 1.1 * e,
        'shoulderL.rx': -0.08 * e,
        'head.rz': 0.1 * e, 'head.rx': -0.06 * e, 'head.ry': -0.1 * e,
        'face.eyeX': -0.5 * e, 'face.eyeY': 0.7 * e, 'face.browAsym': 0.5 * e, 'face.mouthX': 0.45 * e, 'face.smile': 0.15,
      };
    },
  },

  // ---- Emotes & dances for the "For You" feed (original moves) ----

  // Heart hands in front of the chest.
  heart: {
    duration: 2.4,
    look: 0.6,
    pose(t, d) {
      const e = env(t, 0, 0.45, d - 0.45, d);
      const pulse = 1 + 0.06 * Math.sin(t * 9) * e;
      const p = {
        'spine.rx': -0.03 * e, 'head.rz': 0.12 * e * Math.sin(t * 2.2),
        'face.smile': 1, 'face.squint': 0.7 * e, 'face.brow': 0.5 * e, 'face.open': 0.15 * e,
      };
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        p[`shoulder${s}.rx`] = -0.75 * e * pulse;
        p[`shoulder${s}.rz`] = -sx * 0.42 * e;
        p[`elbow${s}.rx`] = -2.05 * e;
        p[`hand${s}.ry`] = -sx * 1.1 * e;
        p[`hand${s}.rx`] = 0.4 * e;
        p[`fingers${s}.rz`] = -sx * 0.9 * e;
      }
      return p;
    },
  },

  // Double biceps flex with a confident smirk.
  flex: {
    duration: 2.4,
    look: 0.5,
    pose(t, d) {
      const e = env(t, 0, 0.35, d - 0.4, d);
      const pump = 0.5 + 0.5 * Math.sin((t - 0.35) * 10);
      const p = {
        'spine.rx': -0.08 * e, 'head.rx': -0.08 * e, 'head.rz': -0.08 * e,
        'face.smile': 0.8, 'face.mouthX': 0.45 * e, 'face.browAsym': 0.6 * e, 'face.squint': 0.3 * e,
      };
      crouch(p, 0.12 * e);
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        p[`shoulder${s}.rz`] = sx * 1.5 * e;
        p[`shoulder${s}.rx`] = -0.15 * e;
        p[`elbow${s}.rz`] = sx * (1.55 + 0.25 * pump) * e;
        p[`fingers${s}.rz`] = sx * 1.5 * e;
        p[`shoulder${s}.py`] = 0.015 * pump * e;
      }
      return p;
    },
  },

  // Hands to the head… then "boom": mind blown.
  mindBlown: {
    duration: 2.6,
    look: 0.3,
    idleBlend: 0.1,
    pose(t, d) {
      const toHead = env(t, 0, 0.4, 0.8, 1.0);
      const boom = env(t, 0.85, 1.05, d - 0.45, d);
      const p = {
        'face.open': 0.3 * toHead + 0.9 * boom, 'face.brow': 0.4 * toHead + 1 * boom, 'face.smile': 0.5,
        'face.eyeY': 0.3 * boom, 'spine.rx': -0.1 * boom, 'head.rx': -0.12 * boom + 0.05 * toHead,
        'head.rz': 0.05 * Math.sin(t * 30) * toHead,
      };
      crouch(p, 0.15 * toHead);
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        p[`shoulder${s}.rz`] = sx * (2.3 * toHead + 2.3 * boom);
        p[`shoulder${s}.rx`] = -0.75 * toHead;
        p[`elbow${s}.rz`] = sx * 2.25 * toHead + sx * 0.2 * boom;
        p[`hand${s}.rz`] = sx * 0.5 * boom;
      }
      return p;
    },
  },

  // Side-to-side shuffle with arm pumps (120 bpm).
  shuffle: {
    duration: 4.0,
    look: 0.2,
    idleBlend: 0,
    pose(t, d) {
      const on = env(t, 0, 0.3, d - 0.35, d);
      const beat = t * TAU * 2.0;
      const side = Math.sin(beat / 2);
      const p = {};
      crouch(p, (0.16 + 0.08 * Math.abs(Math.sin(beat))) * on);
      p['hips.px'] = 0.08 * side * on;
      p['hips.rz'] = 0.05 * side * on;
      p['spine.rz'] = -0.08 * side * on;
      plantFeet(p);
      // alternate heel/toe kicks
      const kickL = Math.max(0, Math.sin(beat)) * on;
      const kickR = Math.max(0, -Math.sin(beat)) * on;
      p['legL.rz'] += 0.22 * kickL; p['footL.ry'] = 0.5 * kickL;
      p['legR.rz'] -= 0.22 * kickR; p['footR.ry'] = -0.5 * kickR;
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        const ph = s === 'L' ? Math.sin(beat) : -Math.sin(beat);
        p[`shoulder${s}.rx`] = (-0.3 - 0.45 * ph) * on;
        p[`shoulder${s}.rz`] = sx * 0.25 * on;
        p[`elbow${s}.rx`] = -1.5 * on;
        p[`fingers${s}.rz`] = sx * 1.4 * on;
      }
      p['head.rx'] = 0.08 * Math.cos(beat) * on;
      p['face.smile'] = 1; p['face.squint'] = 0.6 * on; p['face.open'] = 0.15 * on;
      return p;
    },
  },

  // Shoulder bounce + head bop to the beat.
  bounce: {
    duration: 4.0,
    look: 0.3,
    idleBlend: 0,
    pose(t, d) {
      const on = env(t, 0, 0.25, d - 0.35, d);
      const beat = t * TAU * 2.0;
      const b = Math.abs(Math.sin(beat)) * on;
      const alt = Math.sin(beat);
      const p = {};
      crouch(p, (0.08 + 0.1 * b));
      p['shoulderL.py'] = 0.03 * Math.max(0, alt) * on;
      p['shoulderR.py'] = 0.03 * Math.max(0, -alt) * on;
      p['spine.rz'] = 0.06 * alt * on;
      p['body.ry'] = 0.25 * Math.sin(beat / 4) * on;
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        p[`shoulder${s}.rz`] = sx * 0.2 * on;
        p[`shoulder${s}.rx`] = -0.25 * on;
        p[`elbow${s}.rx`] = -1.1 * on;
        p[`elbow${s}.ry`] = sx * 0.3 * on;
        p[`hand${s}.rz`] = sx * 0.3 * Math.sin(beat) * on;
      }
      p['head.rx'] = 0.12 * b - 0.03;
      p['head.rz'] = 0.08 * alt * on;
      p['face.smile'] = 0.9; p['face.squint'] = 0.7 * on; p['face.mouthX'] = 0.2 * alt * on;
      return p;
    },
  },

  // Point at the viewer: "you!"
  point: {
    duration: 2.0,
    look: 0.7,
    pose(t, d) {
      const e = env(t, 0, 0.3, d - 0.4, d);
      const jab = 0.08 * Math.max(0, Math.sin((t - 0.3) * 9)) * env(t, 0.3, 0.4, 1.0, 1.2);
      return {
        'shoulderR.rx': (-1.3 - jab) * e, 'shoulderR.rz': -0.3 * e,
        'elbowR.rx': -0.12 * e, 'handR.ry': -1.5 * e, 'fingersR.rz': 0.15 * e,
        'thumbR.rx': -0.4 * e,
        'spine.ry': -0.12 * e, 'spine.rx': 0.05 * e, 'head.rz': 0.08 * e, 'head.rx': 0.04 * e,
        'shoulderL.rz': 0.12 * e,
        'face.smile': 0.85, 'face.wink': env(t, 0.5, 0.6, 1.2, 1.35), 'face.brow': 0.4 * e,
      };
    },
  },

  // Hands up, sway side to side: hype.
  handsUp: {
    duration: 3.2,
    look: 0.2,
    idleBlend: 0,
    pose(t, d) {
      const on = env(t, 0, 0.35, d - 0.4, d);
      const sway = Math.sin(t * TAU * 1.0);
      const p = {};
      crouch(p, (0.08 + 0.08 * Math.abs(Math.sin(t * TAU * 2))) * on);
      p['hips.px'] = 0.04 * sway * on;
      p['spine.rz'] = -0.12 * sway * on;
      plantFeet(p);
      p['shoulderL.rz'] = (2.5 - 0.2 * sway) * on;
      p['shoulderR.rz'] = -(2.5 + 0.2 * sway) * on;
      p['elbowL.rz'] = 0.2 * on; p['elbowR.rz'] = -0.2 * on;
      p['handL.rz'] = 0.4 * sway * on; p['handR.rz'] = 0.4 * sway * on;
      p['head.rz'] = 0.1 * sway * on; p['head.rx'] = -0.1 * on;
      p['face.smile'] = 1; p['face.open'] = 0.5 * on; p['face.squint'] = 0.7 * on; p['face.brow'] = 0.6 * on;
      return p;
    },
  },

  // Little laugh: shoulders bounce, eyes squeeze.
  giggle: {
    duration: 1.0,
    look: 0.4,
    pose(t, d) {
      const e = env(t, 0, 0.12, d - 0.25, d);
      const b = Math.abs(Math.sin(t * 16)) * e;
      return {
        'shoulderL.py': 0.02 * b, 'shoulderR.py': 0.02 * b,
        'spine.rx': 0.06 * e + 0.03 * b, 'head.rx': 0.08 * e, 'head.rz': 0.06 * Math.sin(t * 8) * e,
        'hips.py': -0.008 * b,
        'face.smile': 1, 'face.squint': 0.9 * e, 'face.open': 0.35 * e + 0.15 * b, 'face.brow': 0.4 * e,
      };
    },
  },
};
