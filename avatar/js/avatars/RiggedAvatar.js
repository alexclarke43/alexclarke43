import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PlaceholderAvatar } from './PlaceholderAvatar.js';
import { BASE_HEIGHT, GOLD } from '../look.js';
import { buildAccessories } from './accessories.js';

/**
 * A rigged character (Mixamo-style skeleton, e.g. "mixamorig:Hips") driven by the
 * same motion library as PlaceholderAvatar: a hidden procedural "driver" avatar
 * computes every pose (idle, reactions, feed moves, look-at) and the rotations
 * are retargeted onto the model's bones each frame. Clips that ship with the
 * model (e.g. "SambaDance") become extra moves ("samba").
 *
 * Clothing colours are recoloured in the shader using colour masks on the
 * texture atlas (see RECOLOR), so the Style panel can change skin tone, top and
 * bottoms colour without separate meshes.
 */

// Same on-screen size as the built-in character (≈1.92 m incl. hair at the default 175 cm setting)
const TARGET_HEIGHT = 1.92 * (BASE_HEIGHT / 175);

// driver joint → model bone (name without the "mixamorig:" prefix)
const MAP = {
  hips: 'Hips', neck: 'Neck', head: 'Head',
  shoulderL: 'LeftArm', elbowL: 'LeftForeArm', handL: 'LeftHand',
  shoulderR: 'RightArm', elbowR: 'RightForeArm', handR: 'RightHand',
  legL: 'LeftUpLeg', kneeL: 'LeftLeg', footL: 'LeftFoot',
  legR: 'RightUpLeg', kneeR: 'RightLeg', footR: 'RightFoot',
};
// Bones aligned to the driver's rest pose (arms down instead of T-pose): [bone, childBone, joint, childJoint]
const ALIGN = [
  ['LeftArm', 'LeftForeArm', 'shoulderL', 'elbowL'], ['LeftForeArm', 'LeftHand', 'elbowL', 'handL'],
  ['RightArm', 'RightForeArm', 'shoulderR', 'elbowR'], ['RightForeArm', 'RightHand', 'elbowR', 'handR'],
  ['LeftUpLeg', 'LeftLeg', 'legL', 'kneeL'], ['LeftLeg', 'LeftFoot', 'kneeL', 'footL'],
  ['RightUpLeg', 'RightLeg', 'legR', 'kneeR'], ['RightLeg', 'RightFoot', 'kneeR', 'footR'],
];
const CLIP_MOVES = { samba: /samba|dance/i };

const cache = new Map(); // url → Promise<gltf>
const shortName = (n) => n.replace(/^.*[:_]?mixamorig[:_]?/i, '').replace(/^mixamorig/i, '');

export class RiggedAvatar {
  static isRigged(gltf) {
    let found = false;
    gltf.scene.traverse((o) => { if (o.isBone && /Hips$/i.test(o.name)) found = true; });
    return found;
  }

