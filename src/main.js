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
const DISPLAY_OVERSCAN = 0.008; // the image extends this far under the bezel (world units), hiding its edge from the opening
const GLASS_REFLECTION = 1;    // cover display (back): 0..1, strength of the glass reflection
const GLASS_GLOSS = 1;         // cover display (back): 0 = mirror sharp reflection, higher = blurrier (mip levels)
const MATTE_REFLECTION = 0.3;  // inner screens: weak, diffuse sheen instead of a glass reflection
const MATTE_GLOSS = 6;         // inner screens: very blurred reflection (mip levels)
const GLASS_THICKNESS = 0.03;  // glass layer over the displays (world units): refraction shifts the image at angles
const GLASS_IOR = 1.5;         // index of refraction of that glass
const MAX_BLUR_LEVEL = 15;      // 0..6, blur reached at FROST_DISTANCE from the window (each level doubles the radius)
const FROST_DISTANCE = 3;    // frosted window: distance (world units) from the window plane at which the blur is maximal
const BLUR_EXP = 1;            // blur vs distance: 1 = linear, < 1 = quick start, > 1 = slow start
const BLUR_EXPAND = 0;         // 0..1: how far the blurred image spreads past its edges instead of darkening them
const FROST_COLOR = 0x9a9a9a;  // diffuse tone of the frosted glass the image fades toward with distance
const FROST_PER_UNIT = 1.2;    // rate of the fade toward that tone per world unit of distance (exponential decay)
const FROST_EXP = 1.3;         // shape: 1 = pure exponential, > 1 = slow start
const FROST_STRENGTH = 1;      // 0 = no fade, 1 = can reach the frost tone completely
const LIGHT_LOSS_PER_UNIT = 2.2; // light attenuation rate per world unit of distance (exponential decay)
const LIGHT_LOSS_EXP = 1.6;      // shape: 1 = pure exponential, > 1 = slow start, steeper middle
const LIGHT_BLACK_POINT = 0.06;  // light below this fraction clips to true black (kills the exponential's tail)
const GLASS_ON_DARK = 0.35;      // how much reflection sheen remains where the light is gone (0 = none)
const BLACKOUT_START_DEG = 60;   // the displays start switching off at this fold angle (both inner screens fade together)...
const BLACKOUT_END_DEG = 125;   // ...and is fully black from this angle on (back: measured from closed)
const BLACKOUT_BACK_START_DEG = 15; // cover display, measured from fully closed: starts switching off this far open...
const BLACKOUT_BACK_END_DEG = 70;   // ...and is fully black from there (same fade code as the inner screens, standalone)
const STRETCH_MAX_DEG = 85;    // horizontal lookup angle cap (< 90, where the projection collapses); 0 = no stretch at all
const STRETCH_START_DEG = 0;   // stylized mode only: real fold angle where the stretch starts
const STRETCH_END_DEG = 130;   // stylized mode only: real fold angle where the stretch reaches full strength
const STRETCH_TRACK = true;    // true = physical: the lookup follows the real fold angle (counter stretch: the picture
                               // stays in place as seen from the portal viewpoint); false = stylized sine ramp
