import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads any rigged or static GLB/GLTF character and exposes the same interface as
 * PlaceholderAvatar. Animation clips are matched to reactions by name (see CLIP_PATTERNS)
 * or by an explicit map passed as `clips` (e.g. {"greet": "Wave_01"}).
 * Reactions without a matching clip fall back to simple procedural body motion,
 * so even a static model can greet, jump and dance.
 */
const CLIP_PATTERNS = {
  idle: /idle|breath|stand/i,
  greet: /wave|greet|hello|\bhi\b/i,
  celebrate: /celebrat|cheer|victory|win|jump|hooray/i,
  nod: /nod|yes|agree|thumb/i,
  shrug: /shrug|think|\bno\b|confus|unsure/i,
  dance: /dance|groove/i,
};
const MIN_DURATION = { dance: 3.5 };
const FALLBACK_DURATION = { greet: 2, celebrate: 2.2, nod: 1.6, shrug: 1.8, dance: 4 };
const TARGET_HEIGHT = 1.85;

export class GltfAvatar {
  static async load(url, opts = {}) {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new GltfAvatar(gltf, opts);
  }

  constructor(gltf, opts) {
    this.object3d = new THREE.Group();
    this.object3d.name = 'GltfAvatar';
    this.motion = new THREE.Group(); // procedural root motion (fallbacks)
    this.object3d.add(this.motion);

    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });

    // Normalise size + put feet on the floor, centred.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = TARGET_HEIGHT / (size.y || 1);
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    this.motion.add(model);
    this.height = TARGET_HEIGHT;

    this.headAnchor = new THREE.Object3D();
    this.headAnchor.position.set(0, TARGET_HEIGHT + 0.05, 0);
    this.object3d.add(this.headAnchor);

    // Head bone for pointer look-at
    // Head bone for pointer look-at: prefer a real skeleton bone, else any node named "head".
    const isHead = (o) => /head/i.test(o.name) && !/end|top|tip/i.test(o.name);
    model.traverse((o) => { if (!this.headBone && o.isBone && isHead(o)) this.headBone = o; });
    if (!this.headBone) model.traverse((o) => { if (!this.headBone && isHead(o)) this.headBone = o; });

    // Animation clips
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    const byName = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    for (const reaction of Object.keys(CLIP_PATTERNS)) {
      const wanted = opts.clips?.[reaction];
      const clip = (wanted && byName[wanted]) || gltf.animations.find((c) => CLIP_PATTERNS[reaction].test(c.name));
      if (clip) this.actions[reaction] = this.mixer.clipAction(clip);
    }
    this.clipNames = gltf.animations.map((c) => c.name);

    if (this.actions.idle) this.actions.idle.play();
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.currentAction) this._backToIdle();
    });

    this.look = new THREE.Vector2();
    this.lookTarget = new THREE.Vector2();
    this.time = 0;
    this.fallback = null;
  }

  get reactions() { return ['greet', 'celebrate', 'nod', 'shrug', 'dance']; }

  play(name) {
    if (!this.reactions.includes(name)) return 0;
    const action = this.actions[name];
    if (action) {
      const clip = action.getClip();
      const reps = Math.max(1, Math.round((MIN_DURATION[name] || 0) / clip.duration));
      action.reset();
      action.setLoop(reps > 1 ? THREE.LoopRepeat : THREE.LoopOnce, reps);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.play();
      const prev = this.currentAction || this.actions.idle;
      if (prev && prev !== action) action.crossFadeFrom(prev, 0.25, false);
      this.currentAction = action;
      this.fallback = null;
      return clip.duration * reps;
    }
    // no clip → procedural root motion
    this.fallback = { name, t: 0, duration: FALLBACK_DURATION[name] };
    return this.fallback.duration;
  }

  _backToIdle() {
    const idle = this.actions.idle;
    const cur = this.currentAction;
    this.currentAction = null;
    if (idle && cur) {
      idle.reset().play();
      idle.crossFadeFrom(cur, 0.35, false);
    } else if (cur) {
      cur.fadeOut(0.35);
    }
  }

  setLookTarget(x, y) { this.lookTarget.set(x, y); }

  update(dt) {
    this.time += dt;
    // Undo last frame's look-at offset, then let the mixer pose the skeleton.
    if (this.headBone) this.headBone.quaternion.copy(this._headBase ?? this.headBone.quaternion);
    this.mixer.update(dt);
    if (this.headBone) (this._headBase ??= new THREE.Quaternion()).copy(this.headBone.quaternion);
    const m = this.motion;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);

    // Gentle breathing if the model has no idle clip
    if (!this.actions.idle && !this.currentAction) {
      const b = Math.sin(this.time * 1.7);
      m.scale.set(1 + 0.006 * b, 1 + 0.01 * b, 1 + 0.006 * b);
      m.rotation.z = 0.015 * Math.sin(this.time * 0.42);
    }

    if (this.fallback) {
      const f = this.fallback;
      f.t += dt;
      const p = Math.min(1, f.t / f.duration);
      const s = Math.sin(p * Math.PI);
      switch (f.name) {
        case 'greet': m.position.y = 0.06 * Math.abs(Math.sin(p * Math.PI * 2)); m.rotation.z = 0.08 * Math.sin(p * Math.PI * 4) * s; break;
        case 'celebrate': m.position.y = 0.45 * Math.max(0, Math.sin(Math.min(1, p / 0.6) * Math.PI)); m.rotation.y = Math.min(1, p / 0.6) * Math.PI * 2; break;
        case 'nod': m.rotation.x = 0.12 * Math.max(0, Math.sin(p * Math.PI * 4)) * s; break;
        case 'shrug': m.rotation.z = 0.1 * Math.sin(p * Math.PI * 3) * s; m.position.y = 0.03 * s; break;
        case 'dance': m.position.y = 0.05 * Math.abs(Math.sin(p * Math.PI * 16)) * s; m.rotation.y = 0.35 * Math.sin(p * Math.PI * 4) * s; m.rotation.z = 0.06 * Math.sin(p * Math.PI * 8) * s; break;
      }
      if (f.t >= f.duration) this.fallback = null;
    }

    // Pointer look-at on the head bone (applied after the mixer)
    const k = 1 - Math.exp(-6 * dt);
    this.look.lerp(this.lookTarget, k);
    if (this.headBone) {
      const w = this.currentAction ? 0.3 : 1;
      this.headBone.rotateY(this.look.x * 0.5 * w);
      this.headBone.rotateX(-this.look.y * 0.25 * w);
    }
  }
}
