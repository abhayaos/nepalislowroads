import * as THREE from 'three';
import { roadCenterX } from './road.js';

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// --- sky / weather / time presets (slowroads-like mood controls) ---
export const TIME_PRESETS = {
  sunrise: { sun: 12, sky: 0xbfd9e8, fog: 0xcfd8e2, hemi: 0.7, sunI: 2.2, bg: 0xcfd8e2, night: false },
  noon:    { sun: 75, sky: 0x87ceeb, fog: 0xa8d0e6, hemi: 0.9, sunI: 3.0, bg: 0x87ceeb, night: false },
  sunset:  { sun: 10, sky: 0xe8975a, fog: 0xd98a5e, hemi: 0.55, sunI: 1.8, bg: 0xe8975a, night: false },
  night:   { sun: -20, sky: 0x0b1026, fog: 0x0b1026, hemi: 0.25, sunI: 0.4, bg: 0x0b1026, night: true },
};

export const WEATHERS = {
  clear: { fogMul: 1, rain: false },
  fog:   { fogMul: 0.35, rain: false },
  rain:  { fogMul: 0.7, rain: true },
};

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6a7a5a, 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0xa8d0e6, 60, 900);
    scene.background = new THREE.Color(0x87ceeb);
    this.time = 'noon';
    this.weather = 'clear';
    this.sunDir = new THREE.Vector3(0.5, 1, 0.3).normalize();

    // rain particles (hidden unless weather=rain)
    const N = 900;
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 60;
      p[i * 3 + 1] = Math.random() * 30;
      p[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.15, transparent: true, opacity: 0.7 }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    this.apply('noon', 'clear');
  }

  apply(time, weather) {
    this.time = time;
    this.weather = weather;
    const T = TIME_PRESETS[time];
    const W = WEATHERS[weather];
    this.scene.background.setHex(T.bg);
    this.scene.fog.color.setHex(T.fog);
    this.scene.fog.near = 60;
    this.scene.fog.far = 900 * W.fogMul;
    this.hemi.intensity = T.hemi;
    this.sun.intensity = T.sunI;
    this.sun.color.setHex(time === 'sunset' ? 0xffb36b : 0xffffff);
    this.sunDir = new THREE.Vector3(0.5, Math.tan(THREE.MathUtils.degToRad(Math.max(T.sun, 2))), 0.3).normalize();
    if (this.rain) this.rain.visible = W.rain;
    return T.night;
  }

  update(busPos, dt) {
    this.sun.position.copy(busPos).addScaledVector(this.sunDir, 220);
    this.sun.target.position.copy(busPos);
    if (this.rain.visible) {
      this.rain.position.set(busPos.x, busPos.y, busPos.z);
      const a = this.rain.geometry.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) {
        a[i] -= dt * 28;
        if (a[i] < 0) a[i] = 30;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// --- low-poly instanced scenery recycled endlessly around the bus ---
export class Props {
  constructor(scene, terrain, quality = 'high') {
    this.scene = scene;
    this.terrain = terrain;
    this.dummy = new THREE.Object3D();

    const treeN = quality === 'high' ? 340 : 170;
    const rockN = quality === 'high' ? 120 : 60;
    const houseN = 36;
    const lampN = 40;

    // trunks + canopies share transforms (two meshes, same matrices)
    this.trunkMesh = this.makeInstanced(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 5), new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1, flatShading: true }), treeN);
    this.leafMesh = this.makeInstanced(new THREE.IcosahedronGeometry(2.3, 0), new THREE.MeshStandardMaterial({ color: 0x3e8f4e, roughness: 1, flatShading: true }), treeN);
    this.rockMesh = this.makeInstanced(new THREE.DodecahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: 0x8d8d94, roughness: 1, flatShading: true }), rockN);
    this.houseMesh = this.makeInstanced(new THREE.BoxGeometry(6, 4, 5), new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 1, flatShading: true }), houseN);
    this.roofMesh = this.makeInstanced(new THREE.ConeGeometry(4.6, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0xa34a3a, roughness: 1, flatShading: true }), houseN);
    this.poleMesh = this.makeInstanced(new THREE.CylinderGeometry(0.12, 0.15, 7, 5), new THREE.MeshStandardMaterial({ color: 0x444a55, roughness: 0.8 }), lampN);
    this.lampMesh = this.makeInstanced(new THREE.SphereGeometry(0.35, 6, 5), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.9 }), lampN);

    this.trees = this.scatter(treeN, 14, 95, 0);
    this.rocks = this.scatter(rockN, 8, 110, 1000);
    this.houses = this.scatter(houseN, 28, 120, 2000);
    this.lamps = [];
    for (let i = 0; i < lampN; i++) {
      this.lamps.push({ z: i * 45, side: i % 2 === 0 ? -1 : 1 });
    }
  }

  makeInstanced(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  scatter(n, minD, maxD, seed) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        z: (hash(seed + i) - 0.3) * 900,
        side: hash(seed + i + 0.5) > 0.5 ? 1 : -1,
        dist: minD + hash(seed + i + 0.7) * (maxD - minD),
        s: 0.7 + hash(seed + i + 0.9) * 0.9,
        rot: hash(seed + i + 1.1) * Math.PI * 2,
      });
    }
    return arr;
  }

  recycle(list, busZ, span = 900, back = 150) {
    for (const p of list) {
      if (p.z < busZ - back) p.z += span;
      if (p.z > busZ + span - back) p.z -= span;
    }
  }

  setDensity(quality) {
    const f = quality === 'high' ? 1 : 0.5;
    this.trunkMesh.count = Math.floor(this.trees.length * f);
    this.leafMesh.count = Math.floor(this.trees.length * f);
    this.rockMesh.count = Math.floor(this.rocks.length * f);
  }

  update(busPos, biome) {
    const busZ = busPos.z;
    this.recycle(this.trees, busZ);
    this.recycle(this.rocks, busZ);
    this.recycle(this.houses, busZ);
    for (const l of this.lamps) {
      if (l.z < busZ - 100) l.z += 40 * 45;
    }

    const leafColor = new THREE.Color(biome === 'desert' ? 0x6a8f3f : biome === 'forest' ? 0x2c7a3c : 0x3e8f4e);
    this.leafMesh.material.color.lerp(leafColor, 0.05);

    let ti = 0;
    for (const p of this.trees) {
      if (ti >= this.trunkMesh.count) break;
      const x = roadCenterX(p.z) + p.side * p.dist;
      const y = this.terrain.getHeight(x, p.z);
      if (y < -3.4) { // underwater in coast — hide
        this.dummy.position.set(0, -50, 0);
      } else {
        this.dummy.position.set(x, y + 1.1 * p.s, p.z);
      }
      this.dummy.scale.setScalar(p.s * (biome === 'forest' ? 1.35 : 1));
      this.dummy.rotation.set(0, p.rot, 0);
      this.dummy.updateMatrix();
      this.trunkMesh.setMatrixAt(ti, this.dummy.matrix);
      this.dummy.position.y += 2.6 * p.s;
      this.dummy.updateMatrix();
      this.leafMesh.setMatrixAt(ti, this.dummy.matrix);
      ti++;
    }
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.leafMesh.instanceMatrix.needsUpdate = true;

    let ri = 0;
    for (const p of this.rocks) {
      if (ri >= this.rockMesh.count) break;
      const x = roadCenterX(p.z) + p.side * p.dist;
      const y = this.terrain.getHeight(x, p.z);
      this.dummy.position.set(x, y + 0.2, p.z);
      this.dummy.scale.set(p.s, p.s * 0.7, p.s);
      this.dummy.rotation.set(0, p.rot, 0);
      this.dummy.updateMatrix();
      this.rockMesh.setMatrixAt(ri++, this.dummy.matrix);
    }
    this.rockMesh.instanceMatrix.needsUpdate = true;

    let hi = 0;
    for (const p of this.houses) {
      const x = roadCenterX(p.z) + p.side * p.dist;
      const y = this.terrain.getHeight(x, p.z);
      this.dummy.position.set(x, y + 2, p.z);
      this.dummy.scale.setScalar(1);
      this.dummy.rotation.set(0, p.rot, 0);
      this.dummy.updateMatrix();
      this.houseMesh.setMatrixAt(hi, this.dummy.matrix);
      this.dummy.position.y += 3.1;
      this.dummy.rotation.set(0, p.rot + Math.PI / 4, 0);
      this.dummy.updateMatrix();
      this.roofMesh.setMatrixAt(hi, this.dummy.matrix);
      hi++;
    }
    this.houseMesh.instanceMatrix.needsUpdate = true;
    this.roofMesh.instanceMatrix.needsUpdate = true;

    let li = 0;
    for (const l of this.lamps) {
      if (l.z < busZ - 100 || l.z > busZ + 800) continue;
      if (li >= this.poleMesh.count) break;
      const x = roadCenterX(l.z) + l.side * 6.2;
      const y = this.terrain.getHeight(x, l.z);
      this.dummy.position.set(x, y + 3.5, l.z);
      this.dummy.scale.setScalar(1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.poleMesh.setMatrixAt(li, this.dummy.matrix);
      this.dummy.position.y += 3.6;
      this.dummy.updateMatrix();
      this.lampMesh.setMatrixAt(li, this.dummy.matrix);
      li++;
    }
    // hide unused lamp instances
    for (let k = li; k < this.poleMesh.count; k++) {
      this.dummy.position.set(0, -100, 0);
      this.dummy.updateMatrix();
      this.poleMesh.setMatrixAt(k, this.dummy.matrix);
      this.lampMesh.setMatrixAt(k, this.dummy.matrix);
    }
    this.poleMesh.instanceMatrix.needsUpdate = true;
    this.lampMesh.instanceMatrix.needsUpdate = true;
  }
}
