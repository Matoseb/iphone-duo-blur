// The unfolded image as it appears on the display: fitted to cover the display area and
// masked to its rounded rectangle.
uniform sampler2D uMap;
uniform vec2 uUvScale;        // < 1 on the axis where the image overflows (object-fit: cover)
uniform vec2 uHalfSize;       // display half size
uniform float uRadius;        // display corner radius

varying vec2 vUv;
varying vec2 vLocal;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  if (sdRoundedBox(vLocal, uHalfSize, uRadius) > 0.0) discard;
  vec2 uv = (vUv - 0.5) * uUvScale + 0.5;
  gl_FragColor = vec4(texture2D(uMap, uv).rgb, 1.0);
  #include <colorspace_fragment>
}