const PERSPECTIVE = 1;         // vertical: 0 = flat lookup (no wedges), 1 = full projection of the fold through the portal camera
const SQUEEZE = 1;             // 0..1: sharp pixels near the hinge keep the pane's own unstretched mapping (counters the projection's stretch)
const SQUEEZE_EXP = 2;         // how fast that gives way to the projected mapping as the blur grows (> 1 = sooner)
const FOLLOW_RATE = 8;        // per second: how quickly the pane catches up with the finger while dragging
const TOGGLE_DURATION = 0.9;   // seconds: open / close animation on tap (ease in-out)
const SNAP_ANGLE = 8;          // degrees: releasing a drag this close to fully open / closed snaps to it (detent)
const SNAP_DURATION = 0.3;     // seconds: the snap animation
const INTRO_DELAY = 0.3;       // seconds before the page-load intro starts
const INTRO_DURATION = 1.8;    // seconds: the phone opens, then the camera swings to the default view
const INTRO_CAMERA_LAG = 0;    // seconds after the fold starts before the camera starts moving (0 = together)
const INTRO_CAMERA_EASE = 5;   // steepness of the camera's ease in-out (3 = cubic, higher = sharper middle, longer rests)
const INTRO_AZIMUTH_DEG = -55; // where the camera starts, around the phone (0 = frontal)
const INTRO_ELEVATION_DEG = 18; // ...and above it
const CAMERA_FOV = 34;
const PORTAL_FOV_START = 34;   // inner camera the screens show the image from, when open: wide = strong perspective, narrow = flat
const PORTAL_FOV_END = 50;     // ...and when fully closed; interpolated with the fold (the portal is re-rendered as it changes)
const PORTAL_FOV_EXP = 2;      // shape of that interpolation vs the fold: 1 = linear, > 1 = stays near START longer, < 1 = moves early
const PORTAL_GLOW = 0;         // brightness of the big blurred halo of the image behind the display (0 = black surround)
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
const portal = createPortal(renderer, { fov: PORTAL_FOV_START, glowStrength: PORTAL_GLOW });

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
    displayOverscan: DISPLAY_OVERSCAN,
    maxLevel: MAX_BLUR_LEVEL,
    frostDistance: FROST_DISTANCE,
    blurExp: BLUR_EXP,
    blurExpand: BLUR_EXPAND,
    frostColor: FROST_COLOR,
    frostPerUnit: FROST_PER_UNIT,
    frostExp: FROST_EXP,
    frostStrength: FROST_STRENGTH,
    lightLossPerUnit: LIGHT_LOSS_PER_UNIT,
    lightLossExp: LIGHT_LOSS_EXP,
    lightBlackPoint: LIGHT_BLACK_POINT,
    glassOnDark: GLASS_ON_DARK,
    blackoutStartDeg: BLACKOUT_START_DEG,
    blackoutEndDeg: BLACKOUT_END_DEG,
    blackoutBackStartDeg: BLACKOUT_BACK_START_DEG,
    blackoutBackEndDeg: BLACKOUT_BACK_END_DEG,
    stretchMaxDeg: STRETCH_MAX_DEG,
    stretchStartDeg: STRETCH_START_DEG,
    stretchEndDeg: STRETCH_END_DEG,
    stretchTrack: STRETCH_TRACK,
    perspective: PERSPECTIVE,
    squeeze: SQUEEZE,
    squeezeExp: SQUEEZE_EXP,
    foldable: { left: true, right: false },
    backScreen: { left: true, right: false }, // 3 displays: both fronts + the left back (shows the image as it closes); right back is chrome
    envMap: envCube.texture,
    glass: { reflection: GLASS_REFLECTION, gloss: GLASS_GLOSS },
    matte: { reflection: MATTE_REFLECTION, gloss: MATTE_GLOSS },
    glassThickness: GLASS_THICKNESS,
    glassIor: GLASS_IOR,
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
    onEnd: (half, wasDrag) => {
      orbit.enabled = true;
      if (wasDrag) snap(half);
    },
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

  // Detent: a drag released within SNAP_ANGLE of fully open or fully closed settles there.
  function snap(half) {
    const max = book.maxTargetFor(half);
    const angle = half.target * 180;
    if (angle <= SNAP_ANGLE) half.animateTo(0, SNAP_DURATION);
    else if (angle >= max * 180 - SNAP_ANGLE) half.animateTo(max, SNAP_DURATION);
  }

  // Starting state: closed, then the intro opens it (or ?left=0.6 for a fixed state)
  const left = book.halves[0];
  const value = parseFloat(new URLSearchParams(location.search).get('left'));
  const fixedStart = !Number.isNaN(value);
  left.target = fixedStart ? THREE.MathUtils.clamp(value, 0, 1) : 1;
  left.setFold(left.target);

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

  // Page-load intro: the camera swings from an angle above and to the side into the default
  // frontal view while the phone opens. Orbit is off until it is done.
  // ease in-out with an adjustable steepness: power INTRO_CAMERA_EASE on both halves
  const easeInOut = (t, p) => (t < 0.5 ? Math.pow(2 * t, p) / 2 : 1 - Math.pow(2 * (1 - t), p) / 2);
  const intro = fixedStart ? null : { elapsed: 0, started: false };
  const introFrom = new THREE.Spherical(1, Math.PI / 2 - THREE.MathUtils.degToRad(INTRO_ELEVATION_DEG), THREE.MathUtils.degToRad(INTRO_AZIMUTH_DEG));
  const introTo = new THREE.Spherical(1, Math.PI / 2, 0);
  const spherical = new THREE.Spherical();
  function placeCamera(t) {
    const radius = camera.position.distanceTo(orbit.target); // keep the fitted distance
    spherical.set(radius, THREE.MathUtils.lerp(introFrom.phi, introTo.phi, t), THREE.MathUtils.lerp(introFrom.theta, introTo.theta, t));
    camera.position.setFromSpherical(spherical).add(orbit.target);
    camera.lookAt(orbit.target);
  }
  if (intro) {
    orbit.enabled = false;
    placeCamera(0);
  }
  function updateIntro(dt) {
    if (!intro) return;
    intro.elapsed += dt;
    if (intro.elapsed < INTRO_DELAY) return;
    if (!intro.started) {
      intro.started = true;
      left.animateTo(0, INTRO_DURATION);
    }
    // the fold leads, the camera follows shortly after
    const t = THREE.MathUtils.clamp((intro.elapsed - INTRO_DELAY - INTRO_CAMERA_LAG) / INTRO_DURATION, 0, 1);
    placeCamera(easeInOut(t, INTRO_CAMERA_EASE));
    if (t >= 1) {
      orbit.enabled = true;
      orbit.update(); // adopt the final camera position
      introDone();
    }
  }
  let introDone = () => {};
  portal.render(); // once: the frosted window never changes

  // the portal camera's field of view follows the fold: re-render the portal (and its blur
  // levels) only when it actually changes, so an idle phone costs nothing
  let portalFov = -1;
  function updatePortalFov() {
    const fov = THREE.MathUtils.lerp(PORTAL_FOV_START, PORTAL_FOV_END, Math.pow(book.halves[0].fold, PORTAL_FOV_EXP));
    if (Math.abs(fov - portalFov) < 1e-3) return;
    portalFov = fov;
    portal.setFov(fov);
    portal.render();
  }

  const clock = new THREE.Clock();
  let introRunning = !!intro;
  introDone = () => { introRunning = false; };
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1); // clamp after a tab switch / stall
    if (introRunning) updateIntro(dt); else orbit.update();
    for (const half of book.halves) half.update(dt, FOLLOW_RATE);
    updatePortalFov();
    renderer.render(scene, camera);
  });
}

init();
