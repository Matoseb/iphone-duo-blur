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
  halfWidth, height, thickness, cornerRadius, edgeChamfer, bezel, backScreen, foldable,
  maxLevel, frostDistance, blurExp, blurExpand, frostColor, frostPerUnit, frostExp, frostStrength,
  lightLossPerUnit, lightLossExp, lightBlackPoint, glassOnDark, blackoutStartDeg, blackoutEndDeg,
  blackoutBackStartDeg, blackoutBackEndDeg,
  stretchMaxDeg, stretchStartDeg, stretchEndDeg, stretchTrack, perspective, squeeze, squeezeExp,
  envMap, glass, matte, glassThickness, glassIor,
}) {
  // the hinge is at +x for the left half and -x for the right half
  const { geometry, screen } = createSlabGeometry({
    width: halfWidth, height, thickness, cornerRadius, edgeChamfer, hingeSide: -side,
  });

  const shared = createScreenUniforms(portal, {
    maxLevel, frostDistance, blurExp, blurExpand, frostColor, frostPerUnit, frostExp, frostStrength,
    lightLossPerUnit, lightLossExp, lightBlackPoint, glassOnDark, envMap, glassThickness, glassIor, perspective,
    squeeze, squeezeExp,
  });
  // Frosted windows: the plane each face rests on when flat against the image.
  // Front: the hinge axis plane (z = thickness / 2). Back of a folding half: the top of the
  // closed stack (one thickness higher). Back of a static half: its own back surface.
  const hingeZ = thickness / 2;
  const backWindowZ = foldable ? hingeZ + thickness : hingeZ - thickness;
  const chrome = createChromeMaterial();
  // the inner screens are matte, the cover display on the back is glossy glass
  const materials = [
    createScreenMaterial(shared, { ...screen, bezel, windowZ: hingeZ, ...matte }), // group 0: front screen
    chrome,                                                                        // group 1: the rim
    backScreen                                                                     // group 2: back, a cover display or plain body
      ? createScreenMaterial(shared, { ...screen, bezel, windowZ: backWindowZ, backAsFront: !foldable, ...glass })
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

  // flat poses for the perspective-free lookup: front open, back closed
  poseAt(shared.uFlatMatrix.value, 0);
  poseAt(shared.uFlatMatrixBack.value, Math.PI);

  const max = THREE.MathUtils.degToRad(stretchMaxDeg);
  const start = THREE.MathUtils.degToRad(stretchStartDeg);
  const end = THREE.MathUtils.degToRad(stretchEndDeg);
  const blackoutStart = THREE.MathUtils.degToRad(blackoutStartDeg);
  const blackoutEnd = THREE.MathUtils.degToRad(blackoutEndDeg);
  const blackoutBackStart = THREE.MathUtils.degToRad(blackoutBackStartDeg);
  const blackoutBackEnd = THREE.MathUtils.degToRad(blackoutBackEndDeg);
  // the display switches off between the two blackout angles, fully black past the end
  const blackoutAt = (a) => THREE.MathUtils.smoothstep(a, blackoutStart, blackoutEnd);
  // same for the cover display, with its own angles measured from fully closed
  const blackoutBackAt = (a) => THREE.MathUtils.smoothstep(a, blackoutBackStart, blackoutBackEnd);
  // Horizontal lookup angle. Track mode: the real fold angle, capped just below 90° where
  // the projection would collapse. This is the physical "frosted sheet over the window"
  // look: from the fixed viewpoint the picture stays in place and the pane's content is
  // compressed by the cosine of the angle (a counter stretch). Otherwise: a virtual angle
  // rising along a quarter sine between start and end (the stylized stretch).
  const virtualAngleFor = stretchTrack
    ? (a) => Math.min(a, max)
    : (a) => {
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
    /** The uniform driving this half's front blackout (0..1). */
    blackoutUniform: shared.uBlackout,
    /** Current front blackout (0..1) as sent to the shader. */
    getFrontBlackout() {
      return pane.material[0].uniforms.uBlackout.value;
    },
    /** Make this half's front display switch off with another half's blackout: the same variable. */
    linkBlackoutTo(source) {
      pane.material[0].uniforms.uBlackout = source.blackoutUniform;
    },
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
      // the back runs the same stretch and blackout measured from fully closed (180°)
      const backAngle = Math.PI - angle;
      shared.uBlackout.value = blackoutAt(angle);
      shared.uBlackoutBack.value = blackoutBackAt(backAngle);
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
  maxLevel, frostDistance = 1, blurExp = 1, blurExpand = 0,
  frostColor = 0x9a9a9a, frostPerUnit = 1, frostExp = 1, frostStrength = 0, lightLossPerUnit = 0, lightLossExp = 1,
  lightBlackPoint = 0, glassOnDark = 1,
  blackoutStartDeg = 180, blackoutEndDeg = 180, blackoutBackStartDeg = 180, blackoutBackEndDeg = 180,
  stretchMaxDeg = 0, stretchStartDeg = 0, stretchEndDeg = 180, stretchTrack = false, perspective = 1, squeeze = 0, squeezeExp = 2,
  foldable = { left: true, right: true }, backScreen = { left: true, right: true },
  envMap = null, glass = { reflection: 1, gloss: 1 }, matte = { reflection: 0.3, gloss: 6 },
  glassThickness = 0, glassIor = 1.5, displayOverscan = 0,
}) {
  const group = new THREE.Group();
  const params = {
    halfWidth: width / 2, height, thickness, cornerRadius, edgeChamfer, bezel, maxLevel, frostDistance, blurExp, blurExpand,
    frostColor, frostPerUnit, frostExp, frostStrength, lightLossPerUnit, lightLossExp, lightBlackPoint, glassOnDark,
    blackoutStartDeg, blackoutEndDeg, blackoutBackStartDeg, blackoutBackEndDeg,
    stretchMaxDeg, stretchStartDeg, stretchEndDeg, stretchTrack, perspective, squeeze, squeezeExp, envMap, glass, matte, glassThickness, glassIor,
  };

  const halves = [
    createHalf(portal, -1, { ...params, foldable: foldable.left, backScreen: backScreen.left }),
    createHalf(portal, +1, { ...params, foldable: foldable.right, backScreen: backScreen.right }),
  ];
  for (const half of halves) group.add(half.hinge, half.grabZone);

  // the whole inner display switches off together: a static half's front shares the
  // folding half's blackout variable (its own angle never changes)
  const folding = halves.find((h) => h.foldable);
  if (folding) for (const other of halves) if (!other.foldable) other.linkBlackoutTo(folding);

  // every pane (and the spot where it sits when unfolded) is hittable: a foldable half can
  // be dragged, and a tap anywhere on the phone toggles (see main.js)
  const byObject = new Map(halves.flatMap((h) => [[h.pane, h], [h.grabZone, h]]));

  const hingeZ = thickness / 2; // the hinge axis runs along y at x = 0, z = hingeZ

  // The display area of the open phone: both screens, inside the chamfer and the bezel.
  // Screen extents are in the slab's local coordinates (centered on that half), so the
  // right half's outer edge sits at its center offset (width / 4) plus its local edge x.
  // The image runs a little further under the bezel than the opening (overscan), so the
  // pane's edge pixels never sample the display's antialiased boundary or the halo beyond
  // it, even with the refraction shift and texture filtering.
  const right = halves[1].screen; // its outer edge is at +x
  const inset = bezel - displayOverscan;
  const display = {
    halfWidth: width / 4 + right.edgeX - inset,
    halfHeight: right.halfHeight - inset,
    radius: Math.max(0, right.cornerRadius - inset),
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
