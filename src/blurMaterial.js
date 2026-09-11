import * as THREE from 'three';
import vertexShader from './shaders/blur.vert?raw';
import fragmentShader from './shaders/blur.frag?raw';

export const BLUR_LEVELS = 6; // blur levels built by the post-process chain (shader samples 0..6)

/**
 * Uniforms of one half's screens (the fold-driven ones are updated per frame in book.js).
 */
export function createScreenUniforms(portal, {
  maxLevel, frostDistance, blurExp, blurExpand, frostColor, frostPerUnit, frostExp, frostStrength,
  lightLossPerUnit, lightLossExp, lightBlackPoint, glassOnDark, envMap, glassThickness, glassIor, perspective,
}) {
  const levels = {};
  for (let i = 0; i <= BLUR_LEVELS; i++) {
    levels[`uLevel${i}`] = { value: portal.blurLevels[i] };
  }
  return {
    ...levels,
    uMaxLevel: { value: Math.min(maxLevel, BLUR_LEVELS) },
    uFrostDistance: { value: frostDistance },
    uBlurExp: { value: blurExp },
    uBlurExpand: { value: blurExpand },
    uFrostColor: { value: new THREE.Color(frostColor) },
    uFrostPerUnit: { value: frostPerUnit },
    uFrostExp: { value: frostExp },
    uFrostStrength: { value: frostStrength },
    uLightLossPerUnit: { value: lightLossPerUnit },
    uLightLossExp: { value: lightLossExp },
    uLightBlackPoint: { value: lightBlackPoint },
    uGlassOnDark: { value: glassOnDark },
    uBlackout: { value: 0 },     // driven per frame by the fold, see book.js
    uBlackoutBack: { value: 0 },
    uPortalViewProjection: { value: portal.viewProjection },
    uStretchMatrix: { value: new THREE.Matrix4() },
    uStretchMatrixBack: { value: new THREE.Matrix4() },
    uFlatMatrix: { value: new THREE.Matrix4() },     // set once in book.js
    uFlatMatrixBack: { value: new THREE.Matrix4() },
    uPerspective: { value: perspective },
    uEnvMap: { value: envMap },
    uGlassThickness: { value: glassThickness },
    uGlassIor: { value: glassIor },
  };
}

/**
 * Screen material for both large faces of the slab: shows the portal render (projected
 * through the fixed portal camera) blended between its pre-blurred levels, and faded
 * toward the frost tone, by the pixel's distance to its window plane (`windowZ`: where the face rests when flat
 * against the window), with a thin black outline following the rounded outer edges. The front is measured from flat, the back from fully closed (the shader tells
 * them apart by normal), unless backAsFront is set: then the back simply shows the same
 * view as the front, which is what a half that never folds needs for its cover display.
 */
export function createScreenMaterial(sharedUniforms, {
  hingeX, edgeX, halfHeight, cornerRadius, bezel, windowZ, backAsFront = false,
  reflection = 1, gloss = 1, // surface finish: glossy glass (1, 1) or matte (weak, very blurred)
}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ...sharedUniforms,
      uGlassStrength: { value: reflection },
      uGlassGloss: { value: gloss },
      uWindowZ: { value: windowZ },
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
