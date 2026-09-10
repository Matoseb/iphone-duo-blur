// One separable Gaussian pass (9 taps). uDirection = (1,0) horizontal, (0,1) vertical.
uniform sampler2D uSource;
uniform vec2 uTexel;      // 1 / source size
uniform vec2 uDirection;

varying vec2 vUv;

void main() {
  vec2 step = uDirection * uTexel;
  vec4 color = texture2D(uSource, vUv) * 0.2270270270;
  color += (texture2D(uSource, vUv + step * 1.0) + texture2D(uSource, vUv - step * 1.0)) * 0.1945945946;
  color += (texture2D(uSource, vUv + step * 2.0) + texture2D(uSource, vUv - step * 2.0)) * 0.1216216216;
  color += (texture2D(uSource, vUv + step * 3.0) + texture2D(uSource, vUv - step * 3.0)) * 0.0540540541;
  color += (texture2D(uSource, vUv + step * 4.0) + texture2D(uSource, vUv - step * 4.0)) * 0.0162162162;
  gl_FragColor = color;
}
