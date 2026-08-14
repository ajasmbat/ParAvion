import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const USPS_BLUE = 0x1c3660;
const BODY_W = 0.7;
const BODY_H = 1.35;
const BODY_D = 0.5;
const DOME_RADIUS = 0.35;

const CITY_HALF = 1000;
const CLEARANCE = 2;
const MAX_ATTEMPTS = 200;

// Separate PRNG stream so mailbox placement doesn't perturb city geometry.
const MAILBOX_SEED_XOR = 0x1a11b0;

/**
 * Spawn a single USPS-blue mailbox at a deterministic random ground position
 * that lies outside every building AABB (padded by CLEARANCE metres).
 * @param {number} seed
 * @param {Array<{min: THREE.Vector3, max: THREE.Vector3}>} buildings
 * @returns {{ mesh: THREE.Group, position: THREE.Vector3 }}
 */
export function spawnMailbox(seed, buildings) {
  const rand = mulberry32((seed ^ MAILBOX_SEED_XOR) | 0);

  let x = 0;
  let z = 0;
  let placed = false;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const cx = (rand() * 2 - 1) * CITY_HALF;
    const cz = (rand() * 2 - 1) * CITY_HALF;
    if (isClear(cx, cz, buildings)) {
      x = cx;
      z = cz;
      placed = true;
      break;
    }
  }
  if (!placed) {
    // Fallback: nudge origin outward radially until it clears any overlap.
    x = 0;
    z = 0;
    let step = 0;
    while (!isClear(x, z, buildings) && step < CITY_HALF) {
      step += 4;
      x = step;
      z = 0;
    }
  }

  const position = new THREE.Vector3(x, 0, z);
  const mesh = buildMesh(position);
  console.info(`[mailbox] spawned at (${x.toFixed(2)}, 0, ${z.toFixed(2)})`);
  return { mesh, position };
}

function isClear(x, z, buildings) {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (
      x >= b.min.x - CLEARANCE &&
      x <= b.max.x + CLEARANCE &&
      z >= b.min.z - CLEARANCE &&
      z <= b.max.z + CLEARANCE
    ) {
      return false;
    }
  }
  return true;
}

function buildMesh(position) {
  const material = new THREE.MeshLambertMaterial({ color: USPS_BLUE });
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D), material);
  body.position.y = BODY_H / 2;
  group.add(body);

  const dome = new THREE.Mesh(
    new THREE.CylinderGeometry(DOME_RADIUS, DOME_RADIUS, BODY_W, 16, 1, false, 0, Math.PI),
    material,
  );
  // Half-cylinder lays on its side across the body's width, dome curving upward.
  dome.rotation.z = Math.PI / 2;
  dome.position.y = BODY_H;
  group.add(dome);

  group.position.copy(position);
  return group;
}
