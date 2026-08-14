import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const DEFAULTS = {
  count: 320,
  footprint: 2000,
  overhang: 300,
  altitude: 250,
  thickness: 100,
  puffSize: 220,
  puffSizeJitter: 0.5,
  driftSpeed: 2,
  color: 0xe8e8ee,
};

function makePuffTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.75)');
  gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.18)');
  gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Deterministic puffy cloud layer above the city.
 *
 * Puffs are billboarded to face `options.camera` every frame; drift is a fixed
 * horizontal vector seeded from `seed`, wrapping around the padded footprint so
 * the sky never empties out.
 *
 * @param {number} seed
 * @param {{ camera: THREE.Camera } & Partial<typeof DEFAULTS>} options
 */
export function createClouds(seed, options) {
  const cfg = { ...DEFAULTS, ...options };
  if (!cfg.camera) throw new Error('createClouds: options.camera is required');

  const rand = mulberry32(seed ^ 0xc10d);
  const half = cfg.footprint / 2;
  const bound = half + cfg.overhang;
  const span = bound * 2;

  const basePos = new Float32Array(cfg.count * 3);
  const sizes = new Float32Array(cfg.count);
  for (let i = 0; i < cfg.count; i++) {
    basePos[i * 3 + 0] = -bound + rand() * span;
    basePos[i * 3 + 1] = cfg.altitude + (rand() - 0.5) * cfg.thickness;
    basePos[i * 3 + 2] = -bound + rand() * span;
    sizes[i] = cfg.puffSize * (1 - cfg.puffSizeJitter + rand() * cfg.puffSizeJitter * 2);
  }

  // Drift direction — a fixed unit vector in the XZ plane, seeded from SEED.
  const driftAngle = rand() * Math.PI * 2;
  const driftX = Math.cos(driftAngle) * cfg.driftSpeed;
  const driftZ = Math.sin(driftAngle) * cfg.driftSpeed;

  const texture = makePuffTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: cfg.color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, cfg.count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  const dummy = new THREE.Object3D();
  const cameraPos = new THREE.Vector3();
  const puffPos = new THREE.Vector3();
  let elapsed = 0;

  function writeMatrices() {
    cfg.camera.getWorldPosition(cameraPos);
    const offsetX = driftX * elapsed;
    const offsetZ = driftZ * elapsed;
    for (let i = 0; i < cfg.count; i++) {
      let x = basePos[i * 3 + 0] + offsetX;
      let z = basePos[i * 3 + 2] + offsetZ;
      // Wrap around the padded footprint so puffs never leave the sky.
      x = ((((x + bound) % span) + span) % span) - bound;
      z = ((((z + bound) % span) + span) % span) - bound;
      puffPos.set(x, basePos[i * 3 + 1], z);
      dummy.position.copy(puffPos);
      dummy.lookAt(cameraPos);
      dummy.scale.set(sizes[i], sizes[i], 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  writeMatrices();

  return {
    mesh,
    update(dt) {
      elapsed += dt;
      writeMatrices();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
