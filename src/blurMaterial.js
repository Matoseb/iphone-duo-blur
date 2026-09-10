import * as THREE from 'three';
import vertexShader from './shaders/blur.vert?raw';
import fragmentShader from './shaders/blur.frag?raw';

export const BLUR_LEVELS = 6; // blur levels built by the post-process chain (shader samples 0..6)

/**
 * Uniforms of one half's screens (updated per frame in book.js).
 */
export function createScreenUniforms(portal, { maxLevel, blurExp, fadeToBlack, darkSpread, darkExp, envMap, glassStrength, glassGloss }) {
  const levels = {};
  for (let i = 0; i <= BLUR_LEVELS; i++) {
    levels[`uLevel${i}`] = { value: portal.blurLevels[i] };
  }
  return {
    ...levels,
    uMaxLevel: { value: Math.min(maxLevel, BLUR_LEVELS) },
    uBlurExp: { value: blurExp },
    uPortalViewProjection: { value: portal.viewProjection },
    uStretchMatrix: { value: new THREE.Matrix4() },
    uStretchMatrixBack: { value: new THREE.Matrix4() },
    uFold: { value: 0 },
    uFoldBack: { value: 0 },
    uDarkProgress: { value: 0 },
    uDarkProgressBack: { value: 0 },
    uFadeToBlack: { value: fadeToBlack },
    uDarkSpread: { value: darkSpread },
    uDarkExp: { value: darkExp },
    uEnvMap: { value: envMap },
    uGlassStrength: { value: glassStrength },
    uGlassGloss: { value: glassGloss },
  };
}

/**
 * Screen material for both large faces of the slab: shows the portal render (projected
 * through the fixed portal camera) blended between its pre-blurred levels along the pane,
 * fading to black, with a thin black outline following the rounded outer edges. The front is
 * measured from flat, the back from fully closed (the shader tells them apart by normal),
 * unless backAsFront is set: then the back simply shows the same view as the front, which
 * is what a half that never folds needs for its cover display.
 */
export function createScreenMaterial(sharedUniforms, { hingeX, edgeX, halfHeight, cornerRadius, bezel, backAsFront = false }) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ...sharedUniforms,
      uHingeX: { value: hingeX },
      uEdgeX: { value: edgeX },
      uHalfHeight: { value: halfHeight },
      uCornerRadius: { value: cornerRadius },
      uBezel: { value: bezel },
      uBackAsFront: { value: backAsFront },
    },
  });
}

/** Chrome for the rim of the slab, lit by the scene environment map. */
export function createChromeMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 });
}
