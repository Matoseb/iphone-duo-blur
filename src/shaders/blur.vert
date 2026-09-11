uniform mat4 uPortalViewProjection; // fixed portal camera
uniform mat4 uStretchMatrix;        // pane world matrix at the front's "virtual" fold angle
uniform mat4 uStretchMatrixBack;    // pane world matrix at the back's "virtual" fold angle
uniform mat4 uFlatMatrix;           // pane world matrix when flat against the window (front: open)
uniform mat4 uFlatMatrixBack;       // same for the back (fully closed)
uniform float uWindowZ;             // world z of the window plane this face rests on when flat

varying vec3 vLocal;                // position on the slab, in its local coordinates
varying float vIsBack;              // 1 on the back screen, 0 on the front
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vTangentX;             // the slab's local x axis, in world space
varying vec3 vTangentY;             // the slab's local y axis, in world space
varying vec4 vPortalClip;           // this point, really folded, as seen by the portal camera
varying vec4 vStretchClip;          // front: virtually folded, as seen by the portal camera
varying vec4 vStretchClipBack;      // back: virtually folded (measured from fully closed)
varying vec4 vFlatClip;             // front: as if flat against the window
varying vec4 vFlatClipBack;         // back: as if flat against the window (closed)

void main() {
  vLocal = position;
  vIsBack = normal.z < 0.0 ? 1.0 : 0.0;
  vec4 local = vec4(position, 1.0);
  vec4 worldPosition = modelMatrix * local;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vTangentX = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
  vTangentY = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  // Project through the portal camera as if this face lay on the portal image plane (z = 0)
  // when flat: shift by its window plane, otherwise the face's height above that plane
  // would magnify the lookup slightly and its edges would sample outside the display.
  vec4 onWindow = vec4(0.0, 0.0, -uWindowZ, 0.0);
  vPortalClip = uPortalViewProjection * (worldPosition + onWindow);
  vStretchClip = uPortalViewProjection * (uStretchMatrix * local + onWindow);
  vStretchClipBack = uPortalViewProjection * (uStretchMatrixBack * local + onWindow);
  vFlatClip = uPortalViewProjection * (uFlatMatrix * local + onWindow);
  vFlatClipBack = uPortalViewProjection * (uFlatMatrixBack * local + onWindow);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
