/**
 * Drag (mouse / touch / pen) to spin an object around Y, with inertia.
 * Uses Pointer Events, so one code path covers desktop and mobile.
 * `touch-action: pan-y` on the canvas keeps vertical page scrolling working on phones.
 * A short press without movement counts as a tap → onTap(event).
 * Arrow keys rotate when the canvas has focus (accessibility).
 */
export class DragRotate {
  constructor(el, target, { onTap, onDragStart } = {}) {
    this.el = el;
    this.target = target;
    this.onTap = onTap;
    this.onDragStart = onDragStart;
    this.velocity = 0;
    this.pointerId = null;
    this.resetting = false;

    el.style.touchAction = 'pan-y';
    el.tabIndex = 0;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e, true));
    el.addEventListener('pointercancel', (e) => this._up(e, false));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { this.velocity = -4; e.preventDefault(); }
      if (e.key === 'ArrowRight') { this.velocity = 4; e.preventDefault(); }
    });
  }

  _down(e) {
    if (this.pointerId !== null) return; // ignore extra fingers
    this.pointerId = e.pointerId;
    this.startX = this.lastX = e.clientX;
    this.startY = e.clientY;
    this.startTime = this.lastTime = performance.now();
    this.dragging = false;
    this.velocity = 0;
    this.resetting = false;
    this.el.setPointerCapture?.(e.pointerId);
  }

  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    const now = performance.now();
    const dx = e.clientX - this.lastX;
    if (!this.dragging && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 6) {
      this.dragging = true;
      this.el.classList.add('is-dragging');
      this.onDragStart?.();
    }
    if (this.dragging) {
      const rad = dx * 0.012;
      this.target.rotation.y += rad;
      const dt = Math.max(1, now - this.lastTime) / 1000;
      this.velocity = this.velocity * 0.6 + (rad / dt) * 0.4;
    }
    this.lastX = e.clientX;
    this.lastTime = now;
  }

  _up(e, allowTap) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.el.classList.remove('is-dragging');
    if (performance.now() - this.lastTime > 80) this.velocity = 0; // held still before release
    if (allowTap && !this.dragging && performance.now() - this.startTime < 500) this.onTap?.(e);
  }

  /** Smoothly spin back to face the viewer. */
  reset() {
    this.velocity = 0;
    this.resetting = true;
  }

  update(dt) {
    const t = this.target;
    if (this.pointerId !== null) return;
    if (this.resetting) {
      const goal = Math.round(t.rotation.y / (Math.PI * 2)) * Math.PI * 2;
      t.rotation.y += (goal - t.rotation.y) * (1 - Math.exp(-6 * dt));
      if (Math.abs(goal - t.rotation.y) < 0.001) { t.rotation.y = 0; this.resetting = false; }
      return;
    }
    if (Math.abs(this.velocity) > 0.01) {
      t.rotation.y += this.velocity * dt;
      this.velocity *= Math.exp(-3.2 * dt);
    }
  }
}
