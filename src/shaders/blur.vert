uniform mat4 uPortalViewProjection; // fixed portal camera
uniform mat4 uStretchMatrix;        // pane world matrix at the front's "virtual" fold angle
uniform mat4 uStretchMatrixBack;    // pane world matrix at the back's "virtual" fold angle

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
  vPortalClip = uPortalViewProjection * worldPosition;
  vStretchClip = uPortalViewProjection * uStretchMatrix * local;
  vStretchClipBack = uPortalViewProjection * uStretchMatrixBack * local;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
