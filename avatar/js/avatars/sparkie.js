// Sparkie — the 3D savings buddy, built procedurally in Three.js.
// Body: pillowy rounded block with two wrapped white bands + oval eyes.
// Head: floating ball. Small floating mitts were added so Sparkie can wave & cheer.
//
// Exports:
//   SparkieModel – scene graph + animations only (add model.group to any scene, call update(dt)).
//   Sparkie      – standalone version with its own renderer; same API as the original file.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- proportions (taken from the reference artwork) ----------
const BODY = { w: 2.5, h: 2.05, d: 1.3, r: 0.5 };
const HW = BODY.w / 2, HH = BODY.h / 2, HD = BODY.d / 2, R = BODY.r;
const HEAD_R = 0.45, HEAD_GAP = 0.07;
const BULGE = 0.1;
const BASE_YAW = -0.18;
const REST_L = [-1.62, -0.32, 0.18];
const REST_R = [1.62, -0.32, 0.18];

const RED = 0xff0d0d;
const WHITE = 0xf7f3f5;

// ---------- math helpers ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const bell = (x) => Math.sin(Math.PI * clamp01(x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rand = (a, b) => a + Math.random() * (b - a);

function bulge(x, y) {
  const fx = Math.max(0, 1 - (x / (HW + 0.05)) ** 2);
  const fy = Math.max(0, 1 - (y / (HH + 0.05)) ** 2);
  return 1 + BULGE * fx * fy;
}
const surfaceZ = (x, y) => HD * bulge(x, y);

// A white band that lies on the front face and wraps around the rounded side edge.
function makeStripe(x0, x1, y, rad = 0.125) {
  // Densely subdivided flattened capsule so it can follow the curved, wrapped surface.
  const N = 140, M = 28, L = x1 - x0, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    // cluster samples toward the rounded ends
    const s = i / N, u = 0.5 - 0.5 * Math.cos(Math.PI * s);
    const d = Math.min(u * L, (1 - u) * L);
    const r = d < rad ? Math.sqrt(Math.max(0, rad * rad - (rad - d) ** 2)) : rad;
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI * 2;
      pos.push(x0 + u * L, y + r * Math.cos(th), r * Math.sin(th) * 0.5);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const p = g.attributes.position;
  const cx = HW - R, cz = HD - R, quarter = (R * Math.PI) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yy = p.getY(i), zl = p.getZ(i) + 0.03;
    const ax = Math.abs(x), s = Math.sign(x) || 1;
    let nx, nz;
    if (ax <= cx) { nx = x; nz = HD + zl; }
    else {
      const arc = ax - cx;
      if (arc <= quarter) {
        const th = arc / R, rr = R + zl;
        nx = s * (cx + rr * Math.sin(th)); nz = cz + rr * Math.cos(th);
      } else { nx = s * (HW + zl); nz = cz - (arc - quarter); }
    }
    nz *= bulge(nx, yy);
    p.setXYZ(i, nx, yy, nz);
  }
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

function coinTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(100, 90, 20, 128, 128, 128);
  g.addColorStop(0, '#FFE58A'); g.addColorStop(0.6, '#FFC21A'); g.addColorStop(1, '#E09A00');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(160,100,0,.55)'; x.lineWidth = 10;
  x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(150,90,0,.85)'; x.font = '900 150px Nunito, Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('€', 128, 138);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(90,0,0,0.55)'); g.addColorStop(1, 'rgba(90,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- animation library ----------
function jumpCurve(p, P, amp) {
  const air = seg(p, 0.22, 0.72);
  if (p < 0.22) {
    const s = Math.sin(seg(p, 0, 0.22) * Math.PI / 2);
    P.sy *= 1 - 0.17 * s; P.sx *= 1 + 0.1 * s; P.sz *= 1 + 0.1 * s;
  } else if (p < 0.72) {
    P.y += amp * Math.sin(air * Math.PI);
    const st = air < 0.35 ? 1 - air / 0.35 : 0;
    P.sy *= 1 + 0.12 * st; P.sx *= 1 - 0.07 * st; P.sz *= 1 - 0.07 * st;
  } else {
    const l = seg(p, 0.72, 1), d = (1 - l) * (1 - l) * Math.cos(l * 10) * 0.18;
    P.sy *= 1 - d; P.sx *= 1 + d * 0.65; P.sz *= 1 + d * 0.65;
  }
  return air;
}

const ACTIONS = {
  intro: { dur: 3.0, run(p, P) {
    // drop in from above while spinning, land with a squash, then wave hello
    const f = seg(p, 0, 0.42);
    P.scale = 0.35 + 0.65 * smooth(f);
    P.y += 3.2 * (1 - f) * (1 - f);
    P.ry += (1 - inOut(f)) * Math.PI * 4;
    P.headY += 0.35 * (1 - f);
    if (p >= 0.42 && p < 0.6) {
      const l = seg(p, 0.42, 0.6), d = (1 - l) * (1 - l) * Math.cos(l * 9) * 0.22;
      P.sy *= 1 - d; P.sx *= 1 + d * 0.7; P.sz *= 1 + d * 0.7;
    }
    if (p >= 0.58) ACTIONS.wave.run(seg(p, 0.58, 1), P);
    else if (f < 1) P.eyes = 'happy';
  } },
  jump: { dur: 1.0, run(p, P) {
    const air = jumpCurve(p, P, 0.65);
    if (air > 0 && air < 1) { P.lh = [-1.45, 0.25, 0.25]; P.rh = [1.45, 0.25, 0.25]; P.eyes = 'happy'; }
  } },
  celebrate: { dur: 1.8, confetti: true, run(p, P) {
    const air = jumpCurve(p, P, 0.85);
    P.ry += Math.PI * 2 * inOut(air);
    P.eyes = 'happy'; P.blush = 1;
    const w = Math.sin(p * 28), up = smooth(seg(p, 0, 0.15)) * (1 - smooth(seg(p, 0.85, 1)));
    P.lh = lerp3(P.lh, [-1.35, 0.85 + 0.12 * w, 0.3], up);
    P.rh = lerp3(P.rh, [1.35, 0.85 - 0.12 * w, 0.3], up);
  } },
  wave: { dur: 1.8, run(p, P) {
    const r = smooth(seg(p, 0, 0.15)) * (1 - smooth(seg(p, 0.85, 1)));
    P.rh = lerp3(P.rh, [1.5, 0.95, 0.45], r);
    P.rh[0] += Math.sin(p * Math.PI * 9) * 0.2 * r;
    P.rh[1] += Math.cos(p * Math.PI * 9) * 0.06 * r;
    P.rz -= 0.07 * r; P.ry += 0.12 * r;
    if (r > 0.3) P.eyes = 'happy';
    P.blush = 0.7 * r;
  } },
  coin: { dur: 1.9, coin: true, run(p, P) {
    const lid = bell(seg(p, 0.05, 0.68));
    P.headY += 0.7 * lid; P.headX += 0.6 * lid;
    P.lookY = 0.9 * bell(seg(p, 0.03, 0.55));
    const reach = bell(seg(p, 0.05, 0.55));
    P.lh = lerp3(P.lh, [-1.05, 0.75, 0.55], reach * 0.8);
    P.rh = lerp3(P.rh, [1.05, 0.75, 0.55], reach * 0.8);
    const g = bell(seg(p, 0.5, 0.68));
    P.sy *= 1 - 0.14 * g; P.sx *= 1 + 0.09 * g; P.sz *= 1 + 0.09 * g;
    P.y += 0.3 * bell(seg(p, 0.7, 1));
    if (p > 0.52) { P.eyes = 'happy'; P.blush = bell(seg(p, 0.52, 1)); }
  } },
  sad: { dur: 2.2, run(p, P) {
    const e = Math.min(1, p * 5, (1 - p) * 4);
    P.sy *= 1 - 0.07 * e; P.sx *= 1 + 0.04 * e; P.sz *= 1 + 0.04 * e;
    P.headY -= 0.16 * e; P.rx += 0.08 * e;
    P.rz += Math.sin(p * Math.PI * 2) * 0.04 * e;
    P.eyes = 'sad'; P.lookY = -0.7 * e;
    P.lh = lerp3(P.lh, [-1.5, -0.7, 0.1], e); P.rh = lerp3(P.rh, [1.5, -0.7, 0.1], e);
  } },
  nod: { dur: 0.9, run(p, P) {
    const e = 1 - p;
    P.rx += Math.sin(p * Math.PI * 4) * 0.16 * e;
    P.headY += Math.sin(p * Math.PI * 4) * 0.08 * e;
    P.eyes = 'happy'; P.blush = 0.5 * e;
  } },
  shake: { dur: 0.9, run(p, P) {
    const e = 1 - p;
    P.ry += Math.sin(p * Math.PI * 5) * 0.35 * e;
    P.headX += Math.sin(p * Math.PI * 5 - 0.6) * 0.12 * e;
  } },
  dance: { dur: 2.4, run(p, P) {
    const e = Math.min(1, p * 8, (1 - p) * 8), b = Math.sin(p * Math.PI * 6);
    P.y += Math.abs(b) * 0.22 * e;
    P.rz += b * 0.14 * e; P.ry += Math.sin(p * Math.PI * 3) * 0.3 * e;
    P.lh = lerp3(P.lh, [-1.45, -0.2 + Math.max(0, b) * 1.0, 0.3], e);
    P.rh = lerp3(P.rh, [1.45, -0.2 + Math.max(0, -b) * 1.0, 0.3], e);
    P.headX += b * 0.12 * e;
    P.eyes = 'happy'; P.blush = 0.8 * e;
  } },
  think: { dur: 2.2, run(p, P) {
    const e = Math.min(1, p * 5, (1 - p) * 5);
    P.headX += Math.sin(p * Math.PI * 2) * 0.28 * e; P.headY += 0.14 * e;
    P.lookX = 0.5 * e; P.lookY = 0.75 * e;
    P.rh = lerp3(P.rh, [0.8, -0.55, 0.95], e); P.rz += 0.05 * e;
  } },
  giggle: { dur: 0.8, run(p, P) {
    const e = 1 - p, w = Math.sin(p * Math.PI * 8);
    P.sx *= 1 + w * 0.06 * e; P.sz *= 1 + w * 0.06 * e; P.sy *= 1 - w * 0.06 * e;
    P.eyes = 'happy'; P.blush = e;
  } },
};

const POSE_NUM = ['scale', 'y', 'sx', 'sy', 'sz', 'rx', 'ry', 'rz', 'headX', 'headY', 'blush', 'lookX', 'lookY'];

/** Overall size, handy for hosts that embed the model in their own scene. */
export const SPARKIE_SIZE = {
  ground: -HH,                                  // y of the feet in model space
  height: HH + HEAD_GAP + 2 * HEAD_R + HH,      // feet → top of head
  width: 2 * (REST_R[0] + 0.2),                 // mitt to mitt
};

/**
 * Sparkie's scene graph + animation, with no renderer, camera or DOM.
 * Add `model.group` to any Three.js scene and call `model.update(dt)` each frame.
 * (Split out so Sparkie can also live inside the avatar app's stage.)
 */
export class SparkieModel {
  constructor({ reduced = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
    this.reduced = reduced;
    this.t = 0;
    this.action = null; this.queue = [];
    this.prevPose = null; this.blendT = 0;
    this.yaw = 0; this.yawTarget = 0;
    this.look = { x: 0, y: 0, tx: 0, ty: 0, lastPointer: -10, nextSaccade: 0 };
    this.blink = { next: 2, t: -1 };
    this.headPos = { x: 0, y: HH + HEAD_GAP + HEAD_R, vy: 0 };
    this.hands = { l: [...REST_L], r: [...REST_R] };
    this.group = new THREE.Group();
    this.group.name = 'Sparkie';
    this.build();
  }

  // ---------- model ----------
  build() {
    const redMat = new THREE.MeshPhysicalMaterial({
      color: RED, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45,
      sheen: 0.6, sheenColor: new THREE.Color(0xff7070), sheenRoughness: 0.6,
    });
    const whiteMat = new THREE.MeshPhysicalMaterial({ color: WHITE, roughness: 0.35, clearcoat: 0.3 });
    const blackMat = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.15, clearcoat: 1 });

    this.root = new THREE.Group(); this.group.add(this.root);
    this.bodyPivot = new THREE.Group(); this.bodyPivot.position.y = -HH; this.root.add(this.bodyPivot);
    this.body = new THREE.Group(); this.body.position.y = HH; this.bodyPivot.add(this.body);

    // pillowy body
    let g = new RoundedBoxGeometry(BODY.w, BODY.h, BODY.d, 8, R);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * bulge(pa.getX(i), pa.getY(i)));
    g.computeVertexNormals();
    this.bodyMesh = new THREE.Mesh(g, redMat);
    this.body.add(this.bodyMesh);

    // bands: top runs off the right edge, bottom off the left edge
    this.body.add(new THREE.Mesh(makeStripe(-0.68, 1.62, 0.43), whiteMat));
    this.body.add(new THREE.Mesh(makeStripe(-1.62, 0.72, -0.4), whiteMat));

    // eyes
    this.eyes = [];
    this.happyEyes = [];
    const eyeGeo = new THREE.SphereGeometry(1, 32, 24);
    const hiGeo = new THREE.SphereGeometry(1, 12, 8);
    const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const arcGeo = new THREE.TorusGeometry(0.1, 0.034, 10, 24, Math.PI);
    for (const sx of [-1, 1]) {
      const x = sx * 0.37, y = 0.03, z = surfaceZ(x, y) - 0.015;
      const eye = new THREE.Group(); eye.position.set(x, y, z);
      const ball = new THREE.Mesh(eyeGeo, blackMat); ball.scale.set(0.115, 0.17, 0.06);
      const hi = new THREE.Mesh(hiGeo, hiMat); hi.scale.setScalar(0.028); hi.position.set(0.035, 0.075, 0.05);
      eye.add(ball, hi); eye.userData = { base: new THREE.Vector3(x, y, z), side: sx };
      this.body.add(eye); this.eyes.push(eye);
      const arc = new THREE.Mesh(arcGeo, blackMat); arc.position.set(x, y - 0.03, z + 0.035); arc.visible = false;
      this.body.add(arc); this.happyEyes.push(arc);
    }

    // blush
    this.blushMat = new THREE.MeshBasicMaterial({ color: 0xffb3c4, transparent: true, opacity: 0, depthWrite: false });
    const blushGeo = new THREE.CircleGeometry(0.12, 24);
    for (const sx of [-1, 1]) {
      const x = sx * 0.66, y = -0.12;
      const m = new THREE.Mesh(blushGeo, this.blushMat); m.scale.set(1.2, 0.75, 1);
      m.position.set(x, y, surfaceZ(x, y) + 0.02); this.body.add(m);
    }

    // head ball
    this.head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 56, 40), redMat);
    this.root.add(this.head);

    // floating mitts
    const handGeo = new THREE.SphereGeometry(0.2, 32, 24);
    this.handL = new THREE.Mesh(handGeo, redMat); this.handL.scale.set(1, 0.9, 0.8);
    this.handR = new THREE.Mesh(handGeo, redMat); this.handR.scale.set(1, 0.9, 0.8);
    this.root.add(this.handL, this.handR);

    // ground shadow
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.4),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = -HH - 0.01;
    this.group.add(this.shadow);

    // coin
    const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 48); coinGeo.rotateX(Math.PI / 2);
    const face = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: 0.6, roughness: 0.3 });
    const side = new THREE.MeshStandardMaterial({ color: 0xe0a400, metalness: 0.9, roughness: 0.3 });
    this.coin = new THREE.Mesh(coinGeo, [side, face, face]); this.coin.visible = false;
    this.group.add(this.coin);

    // confetti
    const N = this.reduced ? 40 : 140;
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.09, 0.15),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N
    );
    this.confetti.frustumCulled = false;
    const palette = [0xff0d0d, 0xffffff, 0xffc21a, 0xff7a9a, 0x14a05a];
    const col = new THREE.Color();
    this.parts = [];
    for (let i = 0; i < N; i++) {
      this.confetti.setColorAt(i, col.set(palette[i % palette.length]));
      this.parts.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
    }
    this.dummy = new THREE.Object3D();
    this.group.add(this.confetti);
    this.hideConfetti();
  }

  // ---------- public API ----------
  play(name, { queue = false } = {}) {
    const def = ACTIONS[name]; if (!def) return;
    if (queue && this.action) { this.queue.push(name); return; }
    if (this.action) { this.prevPose = this.lastPose; this.blendT = 0.18; }
    this.queue.length = 0;
    this.start(name);
  }

  /** Length of an action in seconds (0 if unknown). */
  duration(name) { return ACTIONS[name]?.dur ?? 0; }

  get actionNames() { return Object.keys(ACTIONS); }

  /** Make Sparkie look towards a point; x/y in -1..1 (right / up positive). */
  pointAt(x, y) {
    this.look.tx = Math.max(-1, Math.min(1, x));
    this.look.ty = Math.max(-1, Math.min(1, y));
    this.look.lastPointer = this.t;
  }

  /** Meshes to raycast against for taps. */
  get hitObjects() { return [this.bodyMesh, this.head, this.handL, this.handR]; }

  start(name) {
    const def = ACTIONS[name];
    this.action = { name, def, t: 0 };
    if (def.confetti) this.burst();
  }

  burst() {
    for (const q of this.parts) {
      q.p.set(rand(-0.4, 0.4), 1.4, rand(-0.3, 0.3));
      q.v.set(rand(-3.2, 3.2), rand(4, 7.5), rand(-1.2, 2.2));
      q.r.set(rand(0, 6), rand(0, 6), rand(0, 6));
      q.w.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      q.life = rand(1.6, 2.6);
    }
  }

  hideConfetti() {
    this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
    for (let i = 0; i < this.parts.length; i++) this.confetti.setMatrixAt(i, this.dummy.matrix);
    this.confetti.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    const t = this.t, amp = this.reduced ? 0.3 : 1;

    // idle pose
    const P = {
      scale: 1, y: 0, sx: 1 - Math.sin(t * 2.2) * 0.01 * amp, sy: 1 + Math.sin(t * 2.2) * 0.016 * amp, sz: 1,
      rx: 0, ry: 0, rz: Math.sin(t * 0.9) * 0.015 * amp,
      headX: 0, headY: Math.sin(t * 2.2 - 0.7) * 0.03 * amp, blush: 0, lookX: 0, lookY: 0,
      lh: [REST_L[0], REST_L[1] + Math.sin(t * 2 + 1) * 0.06 * amp, REST_L[2]],
      rh: [REST_R[0], REST_R[1] + Math.sin(t * 2 + 2.4) * 0.06 * amp, REST_R[2]],
      eyes: 'open',
    };
    let coinP = -1;
    if (this.action) {
      const a = this.action; a.t += dt;
      const p = a.t / a.def.dur;
      if (p >= 1) {
        this.action = null;
        if (this.queue.length) { this.prevPose = { ...P, lh: [...P.lh], rh: [...P.rh] }; this.start(this.queue.shift()); }
      } else {
        a.def.run(p, P);
        if (a.def.coin) coinP = p;
      }
    }

    // blend after interruption
    if (this.blendT > 0 && this.prevPose) {
      const k = 1 - this.blendT / 0.18;
      for (const f of POSE_NUM) P[f] = lerp(this.prevPose[f], P[f], k);
      P.lh = lerp3(this.prevPose.lh, P.lh, k); P.rh = lerp3(this.prevPose.rh, P.rh, k);
      this.blendT -= dt;
    }
    this.lastPose = { ...P, lh: [...P.lh], rh: [...P.rh] };

    // body
    this.yaw = lerp(this.yaw, this.yawTarget, 1 - Math.exp(-10 * dt));
    this.root.position.y = P.y;
    this.root.scale.setScalar(P.scale);
    this.root.rotation.set(P.rx, BASE_YAW + this.yaw + P.ry, P.rz);
    this.bodyPivot.scale.set(P.sx, P.sy, P.sz);

    // head with spring follow-through
    const headTarget = HH * (2 * P.sy - 1) + HEAD_GAP + HEAD_R + P.headY;
    const hp = this.headPos;
    hp.vy += ((headTarget - hp.y) * 170 - hp.vy * 13) * dt;
    hp.y += hp.vy * dt;
    hp.x = lerp(hp.x, P.headX, 1 - Math.exp(-9 * dt));
    this.head.position.set(hp.x, hp.y, 0);
    const st = Math.max(-0.12, Math.min(0.12, hp.vy * 0.025));
    this.head.scale.set(1 - st * 0.5, 1 + st, 1 - st * 0.5);

    // hands
    const kh = 1 - Math.exp(-11 * dt);
    this.hands.l = lerp3(this.hands.l, P.lh, kh); this.hands.r = lerp3(this.hands.r, P.rh, kh);
    this.handL.position.set(...this.hands.l); this.handR.position.set(...this.hands.r);

    // eyes: look + blink + mood
    const L = this.look;
    if (t - L.lastPointer > 3 && t > L.nextSaccade) {
      L.tx = rand(-0.6, 0.6); L.ty = rand(-0.3, 0.4); L.nextSaccade = t + rand(1.5, 3.5);
    }
    const lx = P.lookX || L.tx, ly = P.lookY || L.ty;
    L.x = lerp(L.x, lx, 1 - Math.exp(-8 * dt)); L.y = lerp(L.y, ly, 1 - Math.exp(-8 * dt));
    if (t > this.blink.next) { this.blink.t = 0; this.blink.next = t + rand(2, 5); }
    let lid = 1;
    if (this.blink.t >= 0) { this.blink.t += dt; lid = 1 - bell(this.blink.t / 0.16) * 0.92; if (this.blink.t > 0.16) this.blink.t = -1; }
    const happy = P.eyes === 'happy', sad = P.eyes === 'sad';
    this.eyes.forEach((eye, i) => {
      const b = eye.userData.base;
      eye.visible = !happy; this.happyEyes[i].visible = happy;
      eye.position.set(b.x + L.x * 0.07, b.y + L.y * 0.06, b.z);
      eye.scale.set(1, lid * (sad ? 0.62 : 1), 1);
      eye.rotation.z = sad ? -eye.userData.side * 0.35 : 0;
    });
    this.blushMat.opacity = lerp(this.blushMat.opacity, P.blush * 0.75, 1 - Math.exp(-8 * dt));

    // coin drop
    if (coinP >= 0 && coinP > 0.15 && coinP < 0.52) {
      const f = seg(coinP, 0.18, 0.5);
      this.coin.visible = true;
      this.coin.position.set(0, lerp(4.3, 0.55, f * f) + this.root.position.y, 0.05);
      this.coin.rotation.y = coinP * 22;
      this.coin.scale.setScalar(smooth(seg(coinP, 0.15, 0.22)));
    } else this.coin.visible = false;

    // shadow
    const s = 1 / (1 + this.root.position.y * 0.7);
    this.shadow.scale.set(s * P.sx, s, 1);
    this.shadow.material.opacity = 0.9 * s;

    // confetti
    let alive = false;
    const D = this.dummy;
    this.parts.forEach((q, i) => {
      if (q.life > 0) {
        alive = true; q.life -= dt;
        q.v.y -= 9 * dt; q.v.multiplyScalar(0.985);
        q.p.addScaledVector(q.v, dt);
        q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
        D.position.copy(q.p); D.rotation.copy(q.r); D.scale.setScalar(q.life > 0 ? Math.min(1, q.life * 2) : 0);
      } else D.scale.setScalar(0);
      D.updateMatrix(); this.confetti.setMatrixAt(i, D.matrix);
    });
    if (alive || this._confettiAlive) this.confetti.instanceMatrix.needsUpdate = true;
    this._confettiAlive = alive;
  }
}

