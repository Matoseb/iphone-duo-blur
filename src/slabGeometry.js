import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A slim slab for one half of the phone, centered at the origin:
 *   x in [-width/2, width/2], y in [-height/2, height/2], z in [-thickness/2, thickness/2].
 * Its outline has big rounded corners on the outer side (like a phone or laptop display)
 * and square corners on the hinge side (x = hingeSide * width/2), so the two halves meet
 * flush when unfolded. Every edge between the faces and the rim carries a small chamfer,
 * except along the hinge line, the two hinge-side corners of the outline get a thin cut of
 * the same size, and normals are smoothed so it all shades without facets.
 *
 * Material groups: 0 = front face (+z), 1 = the rim, 2 = back face (-z).
 */
export function createSlabGeometry({
  width, height, thickness, cornerRadius, hingeSide, edgeChamfer = 0, cornerSegments = 16,
}) {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(cornerRadius, hw, hh);

  const xh = hingeSide * hw;   // hinge x
  const xo = -hingeSide * hw;  // outer edge x
  const cx = xo + hingeSide * r; // x of the corner arc centers
  const c = Math.min(edgeChamfer, thickness * 0.45, r * 0.5); // chamfer size

  // outline, going around: hinge bottom -> outer bottom corner -> outer top corner -> hinge top.
  // The two hinge-side corners get a thin diagonal cut of the chamfer size.
  const points = [new THREE.Vector2(xh, -hh + c), new THREE.Vector2(xh - hingeSide * c, -hh)];
  const arc = (cy, from, to) => {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = from + (to - from) * (i / cornerSegments);
      points.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  // angle pointing from a corner center toward the outer edge
  const outward = hingeSide > 0 ? Math.PI : 0;
  arc(-hh + r, -Math.PI / 2, -Math.PI / 2 + (outward === Math.PI ? -Math.PI / 2 : Math.PI / 2));
  arc(hh - r, outward, outward + (outward === Math.PI ? -Math.PI / 2 : Math.PI / 2));
  points.push(new THREE.Vector2(xh - hingeSide * c, hh), new THREE.Vector2(xh, hh - c));

  const shape = new THREE.Shape(points);
  // Chamfer: the bevel is offset inward so the overall footprint stays exactly the outline,
  // and the depth is reduced so the overall thickness stays exactly `thickness`.
  const depth = thickness - 2 * c;
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: c > 0,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 3,
  });
  extruded.translate(0, 0, -depth / 2);

  // No chamfer along the hinge line: the bevel pulled the vertices of that edge inward by up
  // to `c`; push them back onto the hinge plane. The bevel strip there collapses into a flat
  // hinge face, so the two halves' screens meet flush when the phone is open. The y test
  // keeps the vertices of the small corner cuts (|y| up to hh) out of it.
  const pos = extruded.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const onHingeLine = Math.abs(pos.getX(i) - xh) <= c + 1e-6 && Math.abs(pos.getY(i)) <= hh - c + 1e-6;
    if (onHingeLine) pos.setX(i, xh);
  }

  // ExtrudeGeometry puts both caps in one group (back cap first, then front cap, same
  // count) and the sides in a second one. Split the caps so each face can get its own material.
  const [caps, sides] = extruded.groups;
  const capCount = caps.count / 2;
  extruded.clearGroups();
  extruded.addGroup(caps.start, capCount, 2);            // back (z = -thickness/2)
  extruded.addGroup(caps.start + capCount, capCount, 0); // front (z = +thickness/2)
  extruded.addGroup(sides.start, sides.count, 1);        // rim and chamfers

  // Smooth shading: weld the vertices shared by neighbouring faces (drop the per-face
  // normals and uvs first, so welding is by position only), then average the normals.
  // The merged index keeps the original vertex order, so the groups above stay valid.
  extruded.deleteAttribute('normal');
  extruded.deleteAttribute('uv');
  const geometry = mergeVertices(extruded);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  // the screens are the caps, inset from the outline by the chamfer
  return {
    geometry,
    screen: {
      hingeX: xh,                  // flush at the hinge (no chamfer there)
      edgeX: xo + hingeSide * c,
      halfHeight: hh - c,
      cornerRadius: r - c,
    },
  };
}
