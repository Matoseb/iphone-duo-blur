varying vec2 vUv;
varying vec2 vLocal;

void main() {
  vUv = uv;
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
