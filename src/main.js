import * as THREE from 'three';
import './style.css';
import { createRoad } from './road.js';
import { TerrainManager } from './terrain.js';
import { Bus } from './bus.js';
import { Sky, Props } from './environment.js';
import { DashainManager } from './dashain.js';
import { AudioManager } from './audio.js';
import { initUI } from './ui.js';
import { inject } from '@vercel/analytics';

// web analytics (no-op unless deployed on Vercel)
try { inject(); } catch { /* ignore — analytics unavailable */ }

// ---------- renderer / scene ----------
const canvas = document.createElement('canvas'); // replaced by ui; keep ref safe
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ---------- world ----------
const road = createRoad(scene);
const terrain = new TerrainManager(scene, 'hills');
const bus = new Bus(scene, terrain);
const sky = new Sky(scene, renderer);
const props = new Props(scene, terrain, 'high');
const dashain = new DashainManager(scene, terrain, bus, renderer);
const audio = new AudioManager();

// ---------- state ----------
const keys = { up: false, down: false, left: false, right: false };
const touch = { up: false, down: false, left: false, right: false };
let started = false;
let camMode = 0; // 0 chase, 1 hood, 2 top, 3 cine
let biome = 'hills';
let theme = 'normal';
let timePreset = 'noon';
let savedTime = 'noon'; // daytime remembered while Dashain forces night
let weather = 'clear';
let quality = 'high';
const camPos = new THREE.Vector3(0, 6, -14);
const camLook = new THREE.Vector3();
// cabin drag-to-look state
let lookYaw = 0;
let lookPitch = 0;
let dragging = false;
let lastPX = 0;
let lastPY = 0;

function setCamMode(c) {
  camMode = c;
  lookYaw = 0;
  lookPitch = 0;
  ui.setCamera(c);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Force landscape mode on mobile
function forceLandscape() {
  if (screen.orientation) {
    screen.orientation.lock('landscape')
      .then(() => {
        // Successfully locked to landscape
        enterFullscreen();
      })
      .catch(() => {
        // Lock failed, try fullscreen instead
        enterFullscreen();
      });
  } else {
    enterFullscreen();
  }
}

function enterFullscreen() {
  const canvas = document.getElementById('game-canvas');
  if (document.fullscreenElement) return;
  if (canvas.requestFullscreen) {
    canvas.requestFullscreen();
  } else if (canvas.mozRequestFullScreen) { // Firefox
    canvas.mozRequestFullScreen();
  } else if (canvas.webkitRequestFullscreen) { // Chrome/Safari
    canvas.webkitRequestFullscreen();
  }
}

// Try to force landscape on load
window.addEventListener('load', forceLandscape);

// Handle orientation changes
window.addEventListener('orientationchange', () => {
  // Relock to landscape after orientation change
  setTimeout(forceLandscape, 100);
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.up = true;
  if (k === 's' || k === 'arrowdown') keys.down = true;
  if (k === 'a' || k === 'arrowleft') keys.left = true;
  if (k === 'd' || k === 'arrowright') keys.right = true;
  if (k === 'r') bus.reset();
  if (k === 'c') setCamMode((camMode + 1) % 5);
  if (k === 'f') { bus.autodrive = !bus.autodrive; ui.setAuto(bus.autodrive); }
  if (k === 'q') ui.cycleBiome(-1);
  if (k === 'e') ui.cycleBiome(1);
  if (k === 't') applyTheme(theme === 'dashain' ? 'normal' : 'dashain');
  if (k === 'm') ui.setMuted(audio.toggleMute());
  if (k === 'h') audio.horn();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.up = false;
  if (k === 's' || k === 'arrowdown') keys.down = false;
  if (k === 'a' || k === 'arrowleft') keys.left = false;
  if (k === 'd' || k === 'arrowright') keys.right = false;
});

// drag-to-look inside the cabin (mouse or touch)
window.addEventListener('pointerdown', (e) => {
  if (camMode === 4 && e.target && e.target.id === 'game-canvas') {
    dragging = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
  }
});
window.addEventListener('pointermove', (e) => {
  if (!dragging || camMode !== 4) return;
  lookYaw = THREE.MathUtils.clamp(lookYaw - (e.clientX - lastPX) * 0.0032, -1.05, 1.05);
  lookPitch = THREE.MathUtils.clamp(lookPitch - (e.clientY - lastPY) * 0.0028, -0.42, 0.5);
  lastPX = e.clientX;
  lastPY = e.clientY;
});
const endDrag = () => { dragging = false; };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// ---------- UI ----------
const ui = initUI({
  touch,
  onBegin: (s) => {
    started = true;
    audio.start((s.theme || 'normal') === 'dashain');
    applyAll(s.biome, s.theme || 'normal', s.time, s.weather);
  },
  onBiome: (b) => { biome = b; terrain.setBiome(b); },
  onTheme: (t) => { applyTheme(t); audio.setFestive(t === 'dashain'); },
  onTime: (t) => { timePreset = t; savedTime = t; bus.setNight(sky.apply(t, weather)); },
  onWeather: (w) => { weather = w; bus.setNight(sky.apply(timePreset, w)); bus.setWipers(w === 'rain'); },
  onQuality: (q) => {
    quality = q;
    renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 1.5) : 1);
    props.setDensity(q);
    dashain.setDensity(q);
  },
  onCamera: (c) => setCamMode(c),
  onReset: () => bus.reset(),
  onToggleMute: () => audio.toggleMute(),
  onToggleAuto: () => {
    bus.autodrive = !bus.autodrive;
    // release throttle keys so auto doesn't fight input
    keys.up = keys.down = false;
    return bus.autodrive;
  },
});

