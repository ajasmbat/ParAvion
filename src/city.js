import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// City layout units (metres). Interpretation of "blocks 60m, avenues 20m,
// alleys 8m": a coarse 80m-period grid of 60m blocks separated by 20m
// avenues; each block is bisected by one 8m alley into two 26m-deep lots.
const CITY_SIZE = 2000;
const BLOCK_SIZE = 60;
const AVENUE = 20;
const ALLEY = 8;
const PERIOD = BLOCK_SIZE + AVENUE;
const LOT_DEPTH = (BLOCK_SIZE - ALLEY) / 2;

const BUILDING_MIN_DIM = 15;
const BUILDING_MAX_DIM = 50;
const HEIGHT_MIN = 30;
const HEIGHT_MAX = 180;

const GROUND_COLOR = 0x2a2a2a;
const BASE_COLOR = [0.784, 0.784, 0.784]; // ~#c8c8c8
const COLOR_JITTER = 0.15;

/**
 * Generate a deterministic 2km x 2km procedural city as a single InstancedMesh.
 * Returns `{ mesh, buildings, ground }` — `ground` is a separate mesh so main.js
 * can add it independently.
 * @param {number} seed
 */
export function generateCity(seed) {
  const rand = mulberry32(seed);
  const halfCity = CITY_SIZE / 2;
  const blocksPerSide = Math.floor(CITY_SIZE / PERIOD);
  const maxDist = Math.hypot(halfCity, halfCity);

  const buildings = [];
  const colors = [];

  for (let row = 0; row < blocksPerSide; row++) {
    for (let col = 0; col < blocksPerSide; col++) {
      const bx = -halfCity + col * PERIOD;
      const bz = -halfCity + row * PERIOD;

      // Alternate alley orientation per block for a bit of variety.
      const alleyRunsX = ((row + col) & 1) === 0;

      const lots = alleyRunsX
        ? [
            { x0: bx, z0: bz, w: BLOCK_SIZE, d: LOT_DEPTH },
            { x0: bx, z0: bz + LOT_DEPTH + ALLEY, w: BLOCK_SIZE, d: LOT_DEPTH },
          ]
        : [
            { x0: bx, z0: bz, w: LOT_DEPTH, d: BLOCK_SIZE },
            { x0: bx + LOT_DEPTH + ALLEY, z0: bz, w: LOT_DEPTH, d: BLOCK_SIZE },
          ];

      for (const lot of lots) {
        // Occasionally skip a lot for visual variety (small parks / gaps).
        if (rand() < 0.08) continue;

        const maxW = Math.min(BUILDING_MAX_DIM, lot.w);
        const maxD = Math.min(BUILDING_MAX_DIM, lot.d);
        const width = BUILDING_MIN_DIM + rand() * (maxW - BUILDING_MIN_DIM);
        const depth = BUILDING_MIN_DIM + rand() * (maxD - BUILDING_MIN_DIM);
        const padX = rand() * (lot.w - width);
        const padZ = rand() * (lot.d - depth);
        const minX = lot.x0 + padX;
        const minZ = lot.z0 + padZ;
        const centerX = minX + width / 2;
        const centerZ = minZ + depth / 2;

        // Height falls off toward the map edges — downtown (center) is tallest.
        const dist = Math.hypot(centerX, centerZ);
        const t = Math.min(1, dist / maxDist);
        const target = HEIGHT_MAX + (HEIGHT_MIN - HEIGHT_MAX) * t;
        const jitter = 0.7 + rand() * 0.6;
        const height = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, target * jitter));

        buildings.push({
          min: new THREE.Vector3(minX, 0, minZ),
          max: new THREE.Vector3(minX + width, height, minZ + depth),
        });

        const jr = (rand() * 2 - 1) * COLOR_JITTER;
        const jg = (rand() * 2 - 1) * COLOR_JITTER;
        const jb = (rand() * 2 - 1) * COLOR_JITTER;
        colors.push(
          Math.max(0, Math.min(1, BASE_COLOR[0] * (1 + jr))),
          Math.max(0, Math.min(1, BASE_COLOR[1] * (1 + jg))),
          Math.max(0, Math.min(1, BASE_COLOR[2] * (1 + jb))),
        );
      }
    }
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, buildings.length);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    scale.set(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    position.set((b.min.x + b.max.x) / 2, b.max.y / 2, (b.min.z + b.max.z) / 2);
    matrix.compose(position, quat, scale);
    mesh.setMatrixAt(i, matrix);
  }

  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(colors), 3);
  mesh.instanceColor = colorAttr;
  mesh.instanceMatrix.needsUpdate = true;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_SIZE, CITY_SIZE),
    new THREE.MeshLambertMaterial({ color: GROUND_COLOR }),
  );
  ground.rotation.x = -Math.PI / 2;

  return { mesh, buildings, ground };
}
