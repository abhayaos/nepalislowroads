import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { roadCenterX, roadHeight, ROAD_HALF } from './road.js';

const CHUNK = 120;      // chunk size in meters
const SEGS = 24;        // verts per side (25x25 = 625 verts/chunk)
const GRID_X = 5;       // chunks wide  (5*120 = 600m)
const GRID_Z_BACK = 2;  // chunks behind
const GRID_Z_FWD = 5;   // chunks ahead  (8 rows * 120 = 960m coverage)

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const BIOMES = {
  hills:   { amp: 14, base: new THREE.Color(0x5fa860), dry: new THREE.Color(0x7fae5f), sand: new THREE.Color(0xb5a06a) },
  forest:  { amp: 12, base: new THREE.Color(0x3f8f4f), dry: new THREE.Color(0x2f7a3e), sand: new THREE.Color(0x8a7a55) },
  desert:  { amp: 8,  base: new THREE.Color(0xd9b06a), dry: new THREE.Color(0xc99a55), sand: new THREE.Color(0xe0c080) },
  coast:   { amp: 6,  base: new THREE.Color(0x9fb87a), dry: new THREE.Color(0xc2b280), sand: new THREE.Color(0xe6d49a) },
};

export class TerrainManager {
  constructor(scene, biome = 'hills') {
    this.scene = scene;
    this.noise = createNoise2D();
    this.noise2 = createNoise2D();
    this.biomeName = biome;
    this.biome = BIOMES[biome];
    this.chunks = new Map(); // key "ix,iz" -> mesh
    this.queue = [];         // pending reposition jobs (throttled)
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      metalness: 0,
    });

    // water plane for coast biome
    const wgeo = new THREE.PlaneGeometry(4000, 4000);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      wgeo,
      new THREE.MeshStandardMaterial({ color: 0x2e7fbf, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.9 })
    );
    this.water.position.y = -3.2;
    this.water.visible = biome === 'coast';
    scene.add(this.water);
  }

  setBiome(name) {
    if (!BIOMES[name]) return;
    this.biomeName = name;
    this.biome = BIOMES[name];
    this.water.visible = name === 'coast';
    // force rebuild all chunks
    for (const mesh of this.chunks.values()) this.paintChunk(mesh, true);
  }

  getBaseNoise(x, z) {
    const b = this.biome;
    let n = this.noise(x * 0.008, z * 0.008) * b.amp
          + this.noise2(x * 0.03, z * 0.03) * (b.amp * 0.22);
    if (this.biomeName === 'coast') n -= 4.5;
    return n;
  }

  getHeight(x, z) {
    const cx = roadCenterX(z);
    const rh = roadHeight(z);
    const d = Math.abs(x - cx);
    const base = this.getBaseNoise(x, z);
    const t = smoothstep(ROAD_HALF + 2, 32, d); // 0 on road → 1 off road
    return rh + base * t;
  }

  paintChunk(mesh, force = false) {
    const pos = mesh.geometry.attributes.position;
    const colAttr = mesh.geometry.attributes.color;
    const wx0 = mesh.position.x;
    const wz0 = mesh.position.z;
    const cBase = this.biome.base;
    const cDry = this.biome.dry;
    const cSand = this.biome.sand;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = wx0 + lx;
      const wz = wz0 + lz;
      const h = this.getHeight(wx, wz);
      pos.setY(i, h - mesh.position.y); // mesh at y=0, keep simple
      // color by noise + height
      const v = this.noise2(wx * 0.02, wz * 0.02) * 0.5 + 0.5;
      tmp.copy(cBase).lerp(cDry, v);
      if (h < roadHeight(wz) + 0.6) tmp.lerp(cSand, 0.5); // sandy shoulder
      if (this.biomeName === 'desert') tmp.lerp(cSand, 0.35);
      const shade = 0.92 + 0.08 * this.noise(wx * 0.11, wz * 0.11);
      colAttr.setXYZ(i, tmp.r * shade, tmp.g * shade, tmp.b * shade);
    }
    pos.needsUpdate = true;
    colAttr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }

  makeChunk() {
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    return mesh;
  }

  update(busX, busZ) {
    const cix = Math.floor(busX / CHUNK);
    const ciz = Math.floor(busZ / CHUNK);
    const want = new Set();
    for (let dx = -Math.floor(GRID_X / 2); dx <= Math.floor(GRID_X / 2); dx++) {
      for (let dz = -GRID_Z_BACK; dz <= GRID_Z_FWD; dz++) {
        want.add(`${cix + dx},${ciz + dz}`);
      }
    }
    // remove far chunks (keep pool small — reuse oldest)
    for (const [key, mesh] of this.chunks) {
      if (!want.has(key)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }
    // queue missing
    for (const key of want) {
      if (!this.chunks.has(key) && !this.queue.includes(key)) this.queue.push(key);
    }
    // paint max 2 per frame to avoid hitches
    let budget = 2;
    while (budget-- > 0 && this.queue.length) {
      const key = this.queue.shift();
      if (this.chunks.has(key)) continue;
      const [ix, iz] = key.split(',').map(Number);
      const mesh = this.makeChunk();
      mesh.position.set(ix * CHUNK + CHUNK / 2 - 60, 0, iz * CHUNK + CHUNK / 2 - 60);
      // NOTE: position snapped so chunk covers [ix*CHUNK-60, ...] — align to grid
      mesh.position.set(ix * CHUNK, 0, iz * CHUNK);
      this.paintChunk(mesh);
      this.chunks.set(key, mesh);
    }
    this.water.position.x = busX;
    this.water.position.z = busZ + 200;
  }
}
