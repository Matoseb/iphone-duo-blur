// Pane rendering the portal. The pane is a screen: it shows what a viewer at the FIXED
// portal viewpoint would see through it (projective lookup into the portal render), so the
// content is glued to the pane and does not react to the orbit camera.
//
// Frosted window model: the portal render is a frosted window and the pane is a sheet held
// against it at an angle. The blur, and the fade toward the glass's diffuse tone, of each
// pixel follow its physical distance to that window: zero along the hinge, growing along
// the pane and with the fold. Past a fold angle the display switches off (black). The
// front's window is the flat position; the folding half's back rests on the closed
// position, so it is crisp when fully closed.
//
// Both faces run the effect: the front measured from flat (0°), the back measured from
// fully closed (180°), where it lies over the other half and shows that side of the image.
uniform sampler2D uLevel0;
uniform sampler2D uLevel1;
uniform sampler2D uLevel2;
uniform sampler2D uLevel3;
uniform sampler2D uLevel4;
uniform sampler2D uLevel5;
uniform sampler2D uLevel6;
uniform float uMaxLevel;         // blur level reached at uFrostDistance (0..6)
uniform float uFrostDistance;    // distance from the window (world units) at which the blur is maximal
uniform float uBlurExp;          // shape of blur vs distance: 1 = linear, > 1 = slow start, < 1 = quick start
uniform float uWindowZ;          // world z of the frosted window this face rests on when flat against it
uniform vec3 uFrostColor;        // diffuse tone of the frosted glass the image fades toward with distance
uniform float uFrostPerUnit;     // rate of the fade toward that tone per world unit of distance (exponential)
uniform float uFrostExp;         // shape: 1 = pure exponential, > 1 = slow start (Gaussian-like at 2)
uniform float uFrostStrength;    // 0 = no fade, 1 = can reach the frost tone completely
uniform float uLightLossPerUnit; // attenuation rate of the light per world unit of distance (exponential)
uniform float uLightLossExp;     // shape: 1 = pure exponential, > 1 = slow start (Gaussian-like at 2)
uniform float uLightBlackPoint;  // light below this fraction is clipped to true black (the tail of the exponential)
uniform float uGlassOnDark;      // how much of the reflection sheen remains where the light is gone (0..1)
uniform float uBlackout;         // front: 0 = display on, 1 = fully black (past the blackout angle)
uniform float uBlackoutBack;     // back: same, measured from fully closed
uniform float uBlurExpand;       // 0 = blur darkens the edges (black bleeds in), 1 = blurred image expands outward
uniform float uPerspective;      // 0 = flat lookup (the pane's own slice), 1 = real projection of the folded pane from the front
uniform float uLookupSide;       // which side of the hinge this face's picture lives on (-1 = x < 0, +1 = x > 0)
uniform float uViewTrack;        // front: 0 = lookup made for the frontal viewpoint, 1 = traced from the moving eye (ramps with the angle)
uniform float uViewTrackBack;    // back: same, measured from fully closed
uniform mat4 uPortalViewProjection; // fixed portal camera (to project the traced point)
uniform float uHingeX;           // local x of the hinge edge of the screen
uniform float uEdgeX;            // local x of the outer edge of the screen
uniform float uHalfHeight;       // local half height of the screen
uniform float uCornerRadius;     // radius of the rounded outer corners
uniform float uBezel;            // width of the black outline along the three outer edges
uniform bool uBackAsFront;       // back screen of a half that never folds: same view as the front
uniform samplerCube uEnvMap;     // surroundings reflected by the glass (linear HDR)
uniform float uGlassStrength;    // 0 = no reflection, 1 = physically plausible glass
uniform float uGlassGloss;       // 0 = mirror sharp, higher = blurrier reflection
uniform float uGlassThickness;   // glass layer over the display (world units): refraction shifts the image at angles
uniform float uGlassIor;         // index of refraction of that glass (1.5 = glass)
uniform float uGlassDispersion;  // RGB split: red bends by (ior - this), blue by (ior + this); 0 = no fringes
uniform float uFrostDispersion;  // RGB split tied to the frost: red/blue shifted by this many blur sigmas along the pane
uniform float uSigmaUv;          // sigma of blur level 1, in portal uv units (doubles per level)
uniform vec3 uPortalEye;         // the viewpoint the screens are made for: frontal, moved a bit with the hinge angle

