import * as THREE from 'three';
import vertexShader from './shaders/fullscreen.vert?raw';
import fragmentShader from './shaders/gaussian.frag?raw';

/**
 * Post-process blur chain: from a source texture, builds `levels` progressively blurrier
 * textures. Each level is a separable Gaussian of the previous one at half its resolution,
 * so the blur radius roughly doubles per level while staying perfectly smooth.
 *
 * The resolution never drops below `minSize`: past that point the level keeps its size and
 * the Gaussian's sample step doubles instead, which gives the same radius without the
 * blocky look of a tiny texture being magnified.
 *
 * textures[0] is the source itself, textures[i] the i-th blur level.
 */
export function createBlurChain(renderer, source, sourceSize, levels, minSize = 512) {
  const makeTarget = () => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });

  // per level: a temp target for the horizontal pass and the final target for the vertical
  // pass, plus the sample step that makes up for a resolution that stopped halving
  const passes = Array.from({ length: levels }, () => ({ temp: makeTarget(), out: makeTarget(), step: 1 }));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uDirection: { value: new THREE.Vector2() },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function resize() {
    const larger = Math.max(sourceSize.x, sourceSize.y);
    passes.forEach((pass, i) => {
      const ideal = 1 / 2 ** (i + 1);                      // the halving-per-level size
      const scale = Math.max(ideal, Math.min(1, minSize / larger)); // clamped at minSize
      pass.step = scale / ideal;                            // > 1 once the size is clamped
      pass.temp.setSize(Math.max(1, Math.round(sourceSize.x * scale)), Math.max(1, Math.round(sourceSize.y * scale)));
      pass.out.setSize(pass.temp.width, pass.temp.height);
    });
  }
  resize();

  function blit(input, inputW, inputH, direction, target, step) {
    material.uniforms.uSource.value = input;
    material.uniforms.uTexel.value.set(step / inputW, step / inputH);
    material.uniforms.uDirection.value.copy(direction);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }

  const H = new THREE.Vector2(1, 0);
  const V = new THREE.Vector2(0, 1);

  return {
    textures: [source, ...passes.map((p) => p.out.texture)],
    resize,
    render() {
      const previous = renderer.getRenderTarget();
      let input = source;
      let w = sourceSize.x;
      let h = sourceSize.y;
      let inputStep = 1;
      for (const pass of passes) {
        blit(input, w, h, H, pass.temp, inputStep);            // horizontal, downsampling
        blit(pass.temp.texture, pass.temp.width, pass.temp.height, V, pass.out, pass.step); // vertical
        input = pass.out.texture;
        w = pass.out.width;
        h = pass.out.height;
        inputStep = pass.step;
      }
      renderer.setRenderTarget(previous);
    },
  };
}
