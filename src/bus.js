import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { roadCenterX, roadHeight, roadHeading, distanceToRoad, ROAD_HALF } from './road.js';

const WHEELBASE = 5.2;

export class Bus {
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.pos = new THREE.Vector3(roadCenterX(0), roadHeight(0), 0);
    this.yaw = roadHeading(0);
    this.speed = 0;
    this.steerVis = 0;
    this.autodrive = false;
    this.wheels = [];
    this.frontWheels = [];
    this.useGLB = false;

    this.buildFallbackBus();
    this.tryLoadGLB();
  }

  buildFallbackBus() {
    this.body = new THREE.Group();
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2a413, roughness: 0.6, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.15, metalness: 0.4 });

    const main = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.9, 8.6), yellow);
    main.position.y = 1.75;
    this.body.add(main);

    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.5, 8.0), dark);
    skirt.position.y = 0.65;
    this.body.add(skirt);

    const windows = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.75, 7.2), glass);
    windows.position.y = 2.25;
    this.body.add(windows);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.2), glass);
    windshield.position.set(0, 1.9, 4.32);
    windshield.rotation.x = -0.12;
    this.body.add(windshield);

    // roof + bumper + mirrors
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 7.6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    roof.position.y = 2.8;
    this.body.add(roof);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 0.4), dark);
    bumper.position.set(0, 0.6, 4.4);
    this.body.add(bumper);
    for (const s of [-1, 1]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.3), dark);
      mir.position.set(s * 1.35, 2.3, 4.1);
      this.body.add(mir);
    }
    // headlights (emissive toggled at night)
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0x000000 });
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.1), this.headMat);
      hl.position.set(s * 0.8, 0.9, 4.45);
      this.body.add(hl);
    }
    const tlMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0x550000 });
    for (const s of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.1), tlMat);
      tl.position.set(s * 0.85, 1.0, -4.32);
      this.body.add(tl);
    }

    // Dashain marigold garland + pennants (attached to group so it also
    // shows when a custom bus.glb replaces the fallback body)
    this.festive = new THREE.Group();
    const mariA = new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.8, emissive: 0x903c00, emissiveIntensity: 0.6 });
    const mariB = new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.8, emissive: 0x7a5c00, emissiveIntensity: 0.6 });
    const ballGeo = new THREE.SphereGeometry(0.13, 6, 5);
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(ballGeo, i % 2 ? mariA : mariB);
      b.position.set(-1.1 + i * 0.2, 2.62, 4.36);
      this.festive.add(b);
    }
    for (const sx of [-1.29, 1.29]) {
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(ballGeo, i % 2 ? mariB : mariA);
        b.position.set(sx, 2.6, 3.4 - i * 0.75);
        this.festive.add(b);
      }
    }
    const penMats = [mariA, mariB,
      new THREE.MeshStandardMaterial({ color: 0xd41f2e, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x1f6fd6, roughness: 0.9 })];
    for (let i = 0; i < 7; i++) {
      const pen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.02), penMats[i % 4]);
      pen.position.set(-1.2 + i * 0.4, 3.05, 4.1);
      this.festive.add(pen);
    }
    this.festive.visible = false;
    this.group.add(this.festive);

    // wheels: 6 (front steer axle + rear drive)
    const wg = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12);
    wg.rotateZ(Math.PI / 2);
    const wm = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const hub = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.5 });
    const wheelPos = [
      [-1.15, 2.9, true], [1.15, 2.9, true],
      [-1.15, -1.2, false], [1.15, -1.2, false],
      [-1.15, -2.6, false], [1.15, -2.6, false],
    ];
    for (const [x, z, front] of wheelPos) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.55, z);
      const tire = new THREE.Mesh(wg, wm);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.47, 8), hub);
      cap.rotation.z = Math.PI / 2;
      pivot.add(tire, cap);
      pivot.userData.spin = tire;
      pivot.userData.spin2 = cap;
      this.body.add(pivot);
      this.wheels.push(pivot);
      if (front) this.frontWheels.push(pivot);
    }
    this.group.add(this.body);
  }

  async tryLoadGLB() {
    // Drop your low-poly bus at public/models/bus.glb (Kenney / Quaternius).
    // If present it replaces the box body automatically.
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync('/models/bus.glb');
      const model = gltf.scene;
      // normalize scale to ~8.6m long
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const target = 8.6 / Math.max(size.z, 0.001);
      model.scale.multiplyScalar(Math.min(Math.max(target, 0.2), 5));
      model.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
      // hide fallback, keep wheels? GLB usually has wheels — hide ours
      this.body.visible = false;
      this.glb = model;
      // lift so wheels sit on ground (approx)
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y -= box2.min.y;
      this.group.add(model);
      this.useGLB = true;
      console.info('[bus] GLB loaded from /models/bus.glb');
    } catch {
      console.info('[bus] no /models/bus.glb found — using built-in low-poly bus. Drop a bus.glb into public/models/ to replace it.');
    }
  }

  setNight(isNight) {
    if (this.headMat) this.headMat.emissive.setHex(isNight || this.isFestive ? 0xffedb0 : 0x000000);
  }

  setFestive(v) {
    this.isFestive = v;
    if (this.festive) this.festive.visible = v;
    if (this.headMat) this.headMat.emissive.setHex(v ? 0xffedb0 : 0x000000);
  }

  reset() {
    const z = this.pos.z;
    this.pos.set(roadCenterX(z), roadHeight(z), z);
    this.yaw = roadHeading(z);
    this.speed = 0;
  }

  update(dt, input) {
    // input: {up, down, left, right} booleans
    let throttle = 0;
    let steer = 0;
    let brake = false;

    if (this.autodrive) {
      const lookZ = this.pos.z + Math.cos(this.yaw) * 18;
      const cx = roadCenterX(lookZ);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const latErr = cx - this.pos.x;
      const desiredYaw = Math.atan2(roadCenterX(this.pos.z + 20) - this.pos.x, 20);
      let yawErr = desiredYaw - this.yaw;
      while (yawErr > Math.PI) yawErr -= Math.PI * 2;
      while (yawErr < -Math.PI) yawErr += Math.PI * 2;
      steer = THREE.MathUtils.clamp(-(latErr * 0.06 + yawErr * 1.6), -1, 1);
      throttle = 0.55;
      void fx; void fz;
    } else {
      if (input.up) throttle = 1;
      if (input.down) {
        if (this.speed > 1) brake = true;
        else throttle = -0.4; // reverse
      }
      if (input.left) steer = -1;
      if (input.right) steer = 1;
    }

    const d = distanceToRoad(this.pos.x, this.pos.z);
    const offroad = d > ROAD_HALF + 0.6;
    const maxSpeed = offroad ? 10 : 30;
    const accel = offroad ? 4.5 : 9;

    if (brake) {
      this.speed = Math.max(0, this.speed - 24 * dt);
    } else if (throttle > 0) {
      this.speed = Math.min(maxSpeed, this.speed + accel * throttle * dt);
    } else if (throttle < 0) {
      this.speed = Math.max(-6, this.speed + 7 * throttle * dt);
    } else {
      // coast / drag
      this.speed -= this.speed * 0.5 * dt;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    if (offroad && Math.abs(this.speed) > maxSpeed) {
      this.speed -= Math.sign(this.speed) * 12 * dt;
    }

    // steering — less at speed so the bus feels stable
    // NOTE: yaw decreases for a right turn: with forward=(sin yaw, cos yaw)
    // and a chase cam behind the bus, +yaw moves toward +X which is
    // screen-left, so D (steer=+1, screen-right) must reduce yaw.
    const steerAngle = steer * 0.55 * (1 - Math.min(Math.abs(this.speed) / 30, 0.55));
    if (Math.abs(this.speed) > 0.01) {
      this.yaw -= (steerAngle * this.speed / WHEELBASE) * dt;
    }
    this.steerVis += (steerAngle - this.steerVis) * Math.min(1, dt * 8);

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    // ground height + gentle suspension bob
    const ground = offroad
      ? this.terrain.getHeight(this.pos.x, this.pos.z)
      : roadHeight(this.pos.z);
    const bob = Math.sin(performance.now() * 0.02) * Math.min(Math.abs(this.speed) / 30, 1) * (offroad ? 0.08 : 0.02);
    this.pos.y += ((ground + bob) - this.pos.y) * Math.min(1, dt * 6);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    // body lean
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -steer * Math.min(Math.abs(this.speed) / 30, 1) * 0.05, dt * 5);
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, THREE.MathUtils.clamp(-throttle * 0.015, -0.02, 0.02), dt * 5);
    if (this.glb) {
      this.glb.rotation.z = this.body.rotation.z;
    }

    // wheels
    const spin = (this.speed * dt) / 0.55;
    for (const w of this.wheels) {
      w.userData.spin.rotation.x += spin;
      w.userData.spin2.rotation.x += spin;
    }
    for (const w of this.frontWheels) w.rotation.y = -this.steerVis;

    return { speed: this.speed, offroad };
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}
