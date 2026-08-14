import * as THREE from 'three';
import { generateCity } from './city.js';
import { spawnMailbox } from './mailbox.js';
import { createCameraController } from './camera.js';
import { createClouds } from './clouds.js';
import { createStorm } from './storm.js';
import { createAirplane } from './airplane.js';
import { createModeManager } from './mode-manager.js';
import { createRadar } from './radar.js';

export const SEED = 1337;

// Sky + fog share this exact hex to avoid a visible horizon seam.
const SKY = 0x9ec7e8;
const FOG_DENSITY = 0.0008;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.FogExp2(SKY, FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.set(0, 400, 0);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(200, 400, 150);
sun.castShadow = false;
scene.add(sun);

const city = generateCity(SEED);
scene.add(city.mesh);
scene.add(city.ground);

const mailbox = spawnMailbox(SEED, city.buildings);
scene.add(mailbox.mesh);
window.__mailbox = mailbox;

const clouds = createClouds(SEED, { camera });
scene.add(clouds.mesh);

const flycam = createCameraController(camera, renderer.domElement);
const airplane = createAirplane(scene);
const modes = createModeManager({ camera, domElement: renderer.domElement, airplane, flycam });
const storm = createStorm(scene, camera);

document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') storm.setMuted(!storm.isMuted());
});

const rateInput = document.getElementById('rate');
const applyRate = () => {
  // t=0 → calm (12–18s between strikes); t=1 → intense (~0.48–0.72s).
  // Exponential curve gives finer control near the calm end, where a linear
  // slider would feel unresponsive.
  const t = parseFloat(rateInput.value);
  const min = 12 * Math.pow(0.04, t);
  const max = 18 * Math.pow(0.04, t);
  storm.setStrikeRate(min, max);
};
rateInput.addEventListener('input', applyRate);
applyRate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hud = document.getElementById('hud');
const radar = createRadar({
  hudRoot: document.body,
  getPlanePosition: () => camera.position,
  getMailboxPosition: () => window.__mailbox.position,
});
let fps = 60;
let hudLast = 0;

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function update(dt) {
  modes.update(dt);
  clouds.update(dt);
  storm.update(dt);
  radar.update(dt);
}

function render(now) {
  const rawDt = (now - last) / 1000;
  if (rawDt > 0) fps = fps * 0.95 + (1 / rawDt) * 0.05;

  renderer.render(scene, camera);

  if (now - hudLast > 100) {
    hudLast = now;
    const p = camera.position;
    const stormTag = storm.isInZone() ? (storm.isMuted() ? '⛈ muted' : '⛈ ♪') : (storm.isMuted() ? 'muted' : '♪');
    const modeTag = modes.getMode() === 'airplane' ? '✈ airplane' : 'free-roam';
    const spd = modes.getSpeed();
    hud.textContent =
      `pos: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  ` +
      `alt: ${p.y.toFixed(0)} m  ` +
      `spd: ${spd.toFixed(0)} m/s  ` +
      `fps: ${fps.toFixed(0)}  ` +
      `[C] ${modeTag}  ` +
      `[M] ${stormTag}`;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  render(now);
}
requestAnimationFrame(frame);
