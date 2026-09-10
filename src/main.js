import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPortal } from './portal.js';
import { createBook } from './book.js';
import { createDragControls } from './dragControls.js';
import imageUrl from '../image2.jpg';

const PHONE_WIDTH = 3.2;       // width of the open phone (world units)
const PHONE_ASPECT = 7 / 5;    // width : height of the open phone; the image is fitted (cover) to the display
const THICKNESS = 0.08;        // thickness of each half (world units)
const CORNER_RADIUS = 0.2;    // radius of the rounded outer corners of each half (world units)
const EDGE_CHAMFER = 0.01;     // small chamfer on every edge between the faces and the rim (world units)
const BEZEL = 0.04;            // black outline along the three outer edges of each display (world units)
const GLASS_REFLECTION = 1;    // 0..1, strength of the glass reflection on the screens
const GLASS_GLOSS = 1;         // 0 = mirror sharp reflection, higher = blurrier (mip levels)
const MAX_BLUR_LEVEL = 25;      // 0..6, blur strength at the outer edge of a fully folded pane (each level doubles the radius)
const BLUR_EXP = 0.75;         // shape of the blur along the pane: 1 = linear, < 1 = strong early, > 1 = slow start
const BLUR_EXPAND = 0;         // 0..1: how far the blurred image spreads past its edges instead of darkening them
const BLUR_SPREAD = 1.5;       // scatter: how far a blurred zone bleeds into sharper zones (0 = gather only, 1 = ~2 sigma)
const BLUR_RAMP = 0.01;         // S-curve: the blur rises smoothly from 0 at the hinge to full over this fraction of the half
const FADE_TO_BLACK = 1;       // 0..1, how dark the pane gets at the far end of the fade
const DARK_END_DEG = 120;      // fold angle at which the whole pane is dark
const DARK_SPREAD = 2;         // how much the outer edge leads the hinge (1 = the gradient spans the whole pane)
const DARK_EXP = .8;            // shape of the darkening: 1 = as is, 2 = exponential-like (slow start, steep end)
const STRETCH_MAX_DEG = 90;    // virtual fold angle used for the horizontal stretch at full strength (< 90)
const STRETCH_START_DEG = 0;   // real fold angle where the stretch starts
const STRETCH_END_DEG = 180;   // real fold angle where the stretch reaches full strength and stays
const FOLLOW_RATE = 8;        // per second: how quickly the pane catches up with the finger while dragging
const TOGGLE_DURATION = 0.9;   // seconds: open / close animation on tap (ease in-out)
const CAMERA_FOV = 40;
const PORTAL_FOV = 30;         // inner camera the screens show the image from: wide = strong perspective, narrow = flat
const FIT_PADDING = 0.08;      // fraction of the viewport kept clear around the open phone (object-fit: contain)
const MAX_PHONE_PX = 900;      // the open phone never gets larger than this on screen (CSS px, larger side)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // transparent: the page background shows through
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // for the chrome; the screens are not tone mapped
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene(); // no background: the white page shows behind the phone
// Environment (not shown as background): a prefiltered version lights the chrome rim, and a
// plain cube map of the same room is reflected by the screen glass.
const room = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(room, 0.04).texture;
pmrem.dispose();
const envCube = new THREE.WebGLCubeRenderTarget(256, {
  type: THREE.HalfFloatType,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
new THREE.CubeCamera(0.1, 100, envCube).update(renderer, room);

// camera starts frontal to the plane, orbit controls move it from there
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);
camera.lookAt(0, 0, 0);

/**
 * Distance at which a width x height rectangle fits the viewport with FIT_PADDING all
 * around, but never shows larger than MAX_PHONE_PX on screen (big desktop windows).
 */
function fitDistance(width, height) {
  const halfTan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
  const usable = 1 - 2 * FIT_PADDING;
  const fit = Math.max(
    (height / 2) / (usable * halfTan),                 // limited by height
    (width / 2) / (usable * halfTan * camera.aspect),  // limited by width
  );
  // on-screen size in px of a world length L at distance d: L * innerHeight / (2 d halfTan)
  const cap = (Math.max(width, height) * window.innerHeight) / (2 * halfTan * MAX_PHONE_PX);
  return Math.max(fit, cap);
}

// portal: the unfolded image seen from a FIXED camera at the same default viewpoint.
// The panes are screens showing that view; they never know where the real viewer is.
const portal = createPortal(renderer, { fov: PORTAL_FOV, darkSpread: DARK_SPREAD, darkExp: DARK_EXP, fadeToBlack: FADE_TO_BLACK });

let onResize = () => {};
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  onResize();
});

