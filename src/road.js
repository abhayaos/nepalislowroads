import * as THREE from 'three';

export const ROAD_HALF = 4.5; // half-width in meters (9m wide — bus friendly)
const AHEAD = 700;
const BEHIND = 120;
const STEP = 5;

// Analytic endless road centre — sum of sines gives slowroads-like curves.
// x_center(z) — road runs along +Z/-Z forever, no spline bookkeeping needed.
export function roadCenterX(z) {
  return 25 * Math.sin(z * 0.008) + 12 * Math.sin(z * 0.021 + 1.3);
}

export function roadCenterDX(z) {
  // derivative dx/dz
  return 25 * 0.008 * Math.cos(z * 0.008) + 12 * 0.021 * Math.cos(z * 0.021 + 1.3);
}

export function roadHeight(z) {
  return 3.0 * Math.sin(z * 0.005 + 0.5) + 1.5 * Math.sin(z * 0.013 + 2.0);
}

// Yaw such that forward = (sin(yaw), 0, cos(yaw)) follows the road toward +Z
export function roadHeading(z) {
  return Math.atan2(roadCenterDX(z), 1);
}

export function distanceToRoad(x, z) {
  return Math.abs(x - roadCenterX(z));
}

export function createRoad(scene) {
  const COUNT = Math.floor((AHEAD + BEHIND) / STEP); // stations
  // 4 verts per station: leftEdge | leftLane | rightLane | rightEdge
  const widths = [-ROAD_HALF - 0.5, -ROAD_HALF + 0.4, ROAD_HALF - 0.4, ROAD_HALF + 0.5];
  const colors = [
    [0.92, 0.92, 0.92], // edge line white
    [0.16, 0.16, 0.18], // asphalt
    [0.16, 0.16, 0.18],
    [0.92, 0.92, 0.92],
  ];

  const positions = new Float32Array(COUNT * 4 * 3);
  const vcolors = new Float32Array(COUNT * 4 * 3);
  const indices = [];
  for (let i = 0; i < COUNT - 1; i++) {
    for (let k = 0; k < 3; k++) {
      const a = i * 4 + k;
      const b = a + 1;
      const c = a + 4;
      const d = a + 5;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(vcolors, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  let lastBuiltZ = Infinity;

  function build(busZ) {
    if (Math.abs(busZ - lastBuiltZ) < 2) return; // throttle rebuilds
    lastBuiltZ = busZ;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    for (let i = 0; i < COUNT; i++) {
      const z = busZ - BEHIND + i * STEP;
      const cx = roadCenterX(z);
      const y = roadHeight(z) + 0.12;
      const dx = roadCenterDX(z);
      const len = Math.hypot(dx, 1);
      // side vector in xz = (1, -dx)/len
      const sx = 1 / len;
      const sz = -dx / len;
      for (let k = 0; k < 4; k++) {
        const vi = (i * 4 + k) * 3;
        pos[vi] = cx + sx * widths[k];
        pos[vi + 1] = y + (k === 1 || k === 2 ? 0 : 0.02);
        pos[vi + 2] = z + sz * widths[k];
        col[vi] = colors[k][0];
        col[vi + 1] = colors[k][1];
        col[vi + 2] = colors[k][2];
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  return { mesh, update: build };
}
