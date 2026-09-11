// Halo behind the display: the masked image, very blurred (premultiplied, so it fades out
// with distance from the display in every direction), dimmed.
uniform sampler2D uGlow;      // the blurred masked image, frame-aligned
uniform float uStrength;      // brightness of the halo (0 = none, 1 = as bright as the image)

varying vec2 vUv;

void main() {
  // premultiplied, alpha included: where there is no halo the frame stays transparent, so
  // the panes treat it as "no picture" (black) rather than as a covered, tintable surface
  vec4 glow = texture2D(uGlow, vUv) * uStrength;
  gl_FragColor = glow;
  #include <colorspace_fragment>
}
