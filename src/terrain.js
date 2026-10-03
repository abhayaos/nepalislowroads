import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { roadCenterX, roadHeight, ROAD_HALF } from './road.js';

const CHUNK = 120;      // chunk size in meters
const SEGS = 32;        // verts per side (33x33 = 1089 verts/chunk)
const GRID_X = 5;       // chunks wide  (5*120 = 600m)
const GRID_Z_BACK = 2;  // chunks behind
const GRID_Z_FWD = 5;   // chunks ahead

export const WATER_Y = -3.2;
export const SNOW_LIFT = 48; // snow/treeline height above local road level

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const BIOMES = {
  hills:   { amp: 14, grass: new THREE.Color(0x5fa860), dry: new THREE.Color(0x86a94f), lush: new THREE.Color(0x3e7d3a), sand: new THREE.Color(0xb5a06a), rock: new THREE.Color(0x8a8578), snow: new THREE.Color(0xf2f5f7) },
  forest:  { amp: 12, grass: new THREE.Color(0x3f8f4f), dry: new THREE.Color(0x2e7a44), lush: new THREE.Color(0x256b33), sand: new THREE.Color(0x8a7a55), rock: new THREE.Color(0x7d7a72), snow: new THREE.Color(0xeef3f6) },
  desert:  { amp: 8,  grass: new THREE.Color(0xd9b06a), dry: new THREE.Color(0xc08a4e), lush: new THREE.Color(0x9a7a42), sand: new THREE.Color(0xe6c584), rock: new THREE.Color(0xa97a52), snow: null },
  coast:   { amp: 6,  grass: new THREE.Color(0x7fae62), dry: new THREE.Color(0xa8b06a), lush: new THREE.Color(0x4f8f4a), sand: new THREE.Color(0xe6d49a), rock: new THREE.Color(0x8d8a7c), snow: null },
};

export class TerrainManager {
  constructor(scene, biome = 'hills') {
    this.scene = scene;
    this.noise = createNoise2D();
    this.noise2 = createNoise2D();
    this.biomeName = biome;
    this.biome = BIOMES[biome];
    this.chunks = new Map(); // key "ix,iz" -> mesh
    this.queue = [];         // pending paint jobs (throttled)
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
    this.water.position.y = WATER_Y;
    this.water.visible = biome === 'coast';
    scene.add(this.water);
  }

  setBiome(name) {
    if (!BIOMES[name]) return;
    this.biomeName = name;
    this.biome = BIOMES[name];
    this.water.visible = name === 'coast';
    // recolor existing chunks for the new palette (heights unchanged)
    for (const mesh of this.chunks.values()) this.paintChunk(mesh);
  }

  // 4-octave fractal Brownian motion, roughly in [-1, 1]
  fbm(nx, x, z) {
    return (
      nx(x, z) +
      0.5 * nx(x * 2.13 + 5.2, z * 2.13 + 1.3) +
      0.25 * nx(x * 4.31 + 9.1, z * 4.31 + 7.7) +
      0.125 * nx(x * 8.17 + 3.4, z * 8.17 + 9.2)
    ) / 1.875;
  }

  getHeight(x, z) {
    const b = this.biome;
    const cx = roadCenterX(z);
    const rh = roadHeight(z);
    const d = Math.abs(x - cx);

    // rolling valley floor — gentle everywhere, road sits in a valley
    const roll = this.fbm(this.noise, x * 0.008, z * 0.008) * b.amp;
    // small detail bumps
    const det = this.noise2(x * 0.045, z * 0.045) * b.amp * 0.1;
    // mid-ground undulation, grows with distance from road
    const mid = this.fbm(this.noise2, x * 0.003 + 40.7, z * 0.003 - 17.3) * 26 * smoothstep(60, 300, d);
    // ridged mountain field, far from the road only
    const r = 1 - Math.abs(this.noise(x * 0.0016 + 13.7, z * 0.0016 - 4.2));
    const mountains = r * r * 150 * smoothstep(120, 650, d);

    let h = rh + roll + det + mid + mountains;
    if (this.biomeName === 'coast') h -= 5 * smoothstep(ROAD_HALF + 1, 30, d);

    // carve the road bench so terrain tucks just under the ribbon
    const t = smoothstep(ROAD_HALF + 1.5, 34, d); // 0 on road → 1 off road
    return (rh - 0.15) * (1 - t) + h * t;
  }

  paintChunk(mesh) {
    const pos = mesh.geometry.attributes.position;
    const colAttr = mesh.geometry.attributes.color;
    const wx0 = mesh.position.x;
    const wz0 = mesh.position.z;

    // 1. displace
    for (let i = 0; i < pos.count; i++) {
      const wx = wx0 + pos.getX(i);
      const wz = wz0 + pos.getZ(i);
      pos.setY(i, this.getHeight(wx, wz)); // mesh sits at y=0
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();

    // 2. color using height + slope (normal.y) — slowroads look:
    //    sand shoulders & beaches, grass variation, rock on steeps, snow caps
    const b = this.biome;
    const norm = mesh.geometry.attributes.normal;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = wx0 + pos.getX(i);
      const wz = wz0 + pos.getZ(i);
      const h = pos.getY(i);
      const ny = norm.getY(i);
      const rh = roadHeight(wz);

      const v = this.noise2(wx * 0.02, wz * 0.02) * 0.5 + 0.5;
      tmp.copy(b.grass).lerp(b.dry, v);
      if (this.biomeName === 'desert') tmp.lerp(b.sand, 0.45);

      // sandy shoulders hugging the road + beaches near water
      if (h < rh + 0.9) tmp.lerp(b.sand, 0.55);
      if (h < WATER_Y + 0.7) tmp.copy(b.sand);

      // lush valley floors — vegetation hugs the low moist ground
      if (ny > 0.85 && h > rh + 0.9 && h < rh + 4) tmp.lerp(b.lush, 0.5);

      // exposed rock on steep faces
      const steep = 1 - smoothstep(0.72, 0.86, ny);
      tmp.lerp(b.rock, steep * 0.9);

      // snow caps on high gentle slopes (no snow in desert/coast)
      if (b.snow && ny > 0.78 && h > rh + SNOW_LIFT) {
        tmp.lerp(b.snow, smoothstep(rh + SNOW_LIFT, rh + SNOW_LIFT + 18, h));
      }

      // per-vertex shade jitter for low-poly charm
      const shade = 0.9 + 0.1 * this.noise(wx * 0.11, wz * 0.11);
      colAttr.setXYZ(i, tmp.r * shade, tmp.g * shade, tmp.b * shade);
    }
    colAttr.needsUpdate = true;
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
    // drop far chunks
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
      mesh.position.set(ix * CHUNK, 0, iz * CHUNK);
      this.paintChunk(mesh);
      this.chunks.set(key, mesh);
    }
    this.water.position.x = busX;
    this.water.position.z = busZ + 200;
  }
}