async function init() {
  const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const width = PHONE_WIDTH;
  const height = PHONE_WIDTH / PHONE_ASPECT;

  const book = createBook(portal, {
    width,
    height,
    thickness: THICKNESS,
    cornerRadius: CORNER_RADIUS,
    edgeChamfer: EDGE_CHAMFER,
    bezel: BEZEL,
    maxLevel: MAX_BLUR_LEVEL,
    blurExp: BLUR_EXP,
    blurExpand: BLUR_EXPAND,
    blurSpread: BLUR_SPREAD,
    blurRamp: BLUR_RAMP,
    fadeToBlack: FADE_TO_BLACK,
    darkSpread: DARK_SPREAD,
    darkExp: DARK_EXP,
    darkEndDeg: DARK_END_DEG,
    stretchMaxDeg: STRETCH_MAX_DEG,
    stretchStartDeg: STRETCH_START_DEG,
    stretchEndDeg: STRETCH_END_DEG,
    foldable: { left: true, right: false },
    backScreen: { left: true, right: false }, // 3 displays: both fronts + the left back (shows the image as it closes); right back is chrome
    envMap: envCube.texture,
    glassStrength: GLASS_REFLECTION,
    glassGloss: GLASS_GLOSS,
  });
  scene.add(book.group);

  // the image covers the display area (inside bezel and chamfer), with its rounded corners
  portal.setImage(texture, book.display);

  // Fold drag must be registered BEFORE OrbitControls so it can claim the pointer first
  // when the drag starts on the phone; anywhere else, OrbitControls takes over.
  createDragControls(renderer.domElement, {
    camera,
    objects: book.grabbable,
    resolve: (object) => book.halfOf(object),
    arcFor: (half, point) => book.arcFor(half, point),
    onStart: () => { orbit.enabled = false; },
    onEnd: () => { orbit.enabled = true; },
    onFold: (half, fold) => {
      half.tween = null; // a drag takes over from any running animation
      half.target = THREE.MathUtils.clamp(fold, 0, book.maxTargetFor(half));
    },
    // a tap anywhere on the phone toggles the foldable half: open -> closed, past halfway -> open
    onTap: (tapped) => {
      const half = tapped.foldable ? tapped : book.halves.find((h) => h.foldable);
      if (!half) return;
      const to = half.target < 0.5 ? book.maxTargetFor(half) : 0;
      half.animateTo(to, TOGGLE_DURATION);
    },
  });

  // Optional starting state, e.g. ?left=0.6
  const value = parseFloat(new URLSearchParams(location.search).get('left'));
  if (!Number.isNaN(value)) {
    const left = book.halves[0];
    left.target = THREE.MathUtils.clamp(value, 0, 1);
    left.setFold(left.target);
  }

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.enablePan = false;

  // object-fit: contain. Fit the open phone in the viewport (same on phones and desktops)
  // and keep the camera at that distance along its current direction.
  function fit() {
    const distance = fitDistance(width, height);
    camera.position.sub(orbit.target).setLength(distance).add(orbit.target);
    orbit.minDistance = distance * 0.4;
    orbit.maxDistance = distance * 3;
    orbit.update();
  }
  fit();
  onResize = fit;
  portal.render();

  // the front screens' fade to black is baked into the portal image before the blur,
  // so the portal (and its blur levels) is re-rendered whenever that darkness changes
  let lastDark = [-1, -1];
  function updatePortalDarkness() {
    const dark = book.halves.map((h) => h.darkProgress);
    if (dark[0] === lastDark[0] && dark[1] === lastDark[1]) return;
    lastDark = dark;
    portal.setDarkness(dark[0], dark[1]);
    portal.render();
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1); // clamp after a tab switch / stall
    orbit.update();
    for (const half of book.halves) half.update(dt, FOLLOW_RATE);
    updatePortalDarkness();
    renderer.render(scene, camera);
  });
}

init();
