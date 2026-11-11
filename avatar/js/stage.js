import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Renderer, camera, lights and the render loop.
 * `turntable` is the group the user rotates; the avatar is added to it.
 */
export function createStage(container, cfg) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'avatar-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);

  // Lights: warm key, cool fill, coloured rim for a modern "studio" look.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4e8, 0.9));
  const key = new THREE.DirectionalLight(0xfff3ea, 2.3);
  key.position.set(0.9, 4.0, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -0.4;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 8;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(cfg.accent), 2.0);
  rim.position.set(-2.2, 2.2, -2.5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffd0d6, 1.2);
  rim2.position.set(2.4, 1.4, -2.0);
  scene.add(rim2);

  // Ground: soft contact blob + real shadow on a transparent plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.ShadowMaterial({ opacity: 0.16 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({
    map: radialTexture(), transparent: true, depthWrite: false, opacity: 0.55,
  }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  scene.add(blob);

  const turntable = new THREE.Group();
  turntable.name = 'turntable';
  scene.add(turntable);

  // Framing: keep a box of frame.w × frame.h metres visible at any aspect ratio.
  // Avatars can supply their own (e.g. Sparkie is wider than a person).
  const DEFAULT_FRAME = { w: 2.0, h: 2.65, cy: 1.14, up: 0.18 };
  let frame = { ...DEFAULT_FRAME };
  const TARGET = new THREE.Vector3();
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(frame.h / 2 / t, frame.w / 2 / (t * camera.aspect));
    TARGET.set(0, frame.cy, 0);
    camera.position.set(0, TARGET.y + frame.up, dist);
    camera.lookAt(TARGET);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const frameCallbacks = [];
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 10); // clamp big gaps (tab switches)
    last = now;
    for (const cb of frameCallbacks) cb(dt, now / 1000);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(loop);
  // Save battery: stop rendering while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) renderer.setAnimationLoop(null);
    else { last = performance.now(); renderer.setAnimationLoop(loop); }
  });

  const tmp = new THREE.Vector3();
  return {
    renderer, scene, camera, turntable,
    canvas: renderer.domElement,
    onFrame(cb) { frameCallbacks.push(cb); },
    /** Re-frame the camera for a different avatar: { w, h, cy, up } (omit for the default). */
    setFrame(f) {
      frame = { ...DEFAULT_FRAME, ...(f || {}) };
      resize();
    },
    /** Tone mapping per avatar (Sparkie was designed with Neutral; people look best with ACES). */
    setToneMapping(mode = THREE.ACESFilmicToneMapping) { renderer.toneMapping = mode; },
    /** Our soft contact shadow (hidden for avatars that bring their own). */
    setContactShadow(visible) { blob.visible = visible; },
    /** World position → CSS pixels relative to the container. */
    project(v) {
      tmp.copy(v).project(camera);
      return { x: (tmp.x * 0.5 + 0.5) * container.clientWidth, y: (-tmp.y * 0.5 + 0.5) * container.clientHeight };
    },
  };
}

function radialTexture() {
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