function applyTheme(t) {
  theme = t;
  dashain.setEnabled(t === 'dashain');
  ui.setTheme(t);
  // Dashain mode is fully night so the string lights, lanterns and
  // gate bulbs pop. Time select is locked while Dashain is active.
  const timeSel = document.getElementById('sel-time');
  if (t === 'dashain') {
    timeSel.value = 'night';
    timeSel.disabled = true;
    timePreset = 'night';
  } else {
    timeSel.disabled = false;
    timePreset = savedTime;
    timeSel.value = savedTime;
  }
  bus.setNight(sky.apply(timePreset, weather));
}

function applyAll(b, th, ti, w) {
  biome = b; weather = w; savedTime = ti;
  terrain.setBiome(b);
  applyTheme(th);
  document.getElementById('sel-biome').value = b;
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
  // cabin needs a close near plane for the dashboard + narrower fov
  const wantNear = camMode === 4 ? 0.12 : 0.5;
  const wantFov = camMode === 4 ? 62 : 65;
  if (camera.near !== wantNear || camera.fov !== wantFov) {
    camera.near = wantNear;
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  }
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
  } else if (camMode === 3) {
    const t = performance.now() * 0.00012;
    const side = new THREE.Vector3(Math.cos(t) * 16, 0, Math.sin(t) * 16);
    const ideal = new THREE.Vector3().copy(p).add(side).add(new THREE.Vector3(0, 3.5, 0));
    camPos.lerp(ideal, 1 - Math.pow(0.01, dt));
    camLook.copy(p).add(new THREE.Vector3(0, 1.5, 0));
  } else {
    // first-person driver seat (right-hand drive) + drag-to-look
    const s = Math.sin(bus.yaw);
    const c = Math.cos(bus.yaw);
    const ex = -0.65; // driver sits right
    const ez = 2.75;
    const shake = Math.min(Math.abs(bus.speed) / 30, 1);
    const t = performance.now() * 0.001;
    const bump = (Math.sin(t * 31) * 0.5 + Math.sin(t * 47) * 0.5) * 0.014 * shake;
    // head leans slightly with steering (bus-right in world = (-c, 0, s))
    const lean = bus.steerVis * 0.28;
    camPos.set(
      p.x + ex * c + ez * s + -c * lean,
      p.y + 2.5 + bump,
      p.z + -ex * s + ez * c + s * lean
    );
    const dirA = bus.yaw + lookYaw;
    const cp = Math.cos(lookPitch);
    camLook.set(
      camPos.x + Math.sin(dirA) * 40 * cp,
      camPos.y + Math.sin(lookPitch) * 40 - 1.1,
      camPos.z + Math.cos(dirA) * 40 * cp
    );
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (camMode === 4) camera.rotateZ(bus.steerVis * 0.05); // cornering roll
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
    audio.setEngine(speed);
    bus.updateCabin(Math.abs(speed) * 3.6, input, dt, performance.now() * 0.001);
  } else {
    bus.updateCabin(0, {}, dt, performance.now() * 0.001);
  }

  road.update(bus.pos.z);
  terrain.update(bus.pos.x, bus.pos.z);
  props.update(bus.pos, biome);
  dashain.update(bus.pos, dt, performance.now() * 0.001);
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
