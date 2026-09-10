// The unfolded image as it appears on the display: fitted to cover the display area,
// masked to its rounded rectangle, and darkened per half BEFORE the blur chain runs
// (the front screens' fade to black is applied here, in image space, so the blur smears it).
uniform sampler2D uMap;
uniform vec2 uUvScale;        // < 1 on the axis where the image overflows (object-fit: cover)
uniform vec2 uHalfSize;       // display half size
uniform float uRadius;        // display corner radius
uniform float uDarkLeft;      // darkness progress of the left half (0 = none, 1 = all dark)
uniform float uDarkRight;     // same for the right half
uniform float uDarkSpread;    // how far the outer edge leads the hinge
uniform float uFadeToBlack;   // 0 = none, 1 = fully black
uniform float uDarkExp;       // exponent shaping the darkening: 1 = as is, > 1 = slow start, steep end

varying vec2 vUv;
varying vec2 vLocal;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  if (sdRoundedBox(vLocal, uHalfSize, uRadius) > 0.0) discard;
  vec2 uv = (vUv - 0.5) * uUvScale + 0.5;
  vec4 color = texture2D(uMap, uv);

  // one darkness gradient per half across its width, outer edge leading (the hinge is x = 0)
  float progress = vLocal.x < 0.0 ? uDarkLeft : uDarkRight;
  float distanceFromHinge = clamp(abs(vLocal.x) / uHalfSize.x, 0.0, 1.0);
  float g = uDarkSpread;
  float fade = progress * (1.0 + g) - g * (1.0 - distanceFromHinge);
  fade = pow(smoothstep(0.0, 1.0, fade), uDarkExp) * uFadeToBlack;

  gl_FragColor = vec4(color.rgb * (1.0 - fade), 1.0);
  #include <colorspace_fragment>
}
