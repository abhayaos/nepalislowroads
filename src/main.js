import * as THREE from 'three';
import './style.css';
import { createRoad } from './road.js';
import { TerrainManager } from './terrain.js';
import { Bus } from './bus.js';
import { Sky, Props } from './environment.js';
import { initUI } from './ui.js';

// ---------- renderer / scene ----------
const canvas = document.createElement('canvas'); // replaced by ui; keep ref safe
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

// ---------- world ----------
const road = createRoad(scene);
const terrain = new TerrainManager(scene, 'hills');
const bus = new Bus(scene, terrain);
const sky = new Sky(scene, renderer);
const props = new Props(scene, terrain, 'high');

// ---------- state ----------
const keys = { up: false, down: false, left: false, right: false };
const touch = { up: false, down: false, left: false, right: false };
let started = false;
let camMode = 0; // 0 chase, 1 hood, 2 top, 3 cine
let biome = 'hills';
let timePreset = 'noon';
let weather = 'clear';
let quality = 'high';
const camPos = new THREE.Vector3(0, 6, -14);
const camLook = new THREE.Vector3();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.up = true;
  if (k === 's' || k === 'arrowdown') keys.down = true;
  if (k === 'a' || k === 'arrowleft') keys.left = true;
  if (k === 'd' || k === 'arrowright') keys.right = true;
  if (k === 'r') bus.reset();
  if (k === 'c') { camMode = (camMode + 1) % 4; ui.setCamera(camMode); }
  if (k === 'f') { bus.autodrive = !bus.autodrive; ui.setAuto(bus.autodrive); }
  if (k === 'q') ui.cycleBiome(-1);
  if (k === 'e') ui.cycleBiome(1);
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.up = false;
  if (k === 's' || k === 'arrowdown') keys.down = false;
  if (k === 'a' || k === 'arrowleft') keys.left = false;
  if (k === 'd' || k === 'arrowright') keys.right = false;
});

// ---------- UI ----------
const ui = initUI({
  touch,
  onBegin: (s) => {
    started = true;
    applyAll(s.biome, s.time, s.weather);
  },
  onBiome: (b) => { biome = b; terrain.setBiome(b); },
  onTime: (t) => { timePreset = t; bus.setNight(sky.apply(t, weather)); },
  onWeather: (w) => { weather = w; bus.setNight(sky.apply(timePreset, w)); },
  onQuality: (q) => {
    quality = q;
    renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 1.5) : 1);
    props.setDensity(q);
  },
  onCamera: (c) => { camMode = c; },
  onReset: () => bus.reset(),
  onToggleAuto: () => {
    bus.autodrive = !bus.autodrive;
    // release throttle keys so auto doesn't fight input
    keys.up = keys.down = false;
    return bus.autodrive;
  },
});

function applyAll(b, t, w) {
  biome = b; timePreset = t; weather = w;
  terrain.setBiome(b);
  bus.setNight(sky.apply(t, w));
  document.getElementById('sel-biome').value = b;
  document.getElementById('sel-time').value = t;
  document.getElementById('sel-weather').value = w;
}

// replace placeholder canvas with real one (ui created its own canvas tag)
{
  const uiCanvas = document.getElementById('game-canvas');
  uiCanvas.replaceWith(renderer.domElement);
  renderer.domElement.id = 'game-canvas';
}

// ---------- camera ----------
function updateCamera(dt) {
  const fwd = bus.forward();
  const p = bus.pos;
  if (camMode === 0) {
    const ideal = new THREE.Vector3().copy(p).addScaledVector(fwd, -13).add(new THREE.Vector3(0, 5.2, 0));
    camPos.lerp(ideal, 1 - Math.pow(0.001, dt));
    camLook.copy(p).addScaledVector(fwd, 9).add(new THREE.Vector3(0, 1.6, 0));
  } else if (camMode === 1) {
    camPos.copy(p).addScaledVector(fwd, 1.2).add(new THREE.Vector3(0, 3.0, 0));
    camLook.copy(p).addScaledVector(fwd, 30).add(new THREE.Vector3(0, 1.2, 0));
  } else if (camMode === 2) {
    const ideal = new THREE.Vector3().copy(p).add(new THREE.Vector3(0, 42, -6));
    camPos.lerp(ideal, 1 - Math.pow(0.001, dt));
    camLook.copy(p);
  } else {
    const t = performance.now() * 0.00012;
    const side = new THREE.Vector3(Math.cos(t) * 16, 0, Math.sin(t) * 16);
    const ideal = new THREE.Vector3().copy(p).add(side).add(new THREE.Vector3(0, 3.5, 0));
    camPos.lerp(ideal, 1 - Math.pow(0.01, dt));
    camLook.copy(p).add(new THREE.Vector3(0, 1.5, 0));
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  const input = {
    up: keys.up || touch.up,
    down: keys.down || touch.down,
    left: keys.left || touch.left,
    right: keys.right || touch.right,
  };

  if (started) {
    const { speed, offroad } = bus.update(dt, input);
    ui.setSpeed(Math.abs(speed) * 3.6, offroad);
  }

  road.update(bus.pos.z);
  terrain.update(bus.pos.x, bus.pos.z);
  props.update(bus.pos, biome);
  sky.update(bus.pos, dt);
  updateCamera(dt);

  renderer.render(scene, camera);
}

// warm up world around spawn before first frame
road.update(0);
terrain.update(0, 0);
bus.reset();
camPos.set(bus.pos.x - Math.sin(bus.yaw) * 13, bus.pos.y + 5.2, bus.pos.z - Math.cos(bus.yaw) * 13);
tick();
