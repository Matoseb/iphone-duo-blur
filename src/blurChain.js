import * as THREE from 'three';
import vertexShader from './shaders/fullscreen.vert?raw';
import fragmentShader from './shaders/gaussian.frag?raw';

/**
 * Post-process blur chain: from a source texture, builds `levels` progressively blurrier
 * textures. Each level is a separable Gaussian of the previous one at half its resolution,
 * so the blur radius roughly doubles per level while staying perfectly smooth.
 *
 * textures[0] is the source itself, textures[i] the i-th blur level.
 */
export function createBlurChain(renderer, source, sourceSize, levels) {
  const makeTarget = () => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });

  // per level: a temp target for the horizontal pass and the final target for the vertical pass
  const passes = Array.from({ length: levels }, () => ({ temp: makeTarget(), out: makeTarget() }));

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
    let w = sourceSize.x;
    let h = sourceSize.y;
    for (const pass of passes) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      pass.temp.setSize(w, h);
      pass.out.setSize(w, h);
    }
  }
  resize();

  function blit(input, inputW, inputH, direction, target) {
    material.uniforms.uSource.value = input;
    material.uniforms.uTexel.value.set(1 / inputW, 1 / inputH);
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
      for (const pass of passes) {
        blit(input, w, h, H, pass.temp);                       // horizontal, downsampling
        blit(pass.temp.texture, pass.temp.width, pass.temp.height, V, pass.out); // vertical
        input = pass.out.texture;
        w = pass.out.width;
        h = pass.out.height;
      }
      renderer.setRenderTarget(previous);
    },
  };
}
