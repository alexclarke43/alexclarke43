import * as THREE from 'three';
import { SparkieModel, SPARKIE_SIZE } from './sparkie.js';

/**
 * Adapter that lets Sparkie (sparkie.js) run inside the avatar app with the same
 * interface as PlaceholderAvatar / GltfAvatar, so buttons, games, tap, drag and
 * the host API all work unchanged.
 */
const ACTION_FOR = {
  greet: 'wave',
  celebrate: 'celebrate',
  nod: 'nod',
  shrug: 'think',
  dance: 'dance',
  coin: 'coin',     // Sparkie's signature coin drop – used as the quiz reward
};

export class SparkieAvatar {
  constructor() {
    this.model = new SparkieModel();
    this.object3d = new THREE.Group();
    this.object3d.name = 'SparkieAvatar';
    this.model.group.position.y = -SPARKIE_SIZE.ground; // feet on the floor (y = 0)
    this.object3d.add(this.model.group);

    this.height = SPARKIE_SIZE.height;
    // Camera framing in app coordinates (matches Sparkie's original framing)
    // (a bit taller than Sparkie's original framing, to leave room for the speech bubble)
    this.frame = { w: 4.6, h: 5.4, cy: 0.85 - SPARKIE_SIZE.ground, up: 0.45 };
    this.toneMapping = THREE.NeutralToneMapping; // Sparkie's original look
    this.supportsStyle = false;
    this.supportsHeight = false;
    this.ownConfetti = true; // Sparkie bursts its own confetti on "celebrate"
    this.ownShadow = true;
    this.current = null;
    this._introDone = false;
  }

  get reactions() { return Object.keys(ACTION_FOR); }

  /** Only Sparkie's body, head and mitts count for taps (not the shadow or confetti). */
  get hitObjects() { return this.model.hitObjects; }

  play(name) {
    let action = ACTION_FOR[name];
    if (!action) return 0;
    // First greeting = Sparkie's drop-in intro (spin, land, wave)
    if (name === 'greet' && !this._introDone) action = 'intro';
    this._introDone = true;
    this.model.play(action);
    const seconds = this.model.duration(action);
    this.current = { name, until: this.model.t + seconds };
    return seconds;
  }

  setLookTarget(x, y) {
    if (x === 0 && y === 0) return; // let Sparkie's own idle glances take over
    this.model.pointAt(x, y);
  }

  update(dt) {
    this.model.update(dt);
    if (this.current && this.model.t >= this.current.until) this.current = null;
    // Keep the oval ground shadow world-aligned when the user spins the turntable.
    const yaw = this.object3d.parent?.rotation.y || 0;
    this.model.shadow.rotation.set(-Math.PI / 2, 0, -yaw);
  }

  dispose() {
    this.object3d.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.geometry?.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
      }
    });
  }
}
