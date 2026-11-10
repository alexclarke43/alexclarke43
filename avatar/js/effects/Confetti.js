import * as THREE from 'three';

/** Lightweight confetti burst using a single InstancedMesh. */
export class Confetti {
  constructor(scene, colors, count = 140) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.035, 0.06);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);

    const palette = colors.map((c) => new THREE.Color(c));
    this.p = Array.from({ length: count }, (_, i) => {
      this.mesh.setColorAt(i, palette[i % palette.length]);
      return {
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0,
      };
    });
    this.dummy = new THREE.Object3D();
    this.active = 0;
  }

  burst(origin = new THREE.Vector3(0, 1.9, 0)) {
    for (const p of this.p) {
      p.pos.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 1.4;
      p.vel.set(Math.cos(a) * r, 2.2 + Math.random() * 2.4, Math.sin(a) * r * 0.6);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      p.life = 2.4 + Math.random() * 1.2;
    }
    this.active = 3.6;
    this.mesh.visible = true;
  }

  update(dt) {
    if (this.active <= 0) return;
    this.active -= dt;
    const d = this.dummy;
    this.p.forEach((p, i) => {
      p.life -= dt;
      p.vel.y -= 5.5 * dt;
      p.vel.multiplyScalar(Math.exp(-1.6 * dt)); // air drag → fluttery fall
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
      d.position.copy(p.pos);
      d.rotation.copy(p.rot);
      d.scale.setScalar(p.life > 0 && p.pos.y > 0 ? Math.min(1, p.life * 2) : 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.active <= 0) this.mesh.visible = false;
  }
}