varying vec3 vLocal;
varying float vIsBack;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vTangentX;
varying vec3 vTangentY;
varying vec4 vPortalClip;
varying vec4 vFlatClip;
varying vec4 vFlatClipBack;

float weight(float level, float i) {
  return max(0.0, 1.0 - abs(level - i));
}

// signed distance to a rounded box of half size b and corner radius r, centered at 0
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Portal lookup of this face, made for the frontal viewpoint: between the flat lookup (the
// pane's own slice of the picture) and the real projection of the folded pane (uPerspective).
// Past 90° a pane leans over the hinge and would read the other half's picture, mirrored:
// keep the lookup on this face's own side of the hinge (the hinge is x = 0 of the frame).
float ownSide(float x) {
  return uLookupSide < 0.0 ? min(x, 0.0) : max(x, 0.0);
}

vec2 fixedLookupUv(vec4 flatClip) {
  vec2 folded = vPortalClip.xy / vPortalClip.w;
  folded.x = ownSide(folded.x);
  vec2 resting = flatClip.xy / flatClip.w;
  return mix(resting, folded, uPerspective) * 0.5 + 0.5;
}

// Angle-aware lookup: the ray from the eye (the fixed viewpoint, moved a little around the
// phone with the hinge angle) through this pixel, continued down to the face's window
// plane, then projected through the portal camera. Depends on the fold only.
vec2 viewLookupUv() {
  vec3 V = normalize(vWorldPosition - uPortalEye);
  float vz = abs(V.z) < 1e-4 ? (V.z < 0.0 ? -1e-4 : 1e-4) : V.z;
  float t = (uWindowZ - vWorldPosition.z) / vz;
  vec3 hit = vWorldPosition + V * t;                 // on the window plane
  hit.x = ownSide(hit.x);
  vec4 clip = uPortalViewProjection * vec4(hit.x, hit.y, 0.0, 1.0); // window plane <-> image plane
  return clip.xy / clip.w * 0.5 + 0.5;
}

vec2 lookupUv(vec4 flatClip, float track) {
  return mix(fixedLookupUv(flatClip), viewLookupUv(), track);
}

// Refraction through the glass layer: where the ray from the FIXED viewpoint, bent at the
// surface, reaches the display under it, as an offset in the slab's local x/y (world units).
// Like everything the screen shows, it does not know where the real viewer is, so the
// shift and the colour fringes are glued to the pane and only change with the fold.
vec2 refractionOffset(float ior) {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(uPortalEye - vWorldPosition);
  vec3 R = refract(-V, N, 1.0 / ior);                  // ray inside the glass
  float depth = max(dot(R, -N), 1e-3);                 // how fast it sinks toward the display
  vec3 hit = R * (uGlassThickness / depth);           // point reached on the display plane
  vec3 offset = hit + N * uGlassThickness;            // minus the straight-down foot: in-plane shift
  return vec2(dot(offset, vTangentX), dot(offset, vTangentY));
}

// the blur levels blended at `level`, sampled at uv (premultiplied color + alpha)
vec4 sampleBlur(vec2 uv, float level) {
  return texture2D(uLevel0, uv) * weight(level, 0.0)
    + texture2D(uLevel1, uv) * weight(level, 1.0)
    + texture2D(uLevel2, uv) * weight(level, 2.0)
    + texture2D(uLevel3, uv) * weight(level, 3.0)
    + texture2D(uLevel4, uv) * weight(level, 4.0)
    + texture2D(uLevel5, uv) * weight(level, 5.0)
    + texture2D(uLevel6, uv) * weight(level, 6.0);
}

// frosted window: the frost amount (0..1) grows with the distance between this pixel and
// the window plane; it drives the blur and every colour split
float frostAmount() {
  float distance = abs(vWorldPosition.z - uWindowZ);
  return pow(clamp(distance / uFrostDistance, 0.0, 1.0), uBlurExp);
}

vec4 renderFace(vec2 uv, float blackout) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);

  float distance = abs(vWorldPosition.z - uWindowZ);
  float amount = frostAmount();
  // blur radius doubles per level, so use a log curve to make the radius grow linearly
  float level = log2(1.0 + amount * (exp2(uMaxLevel) - 1.0));

  // Frost dispersion: the colours separate along the pane by a fraction of the local blur
  // radius (none where sharp, wide where blurred), so the fringes stay visible in the blur.
  float sigma = uSigmaUv * (exp2(level) - 1.0);
  vec2 split = vec2(sign(uEdgeX - uHingeX) * uFrostDispersion * sigma, 0.0);
  vec4 blurred = sampleBlur(uv, level);
  blurred.r = sampleBlur(uv - split, level).r;
  blurred.b = sampleBlur(uv + split, level).b;

  // Expanding blur: un-premultiply so the colors reach past the display edge, then cover
  // with the blurred alpha pushed toward 1 (the more expand, the further the halo reaches).
  float alpha = blurred.a;
  vec3 unpremultiplied = blurred.rgb / max(alpha, 1e-4);
  float coverage = smoothstep(0.0, 1.0, min(1.0, alpha / mix(1.0, 0.04, uBlurExpand)));

  // Real frosted glass: the farther from the window, the more the image loses contrast
  // toward the glass's own diffuse tone (not toward black).
  // Both follow an exponential decay with distance (like attenuation along a light guide):
  // smooth everywhere, never a hard cut-off.
  float frost = (1.0 - exp(-pow(distance * uFrostPerUnit, uFrostExp))) * uFrostStrength;
  vec3 color = mix(unpremultiplied * coverage, uFrostColor, frost);
  // ...and less light makes it through: the light fades out with distance
  float light = exp(-pow(distance * uLightLossPerUnit, uLightLossExp));
  light = clamp((light - uLightBlackPoint) / (1.0 - uLightBlackPoint), 0.0, 1.0); // true black at the tail
  color *= light;

  // and past the blackout angle the display is simply off
  light *= 1.0 - blackout;
  return vec4(color * (1.0 - blackout), light); // alpha carries the light for the sheen
}

