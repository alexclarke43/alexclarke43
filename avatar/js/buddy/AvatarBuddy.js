/**
 * AvatarBuddy – drop-in replacement for Sparkie (sparkie.js) that shows our
 * customisable 3D avatar instead of the red mascot.
 *
 * Same public API as Sparkie, so existing platform code keeps working:
 *
 *   import { Sparkie } from './avatar-buddy.js';        // was: from './sparkie.js'
 *   const buddy = new Sparkie(hostElement, { onTap: () => buddy.play('giggle') });
 *   buddy.play('intro');
 *   buddy.play('coin', { queue: true });                 // queue after the current move
 *   buddy.burst();                                       // confetti
 *   buddy.spinEnabled = false;                           // disable drag-to-spin
 *   buddy.mount(otherElement);                           // move to another container
 *
 * Sparkie's moves: intro, wave, celebrate, jump, coin, sad, nod, shake, dance, think, giggle.
 *
 * Extras (optional):
 *   new Sparkie(host, { onTap, look: { hairStyle: 'bun', top: 'tee', topColor: '#7cf5d0', height: 168 } })
 *   buddy.setLook({ ... })  /  buddy.getLook()           // same look keys as the avatar app (look.js)
 *   buddy.dispose()
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PlaceholderAvatar } from '../avatars/PlaceholderAvatar.js';
import { Confetti } from '../effects/Confetti.js';
import { DEFAULT_LOOK, BASE_HEIGHT, sanitizeLook } from '../look.js';

// Sparkie move → avatar move (the app's own names are accepted too)
const MOVES = {
  intro: 'intro', wave: 'greet', celebrate: 'celebrate', jump: 'jump', coin: 'coin', sad: 'sad',
  nod: 'nod', shake: 'shake', dance: 'dance', think: 'think', giggle: 'giggle',
  greet: 'greet', shrug: 'shrug',
};
const CONFETTI_AT = { celebrate: 0.45 }; // seconds into the move
const FRAME = { w: 2.0, h: 2.65, cy: 1.14, up: 0.18 };

export class AvatarBuddy {
  constructor(host, { onTap, look, accent = '#7cf5d0' } = {}) {
    this.onTap = onTap;
    this.spinEnabled = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.queue = [];
    this.yaw = 0;
    this.yawTarget = 0;
    this.lookState = sanitizeLook({ ...DEFAULT_LOOK, ...(look || {}), character: 'human' });

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'sparkie-canvas'; // keep the platform's existing CSS hooks working
    this.canvas.style.touchAction = 'pan-y';

    // scene + lights
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4e8, 0.9));
    const key = new THREE.DirectionalLight(0xfff3ea, 2.3);
    key.position.set(0.9, 4.0, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.4, bottom: -0.4, near: 0.5, far: 8 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(new THREE.Color(accent), 2.0); rim.position.set(-2.2, 2.2, -2.5);
    const rim2 = new THREE.DirectionalLight(0xffd0d6, 1.2); rim2.position.set(2.4, 1.4, -2.0);
    this.scene.add(key, rim, rim2);

    // ground: real shadow + soft contact blob
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55,
    }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.002;
    this.scene.add(this.blob);

    // the avatar
    this.avatar = new PlaceholderAvatar({ accent }, this.lookState);
    this.root = new THREE.Group();
    this.root.add(this.avatar.object3d);
    this.scene.add(this.root);
    this._applyHeight();

    this.confetti = new Confetti(this.scene, ['#e3000f', '#ffffff', accent, '#ffd23f', '#b8a4ff'], this.reduced ? 40 : 140);

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.fit());
    this.mount(host);

    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this.update(now));
  }

  // ---------- Sparkie-compatible API ----------
  get head() { return this.avatar.joints.head; }

  mount(el) {
    if (!el) return;
    this.ro.disconnect();
    el.appendChild(this.canvas);
    this.host = el;
    this.ro.observe(el);
    this.fit();
  }

  play(name, { queue = false } = {}) {
    if (!MOVES[name]) return;
    if (queue && this.avatar.current) { this.queue.push(name); return; }
    this.queue.length = 0;
    this._start(name);
  }

  burst() {
    const top = (this.avatar.height || 2) * this.avatar.object3d.scale.y + 0.1;
    this.confetti.burst(new THREE.Vector3(0, top, 0.1));
  }

  fit() {
    const w = this.host?.clientWidth || 0, h = this.host?.clientHeight || 0;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max(FRAME.h / 2 / t, FRAME.w / 2 / (t * cam.aspect));
    cam.position.set(0, FRAME.cy + FRAME.up, d);
    cam.lookAt(0, FRAME.cy, 0);
    cam.updateProjectionMatrix();
  }

  hitTest(e) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    return ray.intersectObject(this.avatar.object3d, true).length > 0;
  }

  // ---------- extras ----------
  /** Change hair, clothes, colours, height… (keys as in look.js). Returns the full look. */
  setLook(partial = {}) {
    this.lookState = sanitizeLook({ ...this.lookState, ...partial, character: 'human' });
    this.avatar.setStyle(this.lookState);
    this._applyHeight();
    return { ...this.lookState };
  }

  getLook() { return { ...this.lookState }; }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    removeEventListener('pointermove', this._onWindowPointer);
    this.avatar.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---------- internals ----------
  _start(name) {
    this.avatar.play(MOVES[name]);
    this.current = name;
    if (CONFETTI_AT[name] != null) setTimeout(() => this.burst(), CONFETTI_AT[name] * 1000);
  }

  _applyHeight() {
    this.avatar.object3d.scale.setScalar(this.lookState.height / BASE_HEIGHT);
  }

  bindPointer() {
    const c = this.canvas;
    let down = null;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: this.yawTarget, moved: false };
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) down.moved = true;
      if (down.moved && this.spinEnabled) this.yawTarget = down.yaw + dx * 0.012;
    });
    const up = (e) => {
      if (!down) return;
      if (!down.moved && this.hitTest(e)) this.onTap?.();
      down = null;
      this.yawTarget = 0; // spring back to face the user, like Sparkie
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    let idle;
    this._onWindowPointer = (e) => {
      if (!this.host) return;
      const r = this.host.getBoundingClientRect();
      if (!r.width) return;
      const x = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.6);
      const y = -(e.clientY - (r.top + r.height * 0.22)) / (r.height * 0.6);
      const facing = Math.max(0, Math.cos(this.yaw));
      this.avatar.setLookTarget(Math.max(-1, Math.min(1, x)) * facing, Math.max(-1, Math.min(1, y)) * facing);
      clearTimeout(idle);
      idle = setTimeout(() => this.avatar.setLookTarget(0, 0), 2500);
    };
    addEventListener('pointermove', this._onWindowPointer, { passive: true });
  }

  update(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.host || !this.host.clientWidth) return;
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-10 * dt));
    this.root.rotation.y = this.yaw;
    this.avatar.update(dt);
    if (!this.avatar.current) {
      this.current = null;
      if (this.queue.length) this._start(this.queue.shift());
    }
    this.confetti.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

// Drop-in name: `import { Sparkie } from './avatar-buddy.js'`
export { AvatarBuddy as Sparkie };

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(20,10,30,0.55)');
  grad.addColorStop(0.5, 'rgba(20,10,30,0.18)');
  grad.addColorStop(1, 'rgba(20,10,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
