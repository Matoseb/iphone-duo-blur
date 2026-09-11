// Halo behind the display: the masked image, very blurred (premultiplied, so it fades out
// with distance from the display in every direction), dimmed.
uniform sampler2D uGlow;      // the blurred masked image, frame-aligned
uniform float uStrength;      // brightness of the halo (0 = none, 1 = as bright as the image)

varying vec2 vUv;

void main() {
  gl_FragColor = vec4(texture2D(uGlow, vUv).rgb * uStrength, 1.0);
  #include <colorspace_fragment>
}
