import * as THREE from 'three';

/**
 * Fold-by-dragging that follows the physical object.
 *
 * On pointer down we find the grabbed point on the pane. That point sweeps an arc around
 * the hinge as the pane folds; we project that arc through the current camera once (the
 * camera does not move during a fold drag) and, on every move, pick the fold angle whose
 * projected point is closest to the pointer. So the pane stays under the finger whatever
 * the window size, zoom or viewing angle.
 *
 * A short press without movement anywhere on the phone is a tap and toggles instead.
 * Pointer-downs that miss the phone are ignored so OrbitControls can handle them.
 */
const SAMPLES = 360;
const TAP_MAX_DISTANCE = 8;   // px: a press that moves less than this...
const TAP_MAX_DURATION = 350; // ms: ...and is released within this, is a tap (toggle)

export function createDragControls(domElement, {
  camera, objects, resolve, arcFor, onStart, onFold, onTap, onEnd,
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let grabbed = null;   // the half being folded
  let samples = null;   // [{ fold, x, y }] projected arc, in normalized device coordinates
  let press = null;     // { x, y, time } of the pointer-down, to tell a tap from a drag
  let tapOnly = null;   // a non-foldable half that was pressed: can toggle on tap, not drag

  function toNdc(e) {
    const rect = domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    return pointer;
  }

  function pick(e) {
    raycaster.setFromCamera(toNdc(e), camera);
    for (const hit of raycaster.intersectObjects(objects, false)) {
      const half = resolve(hit.object);
      if (half) return { half, point: hit.point };
    }
    return null;
  }

  domElement.addEventListener('pointerdown', (e) => {
    const hit = pick(e);
    if (!hit) return;
    press = { x: e.clientX, y: e.clientY, time: performance.now(), moved: false };
    if (!hit.half.foldable) {
      // not draggable: only remember the press so a tap can toggle; a drag here orbits
      tapOnly = hit.half;
      return;
    }
    grabbed = hit.half;
    const arc = arcFor(grabbed, hit.point); // fold (0..1) -> world position of the grabbed point
    const p = new THREE.Vector3();
    samples = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const fold = i / SAMPLES;
      p.copy(arc(fold)).project(camera);
      samples.push({ fold, x: p.x, y: p.y });
    }
    domElement.setPointerCapture(e.pointerId);
    domElement.classList.add('dragging');
    onStart?.(grabbed);
  });

  domElement.addEventListener('pointermove', (e) => {
    if (!grabbed) return;
    // ignore the jitter of a finger press until it clearly becomes a drag
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_MAX_DISTANCE) return;
    press.moved = true;
    const ndc = toNdc(e);
    let best = samples[0];
    let bestDistance = Infinity;
    for (const s of samples) {
      const d = (s.x - ndc.x) ** 2 + (s.y - ndc.y) ** 2;
      if (d < bestDistance) { bestDistance = d; best = s; }
    }
    onFold?.(grabbed, best.fold);
  });

  const stop = (e, cancelled) => {
    if (!grabbed && !tapOnly) return;
    const half = grabbed ?? tapOnly;
    const wasDrag = !!grabbed;
    const moved = press.moved || Math.hypot(e.clientX - press.x, e.clientY - press.y) >= TAP_MAX_DISTANCE;
    const isTap = !cancelled && !moved && performance.now() - press.time < TAP_MAX_DURATION;
    grabbed = null;
    tapOnly = null;
    samples = null;
    press = null;
    if (wasDrag) {
      domElement.releasePointerCapture?.(e.pointerId);
      domElement.classList.remove('dragging');
      onEnd?.(half, !isTap);
    }
    if (isTap) onTap?.(half);
  };
  domElement.addEventListener('pointerup', (e) => stop(e, false));
  domElement.addEventListener('pointercancel', (e) => stop(e, true));
}