  static loadGltf(url) {
    if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url).catch((e) => { cache.delete(url); throw e; }));
    return cache.get(url);
  }

  static async load(url, opts = {}, style = {}) {
    const gltf = await RiggedAvatar.loadGltf(url);
    if (!RiggedAvatar.isRigged(gltf)) throw new Error('Model has no humanoid skeleton');
    return new RiggedAvatar(gltf, opts, style);
  }

  constructor(gltf, opts = {}, style = {}) {
    this.object3d = new THREE.Group();
    this.object3d.name = 'RiggedAvatar';
    this.motion = new THREE.Group(); // body root motion (jumps, spins)
    this.object3d.add(this.motion);
    this.supportsStyle = true;
    this.styleKeys = ['skin', 'hairStyle', 'hairColor', 'hatColor', 'topColor', 'bottomColor', 'shoeColor', 'extras']; // what the Style panel can change on this model
    this.extras = ['watch', 'chain', 'bag']; // shades + headphones are part of the model itself
    this.accessories = [];
    this.style = { ...style };

    // Hidden driver: computes poses, never rendered
    this.driver = new PlaceholderAvatar(opts, { ...style, body: style.body || 'female' });
    this.driver._lookWeight = 1; // _apply() reads it before the first update()
    this.driver._apply({}, 0);
    this.driver.object3d.updateMatrixWorld(true);

    // Model (cloned so several instances can share one download)
    const model = cloneSkinned(gltf.scene);
    this.model = model;
    model.traverse((o) => { if (o.isSkinnedMesh) markFeet(o); });
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        this._setupMaterial(o.material);
      }
    });
    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[shortName(o.name)] = o; });
    this.headBone = this.bones.Head;

    // Normalise size, feet on the floor, centred (measure the skinned vertices, not the raw mesh node)
    const measure = () => {
      model.updateMatrixWorld(true);
      model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
      return new THREE.Box3().setFromObject(model, true);
    };
    let box = measure();
    const size = box.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(TARGET_HEIGHT / (size.y || 1));
    box = measure();
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x; model.position.z -= c.z; model.position.y -= box.min.y;
    this.motion.add(model);
    this.height = TARGET_HEIGHT + 0.05;
    model.traverse((o) => { if (o.isSkinnedMesh) markHair(o); });
    this.object3d.updateMatrixWorld(true);

    this._alignRestPose();
    this._captureRest();

    // Clips shipped with the model
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {};
    for (const [move, re] of Object.entries(CLIP_MOVES)) {
      const clip = gltf.animations.find((a) => re.test(a.name) && !/t.?pose/i.test(a.name));
      if (clip) this.clips[move] = this.mixer.clipAction(clip);
    }
    this.clipMove = null;
    this.clipWeight = 0;

    // Coin prop (from the driver) lives in our space, positioned at the model's hand
    this.coin = this.driver.parts.coin;
    this.coin.removeFromParent();
    this.coin.visible = false;
    this.object3d.add(this.coin);
    this.parts = { coin: this.coin };

    // Simple invisible hit volume for taps (cheaper than raycasting a skinned mesh)
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, TARGET_HEIGHT, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = TARGET_HEIGHT / 2;
    this.motion.add(hit);
    this.hitObjects = [hit];

    this.headAnchor = new THREE.Object3D();
    this.headAnchor.position.set(0, this.height, 0);
    this.object3d.add(this.headAnchor);

    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
    this.setStyle(style);
    this._retarget(0);
  }

  get reactions() { return [...this.driver.reactions, ...Object.keys(this.clips)]; }
  get current() { return this.clipMove ? { name: this.clipMove.name } : this.driver.current; }

  play(name) {
    const action = this.clips[name];
    if (action) {
      this.driver.current = null;
      action.reset().setLoop(THREE.LoopOnce, 1).play();
      action.clampWhenFinished = true;
      this.clipMove = { name, action, t: 0, duration: Math.min(action.getClip().duration, 8) };
      return this.clipMove.duration;
    }
    this._endClip();
    return this.driver.play(name);
  }

  setLookTarget(x, y) { this.driver.setLookTarget(x, y); }

  update(dt) {
    this.driver.update(dt);
    this._retarget(dt);
  }

  setStyle(style) {
    this.style = { ...this.style, ...style };
    const u = this.uniforms;
    if (!u) return;
    for (const [key, uni] of [['skin', 'uSkin'], ['topColor', 'uTop'], ['bottomColor', 'uBottom'], ['shoeColor', 'uShoe'], ['hairColor', 'uHair']]) {
      const col = this.style[key];
      const ref = RECOLOR.ref[key];
      const on = !!col && col.toLowerCase() !== ref;
      u[`${uni}On`].value = on ? 1 : 0;
      if (on) u[uni].value.set(col); // THREE.Color.set() converts sRGB hex → linear
    }
    u.uShoeGold.value = (this.style.shoeColor || '').toLowerCase() === GOLD ? 1 : 0;
    this._buildAccessories();
    this._buildHair();
  }

  /**
   * Hairstyles: 'knots' = the model's own hair (recoloured in the shader). Any other style
   * hides the model's hair and borrows the built-in character's hair meshes, scaled onto the head bone.
   */
  _buildHair() {
    if (!this.restM) return;
    const S = this.style;
    const own = !S.hairStyle || S.hairStyle === 'knots';
    this.uniforms.uHairHide.value = own ? 0 : 1;
    const key = own ? 'own' : `${S.hairStyle}|${S.hairColor}|${S.hatColor}`;
    if (key === this._hairKey) return;
    this._hairKey = key;
    if (this.hairRoot) {
      this.hairRoot.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      this.hairRoot.removeFromParent();
      this.hairRoot = null;
    }
    if (own) return;
    // rebuild the hidden driver with this hairstyle and copy its hair meshes
    this.driver.setStyle({ hairStyle: S.hairStyle, hairColor: S.hairColor, hatColor: S.hatColor, headphones: false, glasses: false, shades: false });
    const dHead = this.driver.joints.head;
    this.driver.object3d.updateMatrixWorld(true);
    const inv = dHead.matrixWorld.clone().invert();
    const root = new THREE.Group();
    dHead.traverse((o) => {
      if (!o.isMesh || !o.userData.hair) return;
      const m = new THREE.Mesh(o.geometry.clone(), o.material.clone());
      m.castShadow = true;
      inv.clone().multiply(o.matrixWorld).decompose(m.position, m.quaternion, m.scale);
      root.add(m);
    });
    // place: driver head joint ↔ model Head bone, scaled to the model's head
    const head = this.bones.Head;
    const rest = this.restM.get(head);
    const headPos = new THREE.Vector3().setFromMatrixPosition(rest);
    const topBone = this.bones.HeadTop_End;
    const modelH = topBone ? new THREE.Vector3().setFromMatrixPosition(this.restM.get(topBone)).y - headPos.y : 0.25;
    const k = (modelH / 0.293) * 0.86 * HAIR_FIT.scale;          // driver skull ≈ 0.293 m above its head joint (head scale 0.86)
    const place = new THREE.Matrix4().compose(
      headPos.clone().add(new THREE.Vector3(0, modelH * HAIR_FIT.dy, modelH * HAIR_FIT.dz)),
      new THREE.Quaternion(), new THREE.Vector3(k * HAIR_FIT.sx, k, k * HAIR_FIT.sz));
    rest.clone().invert().multiply(place).decompose(root.position, root.quaternion, root.scale);
    head.add(root);
    this.hairRoot = root;
  }

  _buildAccessories() {
    if (!this.restM) return;
    for (const a of this.accessories) a.removeFromParent();
    const B = (n) => this.bones[n];
    const rest = (b) => this.restM.get(b);
    const pos = (n) => new THREE.Vector3().setFromMatrixPosition(rest(B(n)));
    const shoulderW = pos('LeftArm').distanceTo(pos('RightArm'));
    const anchors = {
      neck: pos('Neck'), neckR: shoulderW * 0.2, chainZ: shoulderW * 0.3,
      chest: pos('Spine2').lerp(pos('Neck'), 0.25), torsoW: shoulderW * 0.45, torsoD: shoulderW * 0.4,
      hipR: pos('RightUpLeg'),
      wristL: pos('LeftHand'), forearmDirL: pos('LeftHand').sub(pos('LeftForeArm')).normalize(), wristR: shoulderW * 0.085,
    };
    this.accessories = buildAccessories(this.style, anchors, { chest: B('Spine2'), forearmL: B('LeftForeArm') }, rest);
  }

  dispose() {
    this.model.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    this.mixer.stopAllAction();
    this.driver.dispose();
  }

  // ---------------------------------------------------------------- internals

  _bone(name) { return this.bones[name]; }

  /** Rotate T-pose limbs so the model's rest pose matches the driver's (arms down). */
  _alignRestPose() {
    const D = this.driver.joints;
    const toModel = new THREE.Matrix4().copy(this.object3d.matrixWorld).invert();
    const pos = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel);
    const qWorld = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    for (const [b, cb, j, cj] of ALIGN) {
      const bone = this._bone(b); const child = this._bone(cb);
      if (!bone || !child) continue;
      this.object3d.updateMatrixWorld(true);
      const cur = pos(child).sub(pos(bone)).normalize();
      const tgt = D[cj].getWorldPosition(new THREE.Vector3()).sub(D[j].getWorldPosition(new THREE.Vector3())).normalize();
      const rot = new THREE.Quaternion().setFromUnitVectors(cur, tgt);
      const world = rot.multiply(qWorld(bone));
      const parentQ = qWorld(bone.parent);
      bone.quaternion.copy(parentQ.invert().multiply(world));
    }
    this.object3d.updateMatrixWorld(true);
  }

  /** Remember rest rotations (driver + model) so per-frame deltas can be applied. */
  _captureRest() {
    const D = this.driver.joints;
    this.driverBodyQ0 = D.body.getWorldQuaternion(new THREE.Quaternion());
    this.R0 = {};
    for (const j of Object.keys(D)) this.R0[j] = this._driverQ(j, new THREE.Quaternion());
    this.hipsDriver0 = this._driverPos('hips', new THREE.Vector3());
    // model bones: rest world (model-space) quaternions and the Hips position
    this.restM = new Map(); // bone rest transforms in avatar space (for accessories)
    {
      const invM = this.object3d.matrixWorld.clone().invert();
      this.model.traverse((o) => { if (o.isBone) this.restM.set(o, invM.clone().multiply(o.matrixWorld)); });
    }
    this.W0 = new Map();
    this.model.traverse((o) => { if (o.isBone) o.userData.restQ = o.quaternion.clone(); });
    const inv = this.object3d.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.model.traverse((o) => {
      if (o.isBone) this.W0.set(o, inv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion())));
    });
    const hips = this._bone('Hips');
    this.hipsRest = hips.position.clone();
    this.hipsParentQ0 = inv.clone().multiply(hips.parent.getWorldQuaternion(new THREE.Quaternion()));
    this.hipsParentScale = hips.parent.getWorldScale(new THREE.Vector3()).x / this.object3d.getWorldScale(new THREE.Vector3()).x;
    this.legRatio = this._modelLegLength() / 0.92; // driver leg ≈ 2 × 0.46 m
    this.footRest = { L: this._footY('Left'), R: this._footY('Right') };
  }

  _modelLegLength() {
    const a = this._bone('LeftUpLeg').getWorldPosition(new THREE.Vector3());
    const b = this._bone('LeftFoot').getWorldPosition(new THREE.Vector3());
    return a.distanceTo(b) / this.object3d.getWorldScale(new THREE.Vector3()).x;
  }

  _footY(side) {
    const f = this._bone(`${side}Foot`);
    if (!f) return 0;
    return this.object3d.worldToLocal(f.getWorldPosition(this._v ?? new THREE.Vector3())).y;
  }

  /** Driver joint rotation relative to the driver's body joint. */
  _driverQ(j, out) {
    const D = this.driver.joints;
    const bodyInv = D.body.getWorldQuaternion(new THREE.Quaternion()).invert();
    return out.copy(bodyInv).multiply(D[j].getWorldQuaternion(new THREE.Quaternion()));
  }
  _driverPos(j, out) {
    const D = this.driver.joints;
    D[j].getWorldPosition(out);
    return D.body.worldToLocal(out);
  }

  _retarget(dt) {
    const drv = this.driver;
    drv.object3d.updateMatrixWorld(true);
    const D = drv.joints;
    const delta = {};
    for (const j of Object.keys(MAP).concat(['spine', 'fingersL', 'fingersR', 'thumbL', 'thumbR'])) {
      if (!D[j]) continue;
      const P = this._driverQ(j, new THREE.Quaternion());
      delta[j] = P.multiply(this.R0[j].clone().invert());
    }
    const dHips = delta.hips;
    const dSpine = delta.spine || dHips;
    const forBone = (name) => {
      if (name === 'Hips') return dHips;
      if (name === 'Spine') return dHips.clone().slerp(dSpine, 1 / 3);
      if (name === 'Spine1') return dHips.clone().slerp(dSpine, 2 / 3);
      if (name === 'Spine2' || /Shoulder$/.test(name)) return dSpine;
      if (name === 'Neck') return delta.neck;
      if (/^Head/.test(name)) return delta.head;
      const side = name.startsWith('Left') ? 'L' : name.startsWith('Right') ? 'R' : '';
      if (/HandThumb/.test(name)) return delta[`thumb${side}`] || delta[`hand${side}`];
      if (/Hand(Index|Middle|Ring|Pinky)/.test(name)) return delta[`fingers${side}`] || delta[`hand${side}`];
      if (/Hand$/.test(name)) return delta[`hand${side}`];
      if (/ForeArm$/.test(name)) return delta[`elbow${side}`];
      if (/Arm$/.test(name)) return delta[`shoulder${side}`];
      if (/UpLeg$/.test(name)) return delta[`leg${side}`];
      if (/Leg$/.test(name)) return delta[`knee${side}`];
      if (/(Foot|Toe)/.test(name)) return delta[`foot${side}`];
      return null;
    };

    // Body root motion (jump / spin) on the wrapper
    const bodyP = D.body.position; const bodyR = D.body.rotation;
    this.motion.position.set(bodyP.x * this.legRatio, bodyP.y * this.legRatio, bodyP.z * this.legRatio);
    this.motion.rotation.set(bodyR.x, bodyR.y, bodyR.z);

    // Rotations, top-down (model space)
    const hips = this._bone('Hips');
    const walk = (bone, parentW) => {
      const d = forBone(shortName(bone.name));
      const w0 = this.W0.get(bone);
      const w = d ? d.clone().multiply(w0) : parentW.clone().multiply(this._restLocal(bone));
      bone.quaternion.copy(parentW.clone().invert().multiply(w));
      for (const ch of bone.children) if (ch.isBone) walk(ch, w);
    };
    walk(hips, this.hipsParentQ0);

    // Hips translation (crouch / sway), scaled to the model's legs
    const hp = this._driverPos('hips', this._v2).sub(this.hipsDriver0).multiplyScalar(this.legRatio);
    hp.applyQuaternion(this.hipsParentQ0.clone().invert()).divideScalar(this.hipsParentScale);
    hips.position.copy(this.hipsRest).add(hp);

    // Keep the lowest foot on the floor (leg proportions differ from the driver)
    this.object3d.updateMatrixWorld(true);
    const motionY = this.motion.position.y;
    const drop = Math.min(this._footY('Left') - this.footRest.L, this._footY('Right') - this.footRest.R) - motionY;
    if (Math.abs(drop) > 1e-4) {
      const fix = new THREE.Vector3(0, -drop, 0).applyQuaternion(this.hipsParentQ0.clone().invert()).divideScalar(this.hipsParentScale);
      hips.position.add(fix);
    }

    this._blendClip(dt);
    this._applyCoin(drv.final['prop.coin'] || 0);
  }

  _restLocal(bone) {
    if (!bone.userData.restQ) bone.userData.restQ = bone.quaternion.clone();
    return bone.userData.restQ;
  }

  /** Model clips (samba): fade in over the retargeted pose, then back out. */
  _blendClip(dt) {
    const c = this.clipMove;
    if (!c) return;
    c.t += dt;
    const fadeIn = Math.min(1, c.t / 0.35);
    const fadeOut = Math.min(1, Math.max(0, (c.duration - c.t) / 0.4));
    const w = fadeIn * fadeOut;
    // remember the retargeted pose, let the mixer write the clip pose, then mix
    const saved = [];
    this.model.traverse((o) => { if (o.isBone) saved.push([o, o.quaternion.clone(), o.position.clone()]); });
    this.mixer.update(dt);
    for (const [b, q, p] of saved) {
      b.quaternion.copy(q.slerp(b.quaternion, w));
      b.position.copy(p.lerp(b.position, w));
    }
    if (c.t >= c.duration) this._endClip();
  }

  _endClip() {
    if (!this.clipMove) return;
    this.clipMove.action.stop();
    this.clipMove = null;
  }

  _applyCoin(c) {
    const coin = this.coin;
    coin.visible = c > 0.01 && c < 0.995;
    if (!coin.visible) return;
    this.object3d.updateMatrixWorld(true);
    const hand = this._bone('RightHand');
    const palm = this.object3d.worldToLocal(hand.getWorldPosition(this._v));
    palm.y += 0.02;
    const fall = Math.min(1, c / 0.52);
    coin.position.set(palm.x, palm.y + 1.5 * (1 - fall * fall), palm.z + 0.03);
    coin.rotation.set(Math.PI / 2 * (1 - fall) + 0.2, c * 30 * (1 - fall) + 0.3, 0);
    const pop = Math.min(1, c / 0.06);
    const pocket = 1 - Math.max(0, (c - 0.86) / 0.14);
    coin.scale.setScalar(Math.max(0.001, pop * pocket));
  }

  _setupMaterial(m) {
    m.metalness = 0.05;        // the export marks the whole body half-metallic, which reads as plastic
    m.roughness = 1;
    m.envMapIntensity = 0.8;
    const uniforms = {
      uSkin: { value: new THREE.Color() }, uSkinOn: { value: 0 }, uSkinRef: { value: new THREE.Color(RECOLOR.ref.skin) },
      uTop: { value: new THREE.Color() }, uTopOn: { value: 0 }, uTopRef: { value: new THREE.Color(RECOLOR.ref.topColor) },
      uBottom: { value: new THREE.Color() }, uBottomOn: { value: 0 }, uBottomRef: { value: new THREE.Color(RECOLOR.ref.bottomColor) },
      uShoe: { value: new THREE.Color() }, uShoeOn: { value: 0 }, uShoeGold: { value: 0 },
      uHair: { value: new THREE.Color() }, uHairOn: { value: 0 }, uHairRef: { value: new THREE.Color(RECOLOR.ref.hairColor) }, uHairHide: { value: 0 },
    };
    this.uniforms = uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFoot;\nvarying float vFoot;\nattribute float aHair;\nvarying float vHair;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoot = aFoot;\nvHair = aHair;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uSkin, uSkinRef, uTop, uTopRef, uBottom, uBottomRef;
          uniform float uSkinOn, uTopOn, uBottomOn;
          uniform vec3 uShoe; uniform float uShoeOn, uShoeGold;
          varying float vFoot;
          varying float vHair;
          uniform vec3 uHair, uHairRef; uniform float uHairOn, uHairHide;
          vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
            float d = q.x - min(q.w, q.y);
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
          }
          float lumi(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 lin = diffuseColor.rgb;
            vec3 hsv = rgb2hsv(pow(max(lin, 0.0), vec3(1.0 / 2.2))); // detect in sRGB like the texture artist sees it
            float hue = hsv.x * 360.0;
            // joggers: saturated yellow
            float isBottom = step(36.0, hue) * step(hue, 64.0) * step(0.35, hsv.y) * step(0.35, hsv.z);
            // crop top: neutral grey inside the top's area of the atlas
            float inTop = step(0.45, vMapUv.x) * step(vMapUv.x, 0.95) * step(0.36, vMapUv.y) * step(vMapUv.y, 0.64);
            float isTop = inTop * step(hsv.y, 0.22) * step(0.12, hsv.z) * step(hsv.z, 0.62);
            // skin: warm brown, not too bright (headphones) or desaturated (hair)
            float isSkin = step(6.0, hue) * step(hue, 40.0) * step(0.3, hsv.y) * step(hsv.y, 0.9) * step(0.08, hsv.z) * step(hsv.z, 0.62) * (1.0 - isTop);
            if (uBottomOn > 0.5 && isBottom > 0.5) diffuseColor.rgb = uBottom * clamp(lumi(lin) / lumi(uBottomRef), 0.0, 1.6);
            if (uTopOn > 0.5 && isTop > 0.5) diffuseColor.rgb = uTop * clamp(lumi(lin) / lumi(uTopRef), 0.0, 2.2);
            if (uSkinOn > 0.5 && isSkin > 0.5) diffuseColor.rgb = lin * (uSkin / max(uSkinRef, vec3(0.002)));
            // hair: dark, low-saturation texels on the upper head (not skin)
            float isHair = step(0.5, vHair) * step(hsv.z, 0.42) * step(hsv.y, 0.55) * (1.0 - isSkin);
            if (uHairHide > 0.5 && (vHair > 1.5 || step(0.5, vHair) * (1.0 - isSkin) > 0.5)) discard;
            if (uHairOn > 0.5 && isHair > 0.5) diffuseColor.rgb = uHair * clamp(lumi(lin) / max(lumi(uHairRef), 0.004), 0.15, 3.0);
            // sneakers: the light parts of anything skinned to the feet
            float isShoe = step(0.5, vFoot) * step(hsv.y, 0.3) * step(0.5, hsv.z) * (1.0 - isBottom);
            if (uShoeOn > 0.5 && isShoe > 0.5) diffuseColor.rgb = uShoe * clamp(lumi(lin) / 0.62, 0.0, 1.4);
          }`);
    };
    // gold sneakers get a metallic shine (roughness/metalness tweaked only where the shoe mask applies)
    m.onBeforeCompile = ((orig) => (shader) => {
      orig(shader);
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        {
          vec3 h = rgb2hsv(pow(max(texture2D(map, vMapUv).rgb, 0.0), vec3(1.0 / 2.2)));
          float shoeMask = step(0.5, vFoot) * step(h.y, 0.3) * step(0.5, h.z);
          metalnessFactor = mix(metalnessFactor, 1.0, shoeMask * uShoeGold);
        }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          vec3 h2 = rgb2hsv(pow(max(texture2D(map, vMapUv).rgb, 0.0), vec3(1.0 / 2.2)));
          roughnessFactor = mix(roughnessFactor, 0.25, step(0.5, vFoot) * step(h2.y, 0.3) * step(0.5, h2.z) * uShoeGold);
        }`);
    })(m.onBeforeCompile);
    m.customProgramCacheKey = () => 'rigged-recolor-v2';
    m.needsUpdate = true;
  }
}