/**
 * Standalone Sparkie with its own renderer, camera, lights and pointer handling.
 * Same API as before the split: new Sparkie(host, { onTap }), .mount(el), .play(name, { queue }),
 * .burst(), .spinEnabled
 */
export class Sparkie {
  constructor(host, { onTap } = {}) {
    this.onTap = onTap;
    this.spinEnabled = true;
    this.model = new SparkieModel();
    this.reduced = this.model.reduced;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'sparkie-canvas';

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.frameW = 4.5; this.frameH = 4.7; this.centerY = 0.5;

    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-3, 5, 6);
    const rim = new THREE.DirectionalLight(0xffe2e2, 0.9); rim.position.set(4, 2, -4);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xffc9c9, 0.5));
    this.scene.add(this.model.group);

    this.bindPointer();

    this.ro = new ResizeObserver(() => this.fit());
    this.mount(host);

    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this.update(now));
  }

  // pass-throughs so existing callers keep working
  get root() { return this.model.root; }
  get head() { return this.model.head; }
  play(name, opts) { this.model.play(name, opts); }
  burst() { this.model.burst(); }

  mount(el) {
    if (!el) return;
    this.ro.disconnect();
    el.appendChild(this.canvas);
    this.host = el;
    this.ro.observe(el);
    this.fit();
  }

  fit() {
    const w = this.host?.clientWidth || 0, h = this.host?.clientHeight || 0;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const cam = this.camera; cam.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max(this.frameH / 2 / t, this.frameW / 2 / (t * cam.aspect));
    cam.position.set(0, this.centerY + 0.45, d);
    cam.lookAt(0, this.centerY, 0);
    cam.updateProjectionMatrix();
  }

  bindPointer() {
    const c = this.canvas;
    let down = null;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: this.model.yawTarget, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) down.moved = true;
      if (down.moved && this.spinEnabled) this.model.yawTarget = down.yaw + dx * 0.012;
    });
    const up = (e) => {
      if (!down) return;
      if (!down.moved && this.hitTest(e)) this.onTap?.();
      down = null; this.model.yawTarget = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    addEventListener('pointermove', (e) => {
      if (!this.host) return;
      const r = this.host.getBoundingClientRect();
      if (!r.width) return;
      this.model.pointAt(
        (e.clientX - (r.left + r.width / 2)) / (r.width * 0.8),
        -(e.clientY - (r.top + r.height * 0.45)) / (r.height * 1.2),
      );
    }, { passive: true });
  }

  hitTest(e) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(v, this.camera);
    return ray.intersectObjects(this.model.hitObjects, false).length > 0;
  }

  update(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.host || !this.host.clientWidth) return;
    this.model.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
