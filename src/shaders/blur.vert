uniform mat4 uPortalViewProjection; // fixed portal camera
uniform mat4 uStretchMatrix;        // pane world matrix at the front's "virtual" fold angle
uniform mat4 uStretchMatrixBack;    // pane world matrix at the back's "virtual" fold angle
uniform float uWindowZ;             // world z of the window plane this face rests on when flat

varying vec3 vLocal;                // position on the slab, in its local coordinates
varying float vIsBack;              // 1 on the back screen, 0 on the front
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vPortalClip;           // this point, really folded, as seen by the portal camera
varying vec4 vStretchClip;          // front: virtually folded, as seen by the portal camera
varying vec4 vStretchClipBack;      // back: virtually folded (measured from fully closed)

void main() {
  vLocal = position;
  vIsBack = normal.z < 0.0 ? 1.0 : 0.0;
  vec4 local = vec4(position, 1.0);
  vec4 worldPosition = modelMatrix * local;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  // Project through the portal camera as if this face lay on the portal image plane (z = 0)
  // when flat: shift by its window plane, otherwise the face's height above that plane
  // would magnify the lookup slightly and its edges would sample outside the display.
  vec4 onWindow = vec4(0.0, 0.0, -uWindowZ, 0.0);
  vPortalClip = uPortalViewProjection * (worldPosition + onWindow);
  vStretchClip = uPortalViewProjection * (uStretchMatrix * local + onWindow);
  vStretchClipBack = uPortalViewProjection * (uStretchMatrixBack * local + onWindow);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
