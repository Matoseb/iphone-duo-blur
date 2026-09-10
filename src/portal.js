import * as THREE from 'three';
import { createBlurChain } from './blurChain.js';
import { BLUR_LEVELS } from './blurMaterial.js';
import imageVertex from './shaders/portalImage.vert?raw';
import imageFragment from './shaders/portalImage.frag?raw';

/**
 * The "portal": the unfolded image rendered ONCE from a fixed frontal camera at the phone's
 * default viewpoint, plus a chain of blurred versions of that render.
 *
 * Panes project their own surface through this same fixed camera to look up the texture,
 * so what a pane shows depends only on how it is folded, never on where the viewer is.
 * That is what a real foldable screen would do (it cannot track your eyes).
 */
export function createPortal(renderer, {
  fov, resolution = 2048, background = 0x000000, darkSpread = 1, darkExp = 1, fadeToBlack = 1,
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  // Square frame. The field of view controls the portal's perspective: the camera backs off
  // just far enough for the whole plane to fit the frame with a margin, so a wide fov means
  // a close viewpoint (strong perspective through a folded pane) and a narrow fov a distant,
  // flatter one.
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
  const viewProjection = new THREE.Matrix4(); // shared by reference with the pane uniforms
  let planeHalfSize = 1; // half of the larger plane dimension, set by setImage()
  const FRAME_MARGIN = 1.25;
  function setFov(value) {
    camera.fov = value;
    camera.updateProjectionMatrix();
    const distance = (planeHalfSize * FRAME_MARGIN) / Math.tan(THREE.MathUtils.degToRad(value / 2));
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  }
  setFov(fov);

  const size = new THREE.Vector2(resolution, resolution);
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,        // linear colors without banding
    samples: 4,                       // antialiased image edges
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });

  const blur = createBlurChain(renderer, target.texture, size, BLUR_LEVELS);
  let imageMaterial = null;

  return {
    scene,
    viewProjection,
    /** Change the portal camera's field of view (call render() again afterwards). */
    setFov,
    get distance() { return camera.position.z; },
    blurLevels: blur.textures, // [sharp, blur 1, blur 2, ...]
    /**
     * Put the image in the portal scene, on the display area (the screen inside the bezel):
     * fitted to cover it, clipped to its rounded corners.
     */
    setImage(texture, { halfWidth, halfHeight, radius }) {
      const imageAspect = texture.image.width / texture.image.height;
      const displayAspect = halfWidth / halfHeight;
      const uvScale = imageAspect > displayAspect
        ? new THREE.Vector2(displayAspect / imageAspect, 1) // image wider: crop the sides
        : new THREE.Vector2(1, imageAspect / displayAspect); // image taller: crop top/bottom
      imageMaterial = new THREE.ShaderMaterial({
        vertexShader: imageVertex,
        fragmentShader: imageFragment,
        uniforms: {
          uMap: { value: texture },
          uUvScale: { value: uvScale },
          uHalfSize: { value: new THREE.Vector2(halfWidth, halfHeight) },
          uRadius: { value: radius },
          uDarkLeft: { value: 0 },
          uDarkRight: { value: 0 },
          uDarkSpread: { value: darkSpread },
          uDarkExp: { value: darkExp },
          uFadeToBlack: { value: fadeToBlack },
        },
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, halfHeight * 2), imageMaterial);
      scene.add(plane);
      planeHalfSize = Math.max(halfWidth, halfHeight);
      setFov(camera.fov); // refit the frame to the plane
    },
    /** Darkness progress of each half (0..1), applied to the image before it is blurred. */
    setDarkness(left, right) {
      if (!imageMaterial) return;
      imageMaterial.uniforms.uDarkLeft.value = left;
      imageMaterial.uniforms.uDarkRight.value = right;
    },
    /** Render the portal and its blur levels: once, and again whenever the darkness changes. */
    render() {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      blur.render();
      renderer.setRenderTarget(previous);
    },
  };
}
