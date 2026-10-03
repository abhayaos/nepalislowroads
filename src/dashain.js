import * as THREE from 'three';
import { roadCenterX, roadHeight } from './road.js';

// Dashain (दशैं) festival theme: bamboo swings (linge ping), flying kites,
// marigold garlands, torana gates, roadside shrines and warm string lights.
// Everything lives under one root group so toggling the theme is free
// (invisible objects are skipped by the renderer).
//
// "Full lighting" = warm ambient fill + bus glow light + emissive bulbs,
// brighter tone-mapping exposure, and bus headlights forced on.

const SPAN_N = 14;      // light-string spans across the road
const SPAN_GAP = 90;
const BULBS_PER_SPAN = 9;
const SWING_N = 5;
const SWING_GAP = 260;
const GATE_N = 2;
const GATE_GAP = 450;
const SHRINE_N = 3;
const SHRINE_GAP = 350;
const KITE_N = 7;
const MARIGOLD_N = 120;

const BULB_COLORS = [0xffd27a, 0xff9d5c, 0xffe9a8, 0xff6b6b, 0xffd21f];

function makeGateTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b3122e';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ffd21f';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#ffd21f';
  g.textAlign = 'center';
  g.font = 'bold 56px sans-serif';
  g.fillText('शुभ दशैं', 256, 62);
  g.font = 'bold 26px sans-serif';
  g.fillStyle = '#fff3c9';
  g.fillText('★ HAPPY DASHAIN ★', 256, 102);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class DashainManager {
  constructor(scene, terrain, bus, renderer) {
    this.scene = scene;
    this.terrain = terrain;
    this.bus = bus;
    this.renderer = renderer;
    this.enabled = false;
    this.dummy = new THREE.Object3D();

    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);

    // ---- full-lighting rig ----
    this.fill = new THREE.AmbientLight(0xffd9a0, 0.55);
    this.glow = new THREE.PointLight(0xffc873, 60, 70, 2);
    this.root.add(this.fill, this.glow);

    const bamboo = new THREE.MeshStandardMaterial({ color: 0xb08d4f, roughness: 1, flatShading: true });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 1 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xb3122e, roughness: 0.9, flatShading: true });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.7, flatShading: true, emissive: 0x664400, emissiveIntensity: 0.4 });
    this.bamboo = bamboo;
    this.ropeMat = ropeMat;
    this.redMat = redMat;
    this.goldMat = goldMat;

    this.buildLightStrings();
    this.buildSwings();
    this.buildGates();
    this.buildShrines();
    this.buildKites();
    this.buildMarigolds();
  }

  // ---------- string lights across the road (instanced) ----------
  buildLightStrings() {
    const total = SPAN_N * BULBS_PER_SPAN;
    this.spans = [];
    for (let i = 0; i < SPAN_N; i++) this.spans.push({ z: -120 + i * SPAN_GAP });

    this.poleMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.16, 6.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 1 }),
      SPAN_N * 2
    );
    this.poleMesh.frustumCulled = false;
    this.root.add(this.poleMesh);

    this.bulbMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      total
    );
    this.bulbMesh.frustumCulled = false;
    const col = new THREE.Color();
    for (let i = 0; i < total; i++) {
      col.setHex(BULB_COLORS[i % BULB_COLORS.length]);
      this.bulbMesh.setColorAt(i, col);
    }
    this.bulbMesh.instanceColor.needsUpdate = true;
    this.root.add(this.bulbMesh);

    // sagging wire per span (thin line, barely visible by day, nice at dusk)
    this.wires = [];
    const wireMat = new THREE.LineBasicMaterial({ color: 0x33261a });
    for (let i = 0; i < SPAN_N; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      const line = new THREE.Line(geo, wireMat);
      line.frustumCulled = false;
      this.root.add(line);
      this.wires.push(line);
    }
    for (let i = 0; i < SPAN_N; i++) this.layoutSpan(i);
  }

  layoutSpan(i) {
    const s = this.spans[i];
    const cx = roadCenterX(s.z);
    const poleH = 6.5;
    const lx = cx - 7.2;
    const rx = cx + 7.2;
    const ly = this.terrain.getHeight(lx, s.z);
    const ry = this.terrain.getHeight(rx, s.z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.position.set(lx, ly + poleH / 2, s.z);
    this.dummy.updateMatrix();
    this.poleMesh.setMatrixAt(i * 2, this.dummy.matrix);
    this.dummy.position.set(rx, ry + poleH / 2, s.z);
    this.dummy.updateMatrix();
    this.poleMesh.setMatrixAt(i * 2 + 1, this.dummy.matrix);

    const pos = this.wires[i].geometry.attributes.position;
    const sagY = (f) => ly + (ry - ly) * f + poleH - 0.25 - 1.7 * Math.sin(Math.PI * f);
    for (let j = 0; j < BULBS_PER_SPAN; j++) {
      const f = BULBS_PER_SPAN === 1 ? 0.5 : j / (BULBS_PER_SPAN - 1);
      const x = lx + (rx - lx) * f;
      const idx = i * BULBS_PER_SPAN + j;
      this.dummy.position.set(x, sagY(f), s.z);
      this.dummy.scale.setScalar(1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.bulbMesh.setMatrixAt(idx, this.dummy.matrix);
    }
    // full 16-sample sag curve for the wire
    for (let k = 0; k < 16; k++) {
      const f = k / 15;
      pos.setXYZ(k, lx + (rx - lx) * f, sagY(f) + 0.15, s.z);
    }
    pos.needsUpdate = true;
    this.poleMesh.instanceMatrix.needsUpdate = true;
    this.bulbMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- bamboo swings (linge ping) ----------
  buildSwings() {
    this.swings = [];
    const legGeo = new THREE.CylinderGeometry(0.12, 0.16, 9.2, 5);
    const barGeo = new THREE.CylinderGeometry(0.14, 0.14, 6.4, 5);
    barGeo.rotateZ(Math.PI / 2);
    const ropeGeo = new THREE.CylinderGeometry(0.04, 0.04, 4.2, 4);
    const seatGeo = new THREE.BoxGeometry(1.7, 0.14, 0.6);
    const flagGeo = new THREE.BoxGeometry(0.35, 0.25, 0.02);
    const flagMats = [this.redMat, this.goldMat,
      new THREE.MeshStandardMaterial({ color: 0x1f6fd6, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x2e9e4f, roughness: 0.9 })];
    const flowerGeo = new THREE.SphereGeometry(0.14, 6, 5);
    const flowerMats = [
      new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.8, emissive: 0x903c00, emissiveIntensity: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.8, emissive: 0x7a5c00, emissiveIntensity: 0.5 }),
    ];

    for (let i = 0; i < SWING_N; i++) {
      const g = new THREE.Group();
      for (const [sx, sz, rz] of [[-2.6, 0.9, 0.22], [-2.6, -0.9, 0.22], [2.6, 0.9, -0.22], [2.6, -0.9, -0.22]]) {
        const leg = new THREE.Mesh(legGeo, this.bamboo);
        leg.position.set(sx * 0.82, 4.1, sz * 1.6);
        leg.rotation.z = rz;
        g.add(leg);
      }
      const bar = new THREE.Mesh(barGeo, this.bamboo);
      bar.position.y = 8.2;
      g.add(bar);
      // marigold garland across the bar
      for (let k = 0; k < 9; k++) {
        const f = new THREE.Mesh(flowerGeo, flowerMats[k % 2]);
        f.position.set(-2.4 + k * 0.6, 8.05, 0.15);
        g.add(f);
      }
      // pennant flags
      for (let k = 0; k < 6; k++) {
        const fl = new THREE.Mesh(flagGeo, flagMats[k % 4]);
        fl.position.set(-2 + k * 0.8, 7.75, 0.1);
        g.add(fl);
      }
      // swinging seat pivot at bar height
      const pivot = new THREE.Group();
      pivot.position.y = 8.2;
      for (const sx of [-0.7, 0.7]) {
        const rope = new THREE.Mesh(ropeGeo, this.ropeMat);
        rope.position.set(sx, -2.1, 0);
        pivot.add(rope);
      }
      const seat = new THREE.Mesh(seatGeo, this.bamboo);
      seat.position.y = -4.2;
      pivot.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.1), this.bamboo);
      back.position.set(0, -3.85, -0.3);
      pivot.add(back);
      g.add(pivot);

      const side = i % 2 === 0 ? 1 : -1;
      const z = -100 + i * SWING_GAP;
      this.root.add(g);
      this.swings.push({ g, pivot, z, side, phase: i * 1.7 });
      this.placeSwing(this.swings[i]);
    }
  }

  placeSwing(s) {
    const cx = roadCenterX(s.z);
    const x = cx + s.side * 16;
    s.g.position.set(x, this.terrain.getHeight(x, s.z), s.z);
  }

  // ---------- torana gates over the road ----------
  buildGates() {
    this.gates = [];
    const tex = makeGateTexture();
    const pillarGeo = new THREE.BoxGeometry(0.9, 6.4, 0.9);
    const beamGeo = new THREE.BoxGeometry(12.6, 1.5, 0.6);
    const bulbGeo = new THREE.SphereGeometry(0.16, 6, 5);
    const bulbMats = [
      new THREE.MeshBasicMaterial({ color: 0xffd21f }),
      new THREE.MeshBasicMaterial({ color: 0xff7a00 }),
    ];
    for (let i = 0; i < GATE_N; i++) {
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, this.redMat);
        pillar.position.set(sx * 5.6, 3.2, 0);
        g.add(pillar);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), this.goldMat);
        cap.position.set(sx * 5.6, 6.55, 0);
        g.add(cap);
      }
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
      beam.position.y = 7.2;
      g.add(beam);
      for (let k = 0; k < 12; k++) {
        const b = new THREE.Mesh(bulbGeo, bulbMats[k % 2]);
        b.position.set(-5.2 + k * 0.95, 6.3, 0.35);
        g.add(b);
      }
      const z = 150 + i * GATE_GAP;
      this.root.add(g);
      this.gates.push({ g, z });
      this.placeGate(this.gates[i]);
    }
  }

  placeGate(gate) {
    gate.g.position.set(roadCenterX(gate.z), roadHeight(gate.z), gate.z);
  }

  // ---------- roadside shrines ----------
  buildShrines() {
    this.shrines = [];
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 1, flatShading: true });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a2a20, roughness: 1, flatShading: true });
    for (let i = 0; i < SHRINE_N; i++) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 3.2), stone);
      base.position.y = 0.5;
      g.add(base);
      const mid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), this.redMat);
      mid.position.y = 1.7;
      g.add(mid);
      const roof1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.3, 4), roofMat);
      roof1.position.y = 3.1;
      roof1.rotation.y = Math.PI / 4;
      g.add(roof1);
      const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1, 4), roofMat);
      roof2.position.y = 4.1;
      roof2.rotation.y = Math.PI / 4;
      g.add(roof2);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), this.goldMat);
      pin.position.y = 4.85;
      g.add(pin);
      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.45, 0.03),
        new THREE.MeshStandardMaterial({ color: 0xd41f2e, roughness: 0.9, side: THREE.DoubleSide })
      );
      flag.position.set(0.45, 5.3, 0);
      g.add(flag);
      const side = i % 2 === 0 ? -1 : 1;
      const z = 60 + i * SHRINE_GAP;
      this.root.add(g);
      this.shrines.push({ g, z, side, flag });
      this.placeShrine(this.shrines[i]);
    }
  }

  placeShrine(s) {
    const x = roadCenterX(s.z) + s.side * 22;
    s.g.position.set(x, this.terrain.getHeight(x, s.z), s.z);
  }

  // ---------- kites circling overhead ----------
  buildKites() {
    this.kites = [];
    const palette = [0xe63946, 0xffd21f, 0x1f6fd6, 0x2e9e4f, 0xff7a00, 0x9b5de5, 0xffffff];
    for (let i = 0; i < KITE_N; i++) {
      const shape = new THREE.BufferGeometry();
      const v = new Float32Array([
        0, 1.0, 0,   -0.7, 0, 0.08,   0, -1.0, 0,
        0, 1.0, 0,   0, -1.0, 0,      0.7, 0, 0.08,
      ]);
      shape.setAttribute('position', new THREE.BufferAttribute(v, 3));
      shape.computeVertexNormals();
      const kite = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({
        color: palette[i % palette.length], side: THREE.DoubleSide, roughness: 0.8,
      }));
      const tailGeo = new THREE.BufferGeometry();
      tailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee }));
      const grp = new THREE.Group();
      grp.add(kite, tail);
      this.root.add(grp);
      this.kites.push({ grp, tail });
    }
  }

  // ---------- marigold tufts near the road ----------
  buildMarigolds() {
    this.marigold = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      MARIGOLD_N
    );
    this.marigold.frustumCulled = false;
    const col = new THREE.Color();
    this.blossoms = [];
    for (let i = 0; i < MARIGOLD_N; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this.blossoms.push({
        z: (this.hash(i * 3.7) - 0.25) * 900,
        side,
        dist: 8 + this.hash(i * 7.1) * 26,
        s: 0.7 + this.hash(i * 9.3) * 1.1,
      });
      col.setHex(i % 3 === 0 ? 0xffd21f : 0xff7a00);
      this.marigold.setColorAt(i, col);
    }
    this.marigold.instanceColor.needsUpdate = true;
    this.root.add(this.marigold);
    this.layoutMarigolds();
  }

  hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  layoutMarigolds() {
    for (let i = 0; i < this.blossoms.length; i++) {
      const p = this.blossoms[i];
      const x = roadCenterX(p.z) + p.side * p.dist;
      this.dummy.position.set(x, this.terrain.getHeight(x, p.z) + 0.3, p.z);
      this.dummy.scale.setScalar(p.s);
      this.dummy.rotation.set(0, p.z, 0);
      this.dummy.updateMatrix();
      this.marigold.setMatrixAt(i, this.dummy.matrix);
    }
    this.marigold.instanceMatrix.needsUpdate = true;
  }

  setDensity(quality) {
    const low = quality !== 'high';
    for (let i = 0; i < this.kites.length; i++) this.kites[i].grp.visible = low ? i < 4 : true;
    this.marigold.count = low ? 60 : MARIGOLD_N;
  }

  setEnabled(v) {
    this.enabled = v;
    this.root.visible = v;
    this.bus.setFestive(v);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = v ? 1.2 : 1.0;
  }

  update(busPos, dt, time) {
    if (!this.enabled) return;
    const busZ = busPos.z;

    // festival glow follows the bus
    this.glow.position.set(busPos.x, busPos.y + 9, busPos.z + 3);

    // recycle spans / swings / gates / shrines / marigolds
    let dirtySpan = false;
    for (let i = 0; i < this.spans.length; i++) {
      if (this.spans[i].z < busZ - 130) {
        this.spans[i].z += SPAN_N * SPAN_GAP;
        this.layoutSpan(i);
        dirtySpan = true;
      }
    }
    void dirtySpan;
    for (const s of this.swings) {
      if (s.z < busZ - 140) { s.z += SWING_N * SWING_GAP; this.placeSwing(s); }
      s.pivot.rotation.x = Math.sin(time * 1.3 + s.phase) * 0.42;
    }
    for (const gt of this.gates) {
      if (gt.z < busZ - 60) { gt.z += GATE_N * GATE_GAP; this.placeGate(gt); }
    }
    for (const sh of this.shrines) {
      if (sh.z < busZ - 120) { sh.z += SHRINE_N * SHRINE_GAP; this.placeShrine(sh); }
      sh.flag.rotation.y = Math.sin(time * 3 + sh.z) * 0.4;
    }
    let dirtyBlossom = false;
    for (const p of this.blossoms) {
      if (p.z < busZ - 150) { p.z += 900; dirtyBlossom = true; }
    }
    if (dirtyBlossom) this.layoutMarigolds();

    // kites circle the bus
    for (let i = 0; i < this.kites.length; i++) {
      const k = this.kites[i];
      if (!k.grp.visible) continue;
      const a = time * 0.07 + (i * Math.PI * 2) / KITE_N;
      const r = 42 + i * 7;
      const x = busPos.x + Math.cos(a) * r;
      const z = busZ + 34 + Math.sin(a * 0.7) * r;
      const y = busPos.y + 24 + (i % 3) * 4 + Math.sin(time * 0.9 + i * 2) * 3;
      k.grp.position.set(x, y, z);
      k.grp.rotation.set(0.3, a + Math.PI / 2, Math.sin(time * 2 + i) * 0.35);
      const tp = k.tail.geometry.attributes.position;
      tp.setXYZ(0, 0, -1, 0);
      tp.setXYZ(1, Math.sin(time * 3 + i) * 1.2, -1 - 7, 0);
      tp.needsUpdate = true;
    }
  }
}
