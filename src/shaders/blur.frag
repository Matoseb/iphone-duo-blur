// Pane rendering the portal. The pane is a screen: it shows what a viewer at the FIXED
// portal viewpoint would see through it (projective lookup into the portal render), so the
// content and the blur are glued to the pane and do not react to the orbit camera.
// Both faces run the effect: the front measured from flat (0°), the back measured from
// fully closed (180°), where it lies over the other half and shows that side of the image.
uniform sampler2D uLevel0;
uniform sampler2D uLevel1;
uniform sampler2D uLevel2;
uniform sampler2D uLevel3;
uniform sampler2D uLevel4;
uniform sampler2D uLevel5;
uniform sampler2D uLevel6;
uniform float uMaxLevel;         // highest level reached at full fold (0..6)
uniform float uBlurExp;          // exponent shaping the blur along the pane: 1 = linear, > 1 = exponential ramp
uniform float uHingeX;           // local x of the hinge edge of the screen
uniform float uEdgeX;            // local x of the outer edge of the screen
uniform float uHalfHeight;       // local half height of the screen
uniform float uCornerRadius;     // radius of the rounded outer corners
uniform float uBezel;            // width of the black outline along the three outer edges
uniform float uFold;             // front: 0 = flat, 1 = closed
uniform float uFoldBack;         // back: 0 = closed, 1 = flat
uniform float uFadeToBlack;      // 0 = none, 1 = fully black
uniform float uDarkProgress;     // front: 0 = no darkness, 1 = whole pane dark
uniform float uDarkProgressBack; // back: same, measured from closed
uniform float uDarkSpread;       // how far the outer edge leads the hinge
uniform float uDarkExp;          // exponent shaping the darkening: 1 = as is, > 1 = slow start, steep end
uniform bool uBackAsFront;       // back screen of a half that never folds: same view as the front
uniform samplerCube uEnvMap;     // surroundings reflected by the glass (linear HDR)
uniform float uGlassStrength;    // 0 = no reflection, 1 = physically plausible glass
uniform float uGlassGloss;       // 0 = mirror sharp, higher = blurrier reflection

varying vec3 vLocal;
varying float vIsBack;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vPortalClip;
varying vec4 vStretchClip;
varying vec4 vStretchClipBack;

float weight(float level, float i) {
  return max(0.0, 1.0 - abs(level - i));
}

// signed distance to a rounded box of half size b and corner radius r, centered at 0
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 renderFace(vec4 stretchClip, float fold, float darkProgress, bool fadeHere) {
  // Horizontal: projection at the virtual fold angle (stretch). Vertical: real projection.
  vec2 folded = vPortalClip.xy / vPortalClip.w;
  vec2 stretched = stretchClip.xy / stretchClip.w;
  vec2 uv = vec2(stretched.x, folded.y) * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);

  float distanceFromHinge = clamp((vLocal.x - uHingeX) / (uEdgeX - uHingeX), 0.0, 1.0);
  float amount = pow(fold * distanceFromHinge, uBlurExp);       // 0 .. 1, shaped by the exponent
  // blur radius doubles per level, so use a log curve to make the radius grow linearly
  float level = log2(1.0 + amount * (exp2(uMaxLevel) - 1.0));

  vec4 color =
      texture2D(uLevel0, uv) * weight(level, 0.0)
    + texture2D(uLevel1, uv) * weight(level, 1.0)
    + texture2D(uLevel2, uv) * weight(level, 2.0)
    + texture2D(uLevel3, uv) * weight(level, 3.0)
    + texture2D(uLevel4, uv) * weight(level, 4.0)
    + texture2D(uLevel5, uv) * weight(level, 5.0)
    + texture2D(uLevel6, uv) * weight(level, 6.0);

  // Darkness gradient across the pane, outer edge leading, deepening with the fold.
  // Front screens get it in the portal image, before the blur (see portalImage.frag);
  // back screens apply it here, after the blur.
  float fade = 0.0;
  if (fadeHere) {
    float g = uDarkSpread;
    fade = darkProgress * (1.0 + g) - g * (1.0 - distanceFromHinge);
    fade = pow(smoothstep(0.0, 1.0, fade), uDarkExp) * uFadeToBlack;
  }

  return vec4(color.rgb * (1.0 - fade), 1.0);
}

// Glass on top of the display: Schlick Fresnel (4% head-on, up to 100% at grazing angles)
// blending the reflected surroundings over the screen content.
vec3 glass(vec3 content) {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 R = reflect(-V, N);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 env = textureCube(uEnvMap, R, uGlassGloss).rgb;
  env = env / (1.0 + env); // simple tone mapping of the HDR surroundings
  return mix(content, env, fresnel * uGlassStrength);
}

void main() {
  // Thin black outline following the rounded display edge on the top, bottom and outer
  // side. The rounded box is centered on the hinge and twice the screen width, so its
  // hinge-side corners fall outside this half and the hinge edge gets no outline.
  vec2 center = vec2(uHingeX, 0.0);
  vec2 halfSize = vec2(abs(uEdgeX - uHingeX), uHalfHeight);
  float d = sdRoundedBox(vLocal.xy - center, halfSize, uCornerRadius);
  // on a back screen the hinge edge is an outer edge of the closed phone: close the frame there too
  bool onHingeEdge = vIsBack > 0.5 && abs(vLocal.x - uHingeX) < uBezel;

  vec3 content = vec3(0.0);
  if (d <= -uBezel && !onHingeEdge) {
    content = ((vIsBack > 0.5 && !uBackAsFront)
      ? renderFace(vStretchClipBack, uFoldBack, uDarkProgressBack, true)
      : renderFace(vStretchClip, uFold, uDarkProgress, false)).rgb;
  }

  gl_FragColor = vec4(glass(content), 1.0); // the glass covers the bezel too
  #include <colorspace_fragment>
}