/** Fit of borrowed hairstyles on the model's head (tuned for buddy.glb). */
const HAIR_FIT = { scale: 1.07, sx: 1.0, sz: 1.0, dy: -0.05, dz: 0.0 };

/** Reference colours of the uploaded model's texture (= the default look, so no recolour by default). */
export const RECOLOR = {
  ref: { skin: '#613d26', topColor: '#746764', bottomColor: '#fbda53', shoeColor: '#f7f6f2', hairColor: '#25221e' },
};

/** Per-vertex weight of the foot/toe bones → shader attribute `aFoot` (finds the sneakers). */
function markFeet(mesh) {
  const g = mesh.geometry;
  if (g.getAttribute('aFoot')) return;
  const idx = g.getAttribute('skinIndex'); const wt = g.getAttribute('skinWeight');
  const feet = new Set(mesh.skeleton.bones.map((b, i) => (/(Foot|Toe)/i.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const out = new Float32Array(idx.count);
  for (let v = 0; v < idx.count; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (feet.has(idx.getComponent(v, k))) w += wt.getComponent(v, k);
    out[v] = w;
  }
  g.setAttribute('aFoot', new THREE.BufferAttribute(out, 1));
}

/**
 * Per-vertex hair mask → attribute `aHair`: vertices driven by the head bones that sit
 * above the eyes in the bind pose (the hair knots). The shader adds a colour test.
 */
function markHair(mesh) {
  const g = mesh.geometry;
  if (g.getAttribute('aHair')) return;
  const idx = g.getAttribute('skinIndex'); const wt = g.getAttribute('skinWeight');
  const head = new Set(mesh.skeleton.bones.map((b, i) => (/Head/i.test(b.name) ? i : -1)).filter((i) => i >= 0));
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const v = new THREE.Vector3();
  const headBone = mesh.skeleton.bones.find((b) => /Head$/i.test(b.name));
  const top = mesh.skeleton.bones.find((b) => /HeadTop/i.test(b.name));
  const yHead = headBone.getWorldPosition(new THREE.Vector3()).y;
  const yTop = top ? top.getWorldPosition(new THREE.Vector3()).y : yHead + 0.2;
  const yEyes = yHead + (yTop - yHead) * 0.42; // just above the eyes / shades
  const hp = headBone.getWorldPosition(new THREE.Vector3());
  const hx = hp.x; const hz = hp.z;
  const sideR = (yTop - yHead) * 0.62;
  const yMid = yHead + (yTop - yHead) * 0.42;
  const skullR = (yTop - yHead) * 0.6;
  const out = new Float32Array(idx.count);
  for (let i = 0; i < idx.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (head.has(idx.getComponent(i, k))) w += wt.getComponent(i, k);
    if (w < 0.5) continue;
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    // above the eyes, or far out to the side of the head (the side knots)
    const side = Math.hypot(v.x - hx, v.z - hz);
    // clearly outside the skull (but not the chin/face below the eyes) → hair geometry
    const outer = (v.y > yEyes - (yTop - yHead) * 0.08 || side > sideR) && Math.hypot(v.x - hx, v.y - yMid, v.z - hz) > skullR;
    out[i] = outer ? 2 : v.y > yEyes || side > sideR ? 1 : 0;
  }
  g.setAttribute('aHair', new THREE.BufferAttribute(out, 1));
}
