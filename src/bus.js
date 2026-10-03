import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { roadCenterX, roadHeight, roadHeading, distanceToRoad, ROAD_HALF } from './road.js';

const WHEELBASE = 5.2;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Bus {
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.pos = new THREE.Vector3(roadCenterX(0), roadHeight(0), 0);
    this.yaw = roadHeading(0);
    this.speed = 0;
    this.steerVis = 0;
    this.steerSm = 0; // smoothed steering (heavy bus feel, no keyboard jerk)
    this.autodrive = false;
    this.wheels = [];
    this.frontWheels = [];
    this.useGLB = false;

    this.buildFallbackBus();
    this.tryLoadGLB();
  }

  buildFallbackBus() {
    this.body = new THREE.Group();
    // Nepali highway-bus livery: cream body, blue waist stripe, red pinstripe
    const cream = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.55, flatShading: true });
    const stripeBlue = new THREE.MeshStandardMaterial({ color: 0x14478f, roughness: 0.55, flatShading: true });
    const stripeRed = new THREE.MeshStandardMaterial({ color: 0xb3122e, roughness: 0.55, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.3 });
    // tinted side glass, near-clear windshield (driver must see through it)
    const glassSide = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.45 });
    const glassFront = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false });

    const main = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.9, 8.6), cream);
    main.position.y = 1.75;
    this.body.add(main);

    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.5, 8.0), dark);
    skirt.position.y = 0.65;
    this.body.add(skirt);

    const windows = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.75, 7.2), glassSide);
    windows.position.y = 2.25;
    this.body.add(windows);

    // waist livery stripes
    const waist = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.45, 8.2), stripeBlue);
    waist.position.y = 1.32;
    this.body.add(waist);
    const pin = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.12, 8.2), stripeRed);
    pin.position.y = 1.6;
    this.body.add(pin);

    // side art: JAMARA JOURNEY decals on both flanks
    const sideTex = canvasTexture(512, 128, (g) => {
      g.clearRect(0, 0, 512, 128);
      g.textAlign = 'center';
      g.fillStyle = '#14478f';
      g.font = 'bold 54px sans-serif';
      g.fillText('JAMARA JOURNEY', 256, 58);
      g.fillStyle = '#b3122e';
      g.fillRect(90, 70, 332, 6);
      g.font = 'bold 40px sans-serif';
      g.fillText('जमरा यात्रा', 256, 112);
    });
    for (const s of [-1, 1]) {
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(5.4, 1.05),
        new THREE.MeshStandardMaterial({ map: sideTex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 })
      );
      decal.position.set(s * 1.281, 1.95, -0.3);
      decal.rotation.y = s * Math.PI / 2;
      this.body.add(decal);
    }

    // destination board above the windshield
    const boardTex = canvasTexture(256, 64, (g) => {
      g.fillStyle = '#101418';
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = '#ffbf3f';
      g.textAlign = 'center';
      g.font = 'bold 38px sans-serif';
      g.fillText('जमरा यात्रा', 128, 45);
    });
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.42),
      new THREE.MeshStandardMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.55, roughness: 0.4 })
    );
    board.position.set(0, 2.62, 4.315);
    this.body.add(board);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.2), glassFront);
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
    // front bullbar — highway-bus staple
    const bullTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), dark);
    bullTop.position.set(0, 1.35, 4.62);
    this.body.add(bullTop);
    for (const s of [-0.9, 0.9]) {
      const bullLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), dark);
      bullLeg.position.set(s, 0.95, 4.62);
      this.body.add(bullLeg);
    }
    // roof luggage rack with colorful cargo — the true Nepali vibe
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 7.4), dark);
      rail.position.set(s * 1.0, 3.0, 0);
      this.body.add(rail);
    }
    for (const z of [-3, -1, 1, 3]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.14), dark);
      cross.position.set(0, 3.02, z);
      this.body.add(cross);
    }
    const cargo = [
      { c: 0xc23b2e, x: -0.4, y: 3.42, z: -2.2, w: 0.95, h: 0.5, d: 1.6 },
      { c: 0x2456a8, x: 0.5, y: 3.4, z: -0.5, w: 0.8, h: 0.5, d: 0.75 },
      { c: 0x2e7d4f, x: -0.2, y: 3.44, z: 1.2, w: 0.9, h: 0.55, d: 1.1 },
    ];
    for (const it of cargo) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(it.w, it.h, it.d),
        new THREE.MeshStandardMaterial({ color: it.c, roughness: 0.9, flatShading: true })
      );
      box.position.set(it.x, it.y, it.z);
      box.rotation.y = (it.z * 0.7 % 1) * 0.14;
      this.body.add(box);
    }
    const tarp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 2.0, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a41b, roughness: 0.9, flatShading: true })
    );
    tarp.rotation.z = Math.PI / 2;
    tarp.position.set(0, 3.38, 2.75);
    this.body.add(tarp);
    for (const s of [-1, 1]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.3), dark);
      mir.position.set(s * 1.35, 2.3, 4.1);
      this.body.add(mir);
    }

    // ---- driver cabin (first-person interior, right-hand drive) ----
    this.cabin = new THREE.Group();
    const dashMat = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.85 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2456a8, roughness: 0.95, flatShading: true });

    // A-pillars framing the windshield
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.25, 0.16), dashMat);
      pillar.position.set(s * 1.12, 2.3, 4.12);
      pillar.rotation.x = -0.12;
      this.cabin.add(pillar);
    }
    // dashboard + top pad
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.45, 0.65), dashMat);
    dash.position.set(0, 1.98, 3.78);
    this.cabin.add(dash);
    const dashTop = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.7), dashMat);
    dashTop.position.set(0, 2.22, 3.78);
    this.cabin.add(dashTop);

    // instrument cluster: live speedo needle + static fuel gauge + LEDs
    const cluster = new THREE.Group();
    cluster.position.set(-0.65, 2.3, 3.56);
    cluster.rotation.x = -0.5;
    this.cabin.add(cluster);
    const dialTex = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#101418';
      g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.strokeStyle = '#e8e8e8'; g.lineWidth = 3;
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * 0.75 + (i / 12) * Math.PI * 1.5;
        g.beginPath();
        g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
        g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56);
        g.stroke();
      }
      g.fillStyle = '#ffbf3f'; g.font = 'bold 19px sans-serif'; g.textAlign = 'center';
      g.fillText('km/h', 64, 94);
    });
    const dialBody = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), dashMat);
    dialBody.rotation.x = Math.PI / 2;
    cluster.add(dialBody);
    const dialFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.155, 20),
      new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.35 })
    );
    dialFace.position.z = 0.021;
    cluster.add(dialFace);
    this.needle = new THREE.Group();
    this.needle.position.z = 0.03;
    const needleArm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.012), new THREE.MeshBasicMaterial({ color: 0xe63946 }));
    needleArm.position.y = 0.055;
    this.needle.add(needleArm);
    this.needle.rotation.z = 2.1;
    cluster.add(this.needle);
    // fuel gauge (static 3/4) + indicator LEDs
    const fuel = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), dashMat);
    fuel.position.set(0.32, -0.02, 0.01);
    cluster.add(fuel);
    const fuelNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.055, 0.008), new THREE.MeshBasicMaterial({ color: 0xffbf3f }));
    fuelNeedle.position.set(0.32, 0.0, 0.02);
    fuelNeedle.rotation.z = -0.7;
    cluster.add(fuelNeedle);
    const ledColors = [0x2e9e4f, 0xffbf3f, 0xe63946];
    ledColors.forEach((c, i) => {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 1.4 })
      );
      led.position.set(-0.28 + i * 0.09, -0.14, 0.02);
      cluster.add(led);
    });

    // steering wheel — spins with steering input
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 8), dashMat);
    column.position.set(-0.65, 2.0, 3.5);
    column.rotation.x = 1.05;
    this.cabin.add(column);
    this.wheelSpin = new THREE.Group();
    this.wheelSpin.position.set(-0.65, 2.12, 3.28);
    this.wheelSpin.rotation.x = -0.42;
    this.wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 22), dashMat));
    const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.04), dashMat);
    const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.56, 0.04), dashMat);
    this.wheelSpin.add(spokeH, spokeV);
    const hubcap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 10), stripeRed);
    hubcap.rotation.x = Math.PI / 2;
    this.wheelSpin.add(hubcap);
    this.cabin.add(this.wheelSpin);

    // driver + conductor seats
    for (const sx of [-0.65, 0.6]) {
      const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.62), seatMat);
      seatBase.position.set(sx, 1.18, 2.45);
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.16), seatMat);
      seatBack.position.set(sx, 1.65, 2.14);
      seatBack.rotation.x = 0.1;
      this.cabin.add(seatBase, seatBack);
    }
    // rear-view mirror
    const mirrorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.05), dashMat);
    mirrorGlass.position.set(0, 2.62, 3.95);
    this.cabin.add(mirrorGlass);

    // windshield wipers (sweep when raining)
    this.wipers = [];
    for (const s of [-0.55, 0.55]) {
      const pivot = new THREE.Group();
      pivot.position.set(s, 1.52, 4.44);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.03), dashMat);
      arm.position.y = 0.31;
      pivot.add(arm);
      pivot.rotation.z = -0.5;
      this.cabin.add(pivot);
      this.wipers.push(pivot);
    }
    // ---- cabin dressing: console, shifter, visors, mirror charm ----
    // center console + glowing radio face
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), dashMat);
    consoleBox.position.set(0, 1.68, 3.6);
    this.cabin.add(consoleBox);
    const radioFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0a0f14, emissive: 0x2aff7a, emissiveIntensity: 0.7, roughness: 0.4 })
    );
    radioFace.position.set(0, 1.82, 3.345);
    radioFace.rotation.y = Math.PI;
    this.cabin.add(radioFace);
    // dash vents + button row (face the driver)
    for (const vx of [-1.0, -0.25, 0.35, 1.0]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.04), dashMat);
      vent.position.set(vx, 2.06, 3.45);
      vent.rotation.y = Math.PI;
      this.cabin.add(vent);
    }
    for (let i = 0; i < 4; i++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.05, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffbf3f, emissiveIntensity: i === 0 ? 1.2 : 0.25 })
      );
      btn.position.set(-0.12 + i * 0.1, 1.9, 3.45);
      this.cabin.add(btn);
    }
    // glove box + handle
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.05), new THREE.MeshStandardMaterial({ color: 0x39414c, roughness: 0.85 }));
    glove.position.set(0.65, 1.92, 3.45);
    this.cabin.add(glove);
    // gear lever + handbrake between the seats
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), dashMat);
    stick.position.set(-0.2, 1.2, 3.2);
    stick.rotation.x = 0.45;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), stripeRed);
    knob.position.set(-0.2, 1.43, 3.09);
    this.cabin.add(stick, knob);
    const handbrake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.08), dashMat);
    handbrake.position.set(0.18, 1.15, 3.0);
    handbrake.rotation.x = -0.6;
    this.cabin.add(handbrake);
    // pedals in the footwell (right one is the gas — it presses down)
    for (const px of [-0.85, -0.65, -0.45]) {
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.04), dashMat);
      pedal.position.set(px, 1.05, 3.95);
      pedal.rotation.x = -0.5;
      this.cabin.add(pedal);
      if (px === -0.45) this.gasPedal = pedal;
    }
    // sun visors flipped down over the windshield
    for (const s of [-0.6, 0.6]) {
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.03), dashMat);
      visor.position.set(s, 2.66, 3.98);
      visor.rotation.x = 0.35;
      this.cabin.add(visor);
    }
    // split-windshield center divider (classic highway bus)
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.05, 0.1), dashMat);
    divider.position.set(0, 1.92, 4.26);
    divider.rotation.x = -0.12;
    this.cabin.add(divider);
    // side-window frames
    for (const s of [-1.26, 1.26]) {
      for (const fz of [-2.4, -0.2, 2.0]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), dashMat);
        bar.position.set(s, 2.25, fz);
        this.cabin.add(bar);
      }
    }
    // cabin floor + dome light
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 6.5),
      new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.96, 0.6);
    this.cabin.add(floor);
    const dome = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.05, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffe2a8, emissiveIntensity: 1.0 })
    );
    dome.position.set(0, 2.68, 1.6);
    this.cabin.add(dome);
    // marigold charm swaying from the mirror
    this.charm = new THREE.Group();
    this.charm.position.set(0, 2.52, 3.92);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 5), dashMat);
    string.position.y = -0.14;
    this.charm.add(string);
    const beadColors = [0xb3122e, 0xffd21f, 0x2e9e4f];
    beadColors.forEach((bc, i) => {
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 6, 5),
        new THREE.MeshStandardMaterial({ color: bc, roughness: 0.7, emissive: bc, emissiveIntensity: 0.25 })
      );
      bead.position.y = -0.3 - i * 0.08;
      this.charm.add(bead);
    });
    this.cabin.add(this.charm);
    this.wipersOn = false;
    this.group.add(this.cabin);
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

  setWipers(v) { this.wipersOn = v; }

  // cabin life: steering wheel, speedo needle, pedals, wipers, charm
  updateCabin(speedKmh, input = {}, dt, time) {
    if (this.wheelSpin) {
      // right turn (steerVis>0) = clockwise from the driver's seat
      const target = this.steerVis * 2.4;
      this.wheelSpin.rotation.z += (target - this.wheelSpin.rotation.z) * Math.min(1, dt * 10);
    }
    if (this.needle) {
      const target = 2.1 - Math.min(Math.max(speedKmh, 0), 120) / 120 * 4.2;
      this.needle.rotation.z += (target - this.needle.rotation.z) * Math.min(1, dt * 6);
    }
    if (this.wipers) {
      const sweep = this.wipersOn ? (Math.sin(time * 5) * 0.5 + 0.5) : 0;
      for (const w of this.wipers) w.rotation.z = -0.5 + sweep * 1.0;
    }
    if (this.charm) {
      const sway = Math.min(Math.abs(speedKmh) / 80, 1);
      this.charm.rotation.x = Math.sin(time * 1.9) * (0.05 + sway * 0.12);
      // centrifugal force swings the charm outward (left in a right turn)
      this.charm.rotation.z = Math.sin(time * 1.3 + 1) * 0.05 + this.steerVis * 0.35;
    }
    if (this.gasPedal) {
      const gasTarget = input.up ? -0.78 : -0.5;
      this.gasPedal.rotation.x += (gasTarget - this.gasPedal.rotation.x) * Math.min(1, dt * 10);
    }
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

    // steering — smoothed like a heavy bus (no keyboard jerk), return-to-center,
    // and less lock at speed so it stays stable.
    // NOTE: yaw decreases for a right turn: with forward=(sin yaw, cos yaw)
    // and a chase cam behind the bus, +yaw moves toward +X which is
    // screen-left, so D (steer=+1, screen-right) must reduce yaw.
    const engage = steer !== 0 ? 4.5 : 7;
    this.steerSm += (steer - this.steerSm) * Math.min(1, dt * engage);
    if (Math.abs(this.steerSm) < 0.002 && steer === 0) this.steerSm = 0;
    const steerAngle = this.steerSm * 0.55 * (1 - Math.min(Math.abs(this.speed) / 30, 0.55));
    if (Math.abs(this.speed) > 0.01) {
      this.yaw -= (steerAngle * this.speed / WHEELBASE) * dt;
    }
    this.steerVis += (steerAngle - this.steerVis) * Math.min(1, dt * 8);

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    // ground height + gentle suspension bob — never sink below the surface:
    // climbing terrain rises faster than smoothing can follow, so snap up.
    const ground = offroad
      ? this.terrain.getHeight(this.pos.x, this.pos.z)
      : roadHeight(this.pos.z);
    const bob = Math.sin(performance.now() * 0.02) * Math.min(Math.abs(this.speed) / 30, 1) * (offroad ? 0.08 : 0.02);
    const targetY = ground + 0.08 + bob;
    if (this.pos.y < targetY) this.pos.y = targetY;
    else this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 10);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    // body lean (uses smoothed steer so it rolls, not snaps)
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -this.steerSm * Math.min(Math.abs(this.speed) / 30, 1) * 0.05, dt * 5);
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
