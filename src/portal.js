import * as THREE from 'three';
import { createBlurChain } from './blurChain.js';
import { BLUR_LEVELS } from './blurMaterial.js';
import imageVertex from './shaders/portalImage.vert?raw';
import imageFragment from './shaders/portalImage.frag?raw';
import glowFragment from './shaders/portalGlow.frag?raw';

/**
 * The "portal": the unfolded image rendered ONCE from a fixed frontal camera at the phone's
 * default viewpoint, plus a chain of blurred versions of that render (the frosted window).
 *
 * Panes project their own surface through this same fixed camera to look up the texture,
 * so what a pane shows depends only on how it is folded, never on where the viewer is.
 * That is what a real foldable screen would do (it cannot track your eyes).
 */
export function createPortal(renderer, {
  fov, resolution = 2048, glowStrength = 0.5, glowResolution = 512, glowLevels = 6,
}) {
  // Transparent background: alpha marks where the display is. The blur chain blurs color
  // and alpha together (premultiplied), so the panes can expand the image past its edges.
  const scene = new THREE.Scene();

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

  return {
    scene,
    viewProjection,
    /** Change the portal camera's field of view (call render() again afterwards). */
    setFov,
    get distance() { return camera.position.z; },
    blurLevels: blur.textures, // [sharp, blur 1, blur 2, ...]
    /**
     * Put the image in the portal scene, on the display area (the screen inside the bezel):
     * fitted to cover it, clipped to its rounded corners, with a big blurred halo of it
     * behind, bleeding out in every direction.
     */
    setImage(texture, { halfWidth, halfHeight, radius }) {
      const imageAspect = texture.image.width / texture.image.height;
      const displayAspect = halfWidth / halfHeight;
      const uvScale = imageAspect > displayAspect
        ? new THREE.Vector2(displayAspect / imageAspect, 1) // image wider: crop the sides
        : new THREE.Vector2(1, imageAspect / displayAspect); // image taller: crop top/bottom
      const imageMaterial = new THREE.ShaderMaterial({
        vertexShader: imageVertex,
        fragmentShader: imageFragment,
        uniforms: {
          uMap: { value: texture },
          uUvScale: { value: uvScale },
          uHalfSize: { value: new THREE.Vector2(halfWidth, halfHeight) },
          uRadius: { value: radius },
        },
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, halfHeight * 2), imageMaterial);
      plane.renderOrder = 1; // on top of the halo (the render target has no depth buffer)
      scene.add(plane);
      planeHalfSize = Math.max(halfWidth, halfHeight);
      const frameHalf = planeHalfSize * FRAME_MARGIN;
      setFov(camera.fov); // refit the frame to the plane

      // Halo: render the masked image alone into a small frame-sized buffer and blur it far;
      // premultiplied alpha makes it fade out away from the display.
      const glowSize = new THREE.Vector2(glowResolution, glowResolution);
      const glowSource = new THREE.WebGLRenderTarget(glowSize.x, glowSize.y, {
        type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
      });
      const glowChain = createBlurChain(renderer, glowSource.texture, glowSize, glowLevels, 256);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(glowSource);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
      glowChain.render();

      const glowMaterial = new THREE.ShaderMaterial({
        vertexShader: imageVertex,
        fragmentShader: glowFragment,
        uniforms: {
          uGlow: { value: glowChain.textures[glowLevels] },
          uStrength: { value: glowStrength },
        },
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(frameHalf * 2, frameHalf * 2), glowMaterial);
      halo.renderOrder = 0;
      scene.add(halo);
    },
    /** Render the portal and its blur levels. Needed once, and again after setFov()/setImage(). */
    render() {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      blur.render();
      renderer.setRenderTarget(previous);
    },
  };
}
