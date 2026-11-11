import * as THREE from 'three';

/**
 * Unlockable accessories shared by the built-in character and rigged 3D models.
 * Each accessory is placed from a few body "anchors" measured in the avatar's
 * rest pose and then attached to the matching bone/joint, so it follows every
 * move. Works for any proportions (built-in character or e.g. a Mixamo model).
 *
 * anchors = {
 *   neck: Vector3 (base of the neck), neckR: number,
 *   chest: Vector3 (centre of the chest), torsoW: number (half width), torsoD: number (half depth),
 *   wristL: Vector3, forearmDirL: Vector3 (unit, elbow → hand), wristR: number,
 *   hipR: Vector3,
 * }
 * bones = { chest, forearmL } – Object3Ds to attach to
 * restMatrix(bone) → Matrix4: the bone's rest transform in avatar space
 */
export const ACCESSORIES = ['chain', 'watch', 'bag'];

export function buildAccessories(style, anchors, bones, restMatrix) {
  const made = [];
  const M = materials();
  const place = (obj, bone, pos, quat = new THREE.Quaternion()) => {
    const world = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
    const local = restMatrix(bone).clone().invert().multiply(world);
    local.decompose(obj.position, obj.quaternion, obj.scale);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.accessory = true; } });
    bone.add(obj);
    made.push(obj);
  };

  if (style.chain && anchors.neck) {
    const g = new THREE.Group();
    const r = anchors.neckR * 1.9;
    g.add(new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.004, r * 0.05), 8, 48), M.gold));
    // torus lies in its XY plane; tilted so it circles the neck and its front (+y) hangs lower on the chest
    const pendant = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, r * 0.05, 24), M.gold);
    pendant.position.set(0, r * 1.12, 0);
    g.add(pendant);
    const pos = anchors.neck.clone().add(new THREE.Vector3(0, -r * 0.6, (anchors.chainZ ?? anchors.neckR * 0.6)));
    place(g, bones.chest, pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.6, 0, 0)));
  }

  if (style.watch && anchors.wristL) {
    const g = new THREE.Group();
    const r = anchors.wristR;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, r * 0.75, 28, 1, true), M.strap);
    band.material.side = THREE.DoubleSide;
    g.add(band);
    const face = new THREE.Mesh(new THREE.BoxGeometry(r * 0.95, r * 0.95, r * 0.35), M.watchCase);
    face.position.set(0, 0, r * 1.15);
    g.add(face);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.75, r * 0.75), M.screen);
    screen.position.set(0, 0, r * 1.33);
    g.add(screen);
    // orient: cylinder axis (y) along the forearm, face pointing outwards (+x for the left arm → mostly forward)
    const dir = anchors.forearmDirL.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    q.multiply(twist);
    const pos = anchors.wristL.clone().addScaledVector(dir, -r * 1.3);
    place(g, bones.forearmL, pos, q);
  }

  if (style.bag && anchors.chest) {
    const g = new THREE.Group();
    const w = anchors.torsoW; const d = anchors.torsoD;
    // strap: a loop around the torso, running from the left shoulder across the chest to the right hip
    const tilt = new THREE.Group();
    tilt.rotation.z = -0.62;                     // diagonal (left shoulder high, right hip low)
    g.add(tilt);
    const loop = new THREE.Group();
    loop.rotation.y = Math.PI / 2;               // torus plane → contains the vertical diagonal and the depth axis
    tilt.add(loop);
    const rx = d * 1.15; const ry = w * 1.9;
    const pts = [];
    for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(rx * Math.cos(t), ry * Math.sin(t), 0)); }
    const strap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, Math.max(0.008, w * 0.055), 8, true), M.strapRed);
    loop.add(strap);
    // pouch on the right hip, in front
    const pouch = new THREE.Group();
    // sits where the strap ends: in front of the right hip
    if (anchors.hipR) pouch.position.copy(anchors.hipR).sub(anchors.chest).add(new THREE.Vector3(0, w * 0.35, d * 1.05));
    else pouch.position.set(-w * 0.62, -w * 1.55, d * 0.98);
    pouch.rotation.z = -0.3;
    g.add(pouch);
    pouch.add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, w * 0.5, d * 0.4), M.bag));
    const zip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, w * 0.035, d * 0.05), M.zip);
    zip.position.set(0, w * 0.16, d * 0.21);
    pouch.add(zip);
    place(g, bones.chest, anchors.chest.clone(), new THREE.Quaternion());
  }
  return made;
}

let cached;
function materials() {
  if (cached) return cached;
  const std = (color, roughness = 0.5, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  cached = {
    gold: std('#d4af37', 0.22, 1),
    strap: std('#15131a', 0.6),
    watchCase: std('#2a2a33', 0.3, 0.6),
    screen: new THREE.MeshBasicMaterial({ color: '#7cf5d0' }),
    strapRed: std('#e3000f', 0.55),
    bag: std('#15131a', 0.45, 0.05),
    zip: std('#d4af37', 0.3, 1),
  };
  return cached;
}
