import * as THREE from 'three';
import { createScreenUniforms, createScreenMaterial, createChromeMaterial } from './blurMaterial.js';
import { createSlabGeometry } from './slabGeometry.js';

const MAX_ANGLE = Math.PI;         // fully closed = 180°: the slabs stack, hinge axis on the screen surface

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * One half of the phone. side = -1 (left) or +1 (right).
 * A slim slab with rounded outer corners: the front (+z) face is a screen running the
 * portal effect, the back (-z) is either a second screen or plain body, the rim is chrome. It swings around the hinge axis, which lies on the FRONT
 * surface at the center line, so when closed the two slabs stack instead of intersecting.
 */
function createHalf(portal, side, {
  halfWidth, height, thickness, cornerRadius, edgeChamfer, bezel, backScreen, foldable, maxLevel, blurExp, fadeToBlack, darkSpread, darkExp, darkEndDeg,
  stretchMaxDeg, stretchStartDeg, stretchEndDeg, envMap, glassStrength, glassGloss,
}) {
  // the hinge is at +x for the left half and -x for the right half
  const { geometry, screen } = createSlabGeometry({
    width: halfWidth, height, thickness, cornerRadius, edgeChamfer, hingeSide: -side,
  });

  const shared = createScreenUniforms(portal, { maxLevel, blurExp, fadeToBlack, darkSpread, darkExp, envMap, glassStrength, glassGloss });
  const chrome = createChromeMaterial();
  const materials = [
    createScreenMaterial(shared, { ...screen, bezel }), // group 0: front screen
    chrome,                                             // group 1: the rim
    backScreen                                          // group 2: back, a cover display or plain body
      ? createScreenMaterial(shared, { ...screen, bezel, backAsFront: !foldable })
      : chrome,
  ];

  const pane = new THREE.Mesh(geometry, materials);
  // hinge axis on the front surface: the box hangs below it by half its thickness
  const hinge = new THREE.Group();
  hinge.position.set(0, 0, thickness / 2);
  pane.position.set(side * halfWidth / 2, 0, -thickness / 2);
  hinge.add(pane);

  // world matrix of the pane at a given fold angle (the book group sits at the origin)
  const hingeOffset = new THREE.Matrix4().makeTranslation(0, 0, thickness / 2);
  const paneOffset = new THREE.Matrix4().makeTranslation(side * halfWidth / 2, 0, -thickness / 2);
  const rotation = new THREE.Matrix4();
  const poseAt = (target, angle) => target
    .copy(hingeOffset)
    .multiply(rotation.makeRotationY(-side * angle))
    .multiply(paneOffset);

  // invisible quad at the unfolded position, so that spot can still be grabbed
  const grabZone = new THREE.Mesh(
    new THREE.PlaneGeometry(halfWidth, height),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  grabZone.position.set(side * halfWidth / 2, 0, 0);

  const max = THREE.MathUtils.degToRad(stretchMaxDeg);
  const start = THREE.MathUtils.degToRad(stretchStartDeg);
  const end = THREE.MathUtils.degToRad(stretchEndDeg);
  const darkEnd = THREE.MathUtils.degToRad(darkEndDeg);
  // horizontal stretch: virtual angle rising along a quarter sine between start and end
  const virtualAngleFor = (a) => {
    const progress = THREE.MathUtils.clamp((a - start) / (end - start), 0, 1);
    return max * Math.sin(progress * Math.PI / 2);
  };

  const half = {
    side,
    foldable,
    screen,
    hinge,
    pane,
    grabZone,
    fold: 0,    // eased value actually displayed
    target: 0,  // value the drag / toggle is aiming for
    darkProgress: 0, // front darkness (0..1), applied in the portal image before the blur
    tween: null, // { from, to, elapsed, duration } while an open/close animation runs
    /** Start an eased animation of the fold toward `to` (cancels any running one). */
    animateTo(to, duration) {
      half.target = to;
      half.tween = { from: half.fold, to, elapsed: 0, duration };
    },
    /** Advance the fold by `dt` seconds: run the animation, or follow the drag target. */
    update(dt, followRate) {
      if (half.tween) {
        const tw = half.tween;
        tw.elapsed += dt;
        const t = Math.min(1, tw.elapsed / tw.duration);
        half.setFold(tw.from + (tw.to - tw.from) * easeInOutCubic(t));
        if (t >= 1) half.tween = null;
      } else {
        // frame-rate independent exponential follow of the drag target
        const k = 1 - Math.exp(-followRate * dt);
        half.setFold(half.fold + (half.target - half.fold) * k);
      }
    },
    setFold(value) {
      half.fold = THREE.MathUtils.clamp(value, 0, 1);
      // rotate toward the camera: the right half needs a negative angle, the left a positive one
      const angle = half.fold * MAX_ANGLE;
      hinge.rotation.y = -side * angle;
      // the back runs the same effect measured from fully closed (180°)
      const backAngle = Math.PI - angle;
      shared.uFold.value = half.fold;
      shared.uFoldBack.value = THREE.MathUtils.clamp(backAngle / MAX_ANGLE, 0, 1);
      half.darkProgress = Math.min(1, angle / darkEnd);
      shared.uDarkProgress.value = half.darkProgress;
      shared.uDarkProgressBack.value = Math.min(1, backAngle / darkEnd);
      // front: virtual angle opens from flat; back: virtual angle opens from closed (180°)
      poseAt(shared.uStretchMatrix.value, virtualAngleFor(angle));
      poseAt(shared.uStretchMatrixBack.value, Math.PI - virtualAngleFor(backAngle));
    },
  };
  return half;
}

/**
 * A plane split in two slim slabs that fold like a book. `foldable` says which halves can be
 * grabbed; when both can, their combined angle is limited so they never pass through
 * each other (50% + 50% = a closed book standing on its spine).
 */
export function createBook(portal, {
  width, height, thickness = 0.05, cornerRadius = 0.15, edgeChamfer = 0, bezel = 0.02,
  maxLevel, blurExp = 1, fadeToBlack = 1, darkSpread = 1, darkExp = 1, darkEndDeg = 180,
  stretchMaxDeg = 0, stretchStartDeg = 0, stretchEndDeg = 180,
  foldable = { left: true, right: true }, backScreen = { left: true, right: true },
  envMap = null, glassStrength = 1, glassGloss = 1,
}) {
  const group = new THREE.Group();
  const params = {
    halfWidth: width / 2, height, thickness, cornerRadius, edgeChamfer, bezel, maxLevel, blurExp, fadeToBlack, darkSpread, darkExp, darkEndDeg,
    stretchMaxDeg, stretchStartDeg, stretchEndDeg, envMap, glassStrength, glassGloss,
  };

  const halves = [
    createHalf(portal, -1, { ...params, foldable: foldable.left, backScreen: backScreen.left }),
    createHalf(portal, +1, { ...params, foldable: foldable.right, backScreen: backScreen.right }),
  ];
  for (const half of halves) group.add(half.hinge, half.grabZone);

  // every pane (and the spot where it sits when unfolded) is hittable: a foldable half can
  // be dragged, and a tap anywhere on the phone toggles (see main.js)
  const byObject = new Map(halves.flatMap((h) => [[h.pane, h], [h.grabZone, h]]));

  const hingeZ = thickness / 2; // the hinge axis runs along y at x = 0, z = hingeZ

  // The display area of the open phone: both screens, inside the chamfer and the bezel.
  // Screen extents are in the slab's local coordinates (centered on that half), so the
  // right half's outer edge sits at its center offset (width / 4) plus its local edge x.
  const right = halves[1].screen; // its outer edge is at +x
  const display = {
    halfWidth: width / 4 + right.edgeX - bezel,
    halfHeight: right.halfHeight - bezel,
    radius: Math.max(0, right.cornerRadius - bezel),
  };

  return {
    group,
    halves,
    display,
    grabbable: [...byObject.keys()],
    halfOf: (object) => byObject.get(object),
    /**
     * For a point grabbed on `half` (world coordinates, at any fold), returns the arc it
     * sweeps around the hinge as a function of the fold amount (0..1) -> world position.
     */
    arcFor(half, point) {
      const radius = Math.hypot(point.x, point.z - hingeZ);
      const y = point.y;
      const out = new THREE.Vector3();
      return (fold) => {
        const angle = fold * MAX_ANGLE;
        return out.set(half.side * radius * Math.cos(angle), y, hingeZ + radius * Math.sin(angle));
      };
    },
    /** Maximum fold a half may reach given the other half's current target. */
    maxTargetFor(half) {
      const other = halves.find((h) => h !== half);
      return 1 - other.target;
    },
  };
}
