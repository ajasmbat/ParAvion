import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { generateCity } from './city.js';
import { createCameraController } from './camera.js';

export const SEED = 1337;

const SKY = 0x87ceeb;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 30, 60);
camera.lookAt(0, 20, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(200, 400, 150);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshLambertMaterial({ color: 0x3a5a3a }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Ticket PARA-Y6KLG7 only wires the stubs. City + camera come from siblings.
const rng = mulberry32(SEED);
void rng;
const city = generateCity(SEED);
if (city.mesh) scene.add(city.mesh);
const controls = createCameraController(camera, renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Basic rAF loop. PARA-ME3QRO replaces this with a fixed-timestep accumulator.
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  controls.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