// Glass on top of the display: Schlick Fresnel (4% head-on, up to 100% at grazing angles)
// blending the reflected surroundings over the screen content.
vec3 glass(vec3 content, float light) {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 R = reflect(-V, N);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 env = textureCube(uEnvMap, R, uGlassGloss).rgb;
  env = env / (1.0 + env); // simple tone mapping of the HDR surroundings
  // the sheen dims with the light, so the dark side does not glow with reflections
  float strength = uGlassStrength * mix(uGlassOnDark, 1.0, light);
  return mix(content, env, fresnel * strength);
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

  // Lookup for this face, shifted by the refraction. The world-space shift is converted
  // into a lookup shift with the screen-space derivatives (the Jacobian of uv vs local
  // position), so it stays exact under the fold. Computed before any
  // branching, as derivatives require.
  bool back = vIsBack > 0.5 && !uBackAsFront;
  vec2 uv = back ? lookupUv(vFlatClipBack, uViewTrackBack) : lookupUv(vFlatClip, uViewTrack);
  mat2 dLocal = mat2(dFdx(vLocal.xy), dFdy(vLocal.xy)); // columns: d local / d screen x, y
  mat2 dUv = mat2(dFdx(uv), dFdy(uv));
  // dispersion: each channel refracts with its own index, so edges split into colour fringes
  vec2 uvR = uv, uvG = uv, uvB = uv;
  if (abs(determinant(dLocal)) > 1e-12) {                 // not edge-on
    mat2 jacobian = dUv * inverse(dLocal);                // d uv / d local
    // the refraction split is scaled by the frost amount too: no fringes where the blur is zero
    float dispersion = uGlassDispersion * frostAmount();
    uvR += jacobian * refractionOffset(uGlassIor - dispersion);
    uvG += jacobian * refractionOffset(uGlassIor);
    uvB += jacobian * refractionOffset(uGlassIor + dispersion);
  }

  vec3 content = vec3(0.0);
  float light = 1.0;
  if (d <= -uBezel && !onHingeEdge) {
    float blackout = back ? uBlackoutBack : uBlackout;
    vec4 faceG = renderFace(uvG, blackout);
    content = vec3(renderFace(uvR, blackout).r, faceG.g, renderFace(uvB, blackout).b);
    light = faceG.a;
  }

  gl_FragColor = vec4(glass(content, light), 1.0); // the glass covers the bezel too
  #include <colorspace_fragment>
}
