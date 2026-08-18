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

// Setback tiers (1930s NY massing): buildings above TIER_MIN_HEIGHT render as
// 2–4 stacked boxes with progressively smaller, centered footprints. Landmarks
// are a post-pass promoting the tallest downtown lots past HEIGHT_MAX.
const TIER_MIN_HEIGHT = 100;
const TIER_MIN_DIM = 8;
const LANDMARK_COUNT = 4;
const LANDMARK_HEIGHT_MIN = 220;
const LANDMARK_HEIGHT_MAX = 300;

// Rooftop clutter (masts / water tanks / AC boxes) on buildings above this.
// Decorative only — no collision AABBs.
const DETAIL_MIN_HEIGHT = 90;
const MAST_COLOR = 0x33343a;
const TANK_COLOR = 0x6e4a38;
const AC_COLOR = 0x94969c;

// Ground detail. The ground stays ONE mesh; the street grid is painted once
// into a CanvasTexture covering the whole city (~1 px per metre) rather than
// spawning geometry per street. Colours are authored in sRGB hex strings.
const GROUND_TEX_SIZE = 2048;
const ASPHALT_COLOR = '#1b1c1f'; // avenues + intersections
const ALLEY_COLOR = '#181819'; // service alleys — plain, unmarked
const SIDEWALK_COLOR = '#4a4b50'; // curb rim around each block
const LOT_COLOR = '#35363a'; // block interior (pavement / building footprints)
const PARK_COLOR = '#2c4526';
const TREE_COLOR = '#1e3419';
const LANE_COLOR = '#c8b46a'; // weathered centre-line paint
const SIDEWALK_WIDTH = 3;
const LANE_WIDTH = 1.4;
const LANE_DASH = 6;
const LANE_GAP = 6;

// Streetlights: two InstancedMeshes (pole + emissive head) lining both curbs of
// every avenue. Two per block face — 30 m apart inside a block, 50 m across the
// intersection — which averages the ~40 m spacing without dropping a lamp in
// the middle of a junction.
const LAMP_COLOR = 0xffd08a;
const POLE_COLOR = 0x27282c;
const POLE_HEIGHT = 7;
const POLE_RADIUS = 0.16;
const LAMP_RADIUS = 0.55;
const LAMP_OVERHANG = 1.3; // head cantilevered out over the roadway
const LAMP_CURB_INSET = 1.5; // metres in from the block edge
const LAMP_BLOCK_OFFSETS = [15, 45];

const GROUND_COLOR = 0x2a2a2a;
const BASE_COLOR = [0.784, 0.784, 0.784]; // ~#c8c8c8
const COLOR_JITTER = 0.15;

// Emissive window strip params — tuned in world metres so building size
// doesn't distort the storey spacing. Windows fill the top WINDOW_BAND_FRAC
// of each ROW_HEIGHT band and are gated to the top of the ground floor
// (WINDOW_MIN_Y) so the base doesn't smear into the ground plane.
const ROW_HEIGHT = 3.5;
const COL_WIDTH = 4.0;
const WINDOW_BAND_FRAC = 0.45;
const LIT_PROBABILITY = 0.55;
const WINDOW_MIN_Y = 3.0;
const WINDOW_COLOR = 0xffd39a;
const WINDOW_INTENSITY = 0.75;

/**
 * Generate a deterministic 2km x 2km procedural city as a single InstancedMesh
 * plus a few rooftop-detail InstancedMeshes.
 * Returns `{ mesh, detailMeshes, buildings, ground, streetMeshes }` — `ground`
 * is a separate mesh so main.js can add it independently, `detailMeshes` and
 * `streetMeshes` (streetlight poles + heads) are arrays of InstancedMeshes to
 * add alongside. `buildings` stays a flat list of axis-aligned `{ min, max }`
 * AABBs (one per tier) for the collision system; ground detail is visual only,
 * so nothing here is collidable and the ground plane stays at y = 0.
 * @param {number} seed
 */
export function generateCity(seed) {
  const rand = mulberry32(seed);
  const halfCity = CITY_SIZE / 2;
  const blocksPerSide = Math.floor(CITY_SIZE / PERIOD);
  const maxDist = Math.hypot(halfCity, halfCity);

  // Pass 1 — lot layout. Draw order on `rand` is unchanged from the original
  // single-box generator so the same seed keeps the same street layout.
  const sites = [];
  // Ground-painting inputs, recorded as the layout is walked: `blocks` carries
  // the alley orientation, `parks` the lots the skip branch below left empty.
  // Re-deriving either with a second pass over `rand` would desync the stream.
  const blocks = [];
  const parks = [];

  for (let row = 0; row < blocksPerSide; row++) {
    for (let col = 0; col < blocksPerSide; col++) {
      const bx = -halfCity + col * PERIOD;
      const bz = -halfCity + row * PERIOD;

      // Alternate alley orientation per block for a bit of variety.
      const alleyRunsX = ((row + col) & 1) === 0;
      blocks.push({ x0: bx, z0: bz, alleyRunsX });

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
        if (rand() < 0.08) {
          parks.push(lot);
          continue;
        }

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

        const jr = (rand() * 2 - 1) * COLOR_JITTER;
        const jg = (rand() * 2 - 1) * COLOR_JITTER;
        const jb = (rand() * 2 - 1) * COLOR_JITTER;
        const color = [
          Math.max(0, Math.min(1, BASE_COLOR[0] * (1 + jr))),
          Math.max(0, Math.min(1, BASE_COLOR[1] * (1 + jg))),
          Math.max(0, Math.min(1, BASE_COLOR[2] * (1 + jb))),
        ];

        sites.push({ minX, minZ, width, depth, height, color, dist, isLandmark: false });
      }
    }
  }

  // All new randomness (landmarks, tiering, rooftop clutter) comes from an
  // independent stream so it can't perturb the layout sequence above.
  const detailRand = mulberry32((seed + 0x85ebca6b) | 0);

  // Pass 2 — landmarks: promote the N tallest downtown lots past HEIGHT_MAX.
  // Heights clamp at HEIGHT_MAX downtown, so ties break toward the center.
  const byHeight = sites
    .map((_, i) => i)
    .sort((a, b) => sites[b].height - sites[a].height || sites[a].dist - sites[b].dist || a - b);
  for (let n = 0; n < Math.min(LANDMARK_COUNT, byHeight.length); n++) {
    const lot = sites[byHeight[n]];
    lot.isLandmark = true;
    lot.height = LANDMARK_HEIGHT_MIN + detailRand() * (LANDMARK_HEIGHT_MAX - LANDMARK_HEIGHT_MIN);
  }

  // Pass 3 — tiers + rooftop details. Each tier is one instance AND one AABB in
  // `buildings`, so collision sees the true stepped silhouette.
  const buildings = [];
  const colors = [];
  const masts = [];
  const tanks = [];
  const acs = [];

  for (const lot of sites) {
    const tiers = [];
    if (lot.height < TIER_MIN_HEIGHT) {
      tiers.push({ minX: lot.minX, minZ: lot.minZ, w: lot.width, d: lot.depth, y0: 0, y1: lot.height });
    } else {
      const tierCount = lot.isLandmark
        ? 3 + Math.floor(detailRand() * 2) // 3–4
        : 2 + Math.floor(detailRand() * 2); // 2–3

      // Bottom-heavy height split with per-tier jitter.
      const weights = [];
      let total = 0;
      for (let i = 0; i < tierCount; i++) {
        const w = Math.pow(0.55, i) * (0.85 + detailRand() * 0.3);
        weights.push(w);
        total += w;
      }

      const cx = lot.minX + lot.width / 2;
      const cz = lot.minZ + lot.depth / 2;
      let w = lot.width;
      let d = lot.depth;
      let y0 = 0;
      for (let i = 0; i < tierCount; i++) {
        const y1 = i === tierCount - 1 ? lot.height : y0 + (lot.height * weights[i]) / total;
        tiers.push({ minX: cx - w / 2, minZ: cz - d / 2, w, d, y0, y1 });
        y0 = y1;
        const shrink = 0.6 + detailRand() * 0.2;
        w = Math.max(TIER_MIN_DIM, w * shrink);
        d = Math.max(TIER_MIN_DIM, d * shrink);
      }
    }

    for (const t of tiers) {
      buildings.push({
        min: new THREE.Vector3(t.minX, t.y0, t.minZ),
        max: new THREE.Vector3(t.minX + t.w, t.y1, t.minZ + t.d),
      });
      colors.push(lot.color[0], lot.color[1], lot.color[2]);
    }

    // Rooftop details sit on the top tier. Offsets keep a >=1m roof margin.
    const top = tiers[tiers.length - 1];
    const roofY = top.y1;
    const off = (span, size) => (detailRand() - 0.5) * Math.max(0, span - size - 2);
    const rcx = top.minX + top.w / 2;
    const rcz = top.minZ + top.d / 2;

    if (lot.isLandmark) {
      // Landmarks always carry a tall spire mast, dead center.
      masts.push({ x: rcx, y: roofY, z: rcz, h: 28 + detailRand() * 14, r: 1.6 });
    } else if (lot.height >= DETAIL_MIN_HEIGHT) {
      const pick = detailRand();
      if (pick < 0.4) {
        masts.push({ x: rcx + off(top.w, 1), y: roofY, z: rcz + off(top.d, 1), h: 8 + detailRand() * 10, r: 1 });
      } else if (pick < 0.72) {
        tanks.push({ x: rcx + off(top.w, 4), y: roofY, z: rcz + off(top.d, 4), h: 4.5 + detailRand() * 1.5 });
      } else {
        acs.push({
          x: rcx + off(top.w, 3),
          y: roofY,
          z: rcz + off(top.d, 3),
          w: 2.5 + detailRand() * 1.5,
          h: 1.5 + detailRand() * 0.8,
          d: 2 + detailRand() * 1.2,
          yaw: detailRand() * Math.PI,
        });
      }
      // Tall roofs often carry a second small AC unit.
      if (detailRand() < 0.35) {
        acs.push({
          x: rcx + off(top.w, 2.5),
          y: roofY,
          z: rcz + off(top.d, 2.5),
          w: 2 + detailRand(),
          h: 1.2 + detailRand() * 0.6,
          d: 1.8 + detailRand(),
          yaw: detailRand() * Math.PI,
        });
      }
    }
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  installWindowShader(material);
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

  // Independent PRNG stream so adding this attribute doesn't perturb the
  // geometry/colour sequence consumed by `rand` above.
  const seedRand = mulberry32((seed + 0x9e3779b9) | 0);
  const windowSeeds = new Float32Array(buildings.length);
  for (let i = 0; i < buildings.length; i++) windowSeeds[i] = seedRand();
  geometry.setAttribute('aWindowSeed', new THREE.InstancedBufferAttribute(windowSeeds, 1));

  // Street grid + lamps. Lamp placement is pure geometry, so it is derived
  // first and fed back into the paint pass as glow pools on the asphalt —
  // that is what makes the light strings legible from cruising altitude.
  const lamps = layOutStreetlights(blocksPerSide, halfCity);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_SIZE, CITY_SIZE),
    new THREE.MeshLambertMaterial({
      color: GROUND_COLOR,
      map: paintGroundTexture(seed, blocks, parks, lamps),
    }),
  );
  // A painted ground modulates the map by `color`; an unpainted one keeps the
  // original flat GROUND_COLOR.
  if (ground.material.map) ground.material.color.setHex(0xffffff);
  ground.rotation.x = -Math.PI / 2;

  return {
    mesh,
    detailMeshes: buildDetailMeshes(masts, tanks, acs),
    buildings,
    ground,
    streetMeshes: buildStreetlightMeshes(lamps),
  };
}

/**
 * Streetlight positions along both curbs of every avenue. Returns
 * `{ x, z, dx, dz }` per lamp — position at the pole base, plus the unit
 * direction toward the roadway that the head is cantilevered over.
 * Fully deterministic from the grid; consumes no PRNG.
 */
function layOutStreetlights(blocksPerSide, halfCity) {
  const lamps = [];

  const runAvenue = (alongZ) => {
    for (let a = 0; a < blocksPerSide; a++) {
      // The avenue between block `a` and block `a + 1`.
      const near = -halfCity + a * PERIOD + BLOCK_SIZE; // roadway edge, low side
      const far = near + AVENUE; // roadway edge, high side
      const curbs = [{ at: near - LAMP_CURB_INSET, dir: 1 }];
      // The final avenue has no block beyond it to carry the far curb.
      if (a + 1 < blocksPerSide) curbs.push({ at: far + LAMP_CURB_INSET, dir: -1 });

      for (const curb of curbs) {
        for (let b = 0; b < blocksPerSide; b++) {
          const blockStart = -halfCity + b * PERIOD;
          for (const offset of LAMP_BLOCK_OFFSETS) {
            const along = blockStart + offset;
            lamps.push(
              alongZ
                ? { x: curb.at, z: along, dx: curb.dir, dz: 0 }
                : { x: along, z: curb.at, dx: 0, dz: curb.dir },
            );
          }
        }
      }
    }
  };

  runAvenue(true); // avenues running north–south (lamps stepped along z)
  runAvenue(false); // avenues running east–west (lamps stepped along x)
  return lamps;
}

/**
 * One InstancedMesh of pole cylinders + one of emissive lamp heads. The heads
 * are MeshBasicMaterial so they read as light sources without any real
 * THREE.PointLight — thousands of those would tank the frame rate — and still
 * fade into the scene fog at distance.
 */
function buildStreetlightMeshes(lamps) {
  if (lamps.length === 0) return [];

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const quat = new THREE.Quaternion();

  const poleGeometry = new THREE.CylinderGeometry(POLE_RADIUS * 0.7, POLE_RADIUS, POLE_HEIGHT, 5);
  poleGeometry.translate(0, POLE_HEIGHT / 2, 0);
  const poles = new THREE.InstancedMesh(
    poleGeometry,
    new THREE.MeshLambertMaterial({ color: POLE_COLOR }),
    lamps.length,
  );

  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(LAMP_RADIUS, 6, 4),
    new THREE.MeshBasicMaterial({ color: LAMP_COLOR }),
    lamps.length,
  );

  for (let i = 0; i < lamps.length; i++) {
    const lamp = lamps[i];
    position.set(lamp.x, 0, lamp.z);
    matrix.compose(position, quat, scale);
    poles.setMatrixAt(i, matrix);

    position.set(lamp.x + lamp.dx * LAMP_OVERHANG, POLE_HEIGHT, lamp.z + lamp.dz * LAMP_OVERHANG);
    matrix.compose(position, quat, scale);
    heads.setMatrixAt(i, matrix);
  }
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;

  return [poles, heads];
}

/**
 * Paint the whole 2km street grid into one CanvasTexture at ~1 px/metre:
 * asphalt avenues with dashed centre-lines, lighter block pavement with a
 * sidewalk curb rim, dark alley strips, and green parks on the skipped lots.
 * Returns null in a non-DOM environment (node physics tests import this
 * module), leaving the ground on its flat fallback colour.
 */
function paintGroundTexture(seed, blocks, parks, lamps) {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = GROUND_TEX_SIZE;
  canvas.height = GROUND_TEX_SIZE;
  const ctx = canvas.getContext('2d');

  const half = CITY_SIZE / 2;
  const scale = GROUND_TEX_SIZE / CITY_SIZE; // px per metre
  // World X -> canvas X and world Z -> canvas Y are the same increasing map:
  // the plane is rotated -90 deg about X and the texture is flipY, and the two
  // inversions cancel.
  const at = (v) => (v + half) * scale;
  const box = (x, z, w, d, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(at(x), at(z), w * scale, d * scale);
  };

  // Roadway everywhere, then blocks stamped back on top of it.
  box(-half, -half, CITY_SIZE, CITY_SIZE, ASPHALT_COLOR);

  for (const block of blocks) {
    box(block.x0, block.z0, BLOCK_SIZE, BLOCK_SIZE, SIDEWALK_COLOR);
    box(
      block.x0 + SIDEWALK_WIDTH,
      block.z0 + SIDEWALK_WIDTH,
      BLOCK_SIZE - SIDEWALK_WIDTH * 2,
      BLOCK_SIZE - SIDEWALK_WIDTH * 2,
      LOT_COLOR,
    );
    // The alley cuts the full depth of the block so its mouths open onto the
    // avenues at both ends.
    if (block.alleyRunsX) {
      box(block.x0, block.z0 + LOT_DEPTH, BLOCK_SIZE, ALLEY, ALLEY_COLOR);
    } else {
      box(block.x0 + LOT_DEPTH, block.z0, ALLEY, BLOCK_SIZE, ALLEY_COLOR);
    }
  }

  // Parks sit on the lots the layout pass skipped, inset so the block keeps its
  // sidewalk rim. Tree canopies come from an independent stream so they cannot
  // perturb the building sequence.
  const groundRand = mulberry32((seed + 0x27d4eb2f) | 0);
  for (const park of parks) {
    const x = park.x0 + SIDEWALK_WIDTH;
    const z = park.z0 + SIDEWALK_WIDTH;
    const w = park.w - SIDEWALK_WIDTH * 2;
    const d = park.d - SIDEWALK_WIDTH * 2;
    box(x, z, w, d, PARK_COLOR);

    ctx.fillStyle = TREE_COLOR;
    const trees = 3 + Math.floor(groundRand() * 4);
    for (let i = 0; i < trees; i++) {
      const r = 2.2 + groundRand() * 1.4;
      const tx = x + r + groundRand() * Math.max(0, w - r * 2);
      const tz = z + r + groundRand() * Math.max(0, d - r * 2);
      ctx.beginPath();
      ctx.arc(at(tx), at(tz), r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Dashed centre-lines, drawn per block span so no dash lands in a junction.
  const blocksPerSide = Math.floor(CITY_SIZE / PERIOD);
  const dashes = Math.floor(BLOCK_SIZE / (LANE_DASH + LANE_GAP));
  const dashStart = (BLOCK_SIZE - (dashes * (LANE_DASH + LANE_GAP) - LANE_GAP)) / 2;
  for (let a = 0; a < blocksPerSide; a++) {
    const center = -half + a * PERIOD + BLOCK_SIZE + AVENUE / 2 - LANE_WIDTH / 2;
    for (let b = 0; b < blocksPerSide; b++) {
      const spanStart = -half + b * PERIOD + dashStart;
      for (let i = 0; i < dashes; i++) {
        const along = spanStart + i * (LANE_DASH + LANE_GAP);
        box(center, along, LANE_WIDTH, LANE_DASH, LANE_COLOR);
        box(along, center, LANE_DASH, LANE_WIDTH, LANE_COLOR);
      }
    }
  }

  // Warm pools under the lamps. One pre-rendered sprite blitted per lamp keeps
  // this to a single gradient build instead of a few thousand.
  const glow = makeGlowSprite();
  const glowSize = 13 * scale;
  ctx.globalCompositeOperation = 'lighter';
  for (const lamp of lamps) {
    const gx = at(lamp.x + lamp.dx * LAMP_OVERHANG) - glowSize / 2;
    const gz = at(lamp.z + lamp.dz * LAMP_OVERHANG) - glowSize / 2;
    ctx.drawImage(glow, gx, gz, glowSize, glowSize);
  }
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // clamped to the device max on upload
  return texture;
}

/** A single soft radial falloff, reused for every lamp's ground pool. */
function makeGlowSprite() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(150, 116, 62, 1)');
  gradient.addColorStop(0.45, 'rgba(86, 66, 34, 0.55)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * One InstancedMesh per rooftop-detail geometry type (mast / water tank / AC
 * box) — 3 extra draw calls total, no per-building Mesh objects.
 */
function buildDetailMeshes(masts, tanks, acs) {
  const meshes = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Unit-height primitives with their base at y=0, so scale.y is the height
  // and position.y is the roof elevation directly.
  if (masts.length > 0) {
    const geometry = new THREE.CylinderGeometry(0.25, 0.6, 1, 6);
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: MAST_COLOR }), masts.length);
    for (let i = 0; i < masts.length; i++) {
      const it = masts[i];
      quat.identity();
      position.set(it.x, it.y, it.z);
      scale.set(it.r, it.h, it.r);
      matrix.compose(position, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  if (tanks.length > 0) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 10);
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: TANK_COLOR }), tanks.length);
    for (let i = 0; i < tanks.length; i++) {
      const it = tanks[i];
      quat.identity();
      position.set(it.x, it.y, it.z);
      scale.set(2, it.h, 2);
      matrix.compose(position, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  if (acs.length > 0) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: AC_COLOR }), acs.length);
    for (let i = 0; i < acs.length; i++) {
      const it = acs[i];
      quat.setFromAxisAngle(yAxis, it.yaw);
      position.set(it.x, it.y, it.z);
      scale.set(it.w, it.h, it.d);
      matrix.compose(position, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  return meshes;
}

/**
 * Extends the InstancedMesh's MeshLambertMaterial with procedural emissive
 * window strips on the four side faces. Per-instance variation is driven by
 * an `aWindowSeed` InstancedBufferAttribute. Uses `onBeforeCompile` so the
 * material keeps responding to DirectionalLight + AmbientLight and to scene
 * fog — dropping to a raw ShaderMaterial would lose both.
 */
function installWindowShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRowHeight = { value: ROW_HEIGHT };
    shader.uniforms.uColWidth = { value: COL_WIDTH };
    shader.uniforms.uWindowBandFrac = { value: WINDOW_BAND_FRAC };
    shader.uniforms.uLitProbability = { value: LIT_PROBABILITY };
    shader.uniforms.uWindowMinY = { value: WINDOW_MIN_Y };
    shader.uniforms.uWindowColor = { value: new THREE.Color(WINDOW_COLOR) };
    shader.uniforms.uWindowIntensity = { value: WINDOW_INTENSITY };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aWindowSeed;
        varying vec3 vWinWorldPos;
        varying vec3 vWinObjNormal;
        varying float vWinSeed;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWinObjNormal = normal;
        vWinSeed = aWindowSeed;
        vWinWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uRowHeight;
        uniform float uColWidth;
        uniform float uWindowBandFrac;
        uniform float uLitProbability;
        uniform float uWindowMinY;
        uniform vec3 uWindowColor;
        uniform float uWindowIntensity;
        varying vec3 vWinWorldPos;
        varying vec3 vWinObjNormal;
        varying float vWinSeed;
        float winHash(float x, float s) {
          return fract(sin(x * 12.9898 + s * 78.233) * 43758.5453);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Side faces only (skip roofs/undersides) and above the ground band.
        if (abs(vWinObjNormal.y) < 0.5 && vWinWorldPos.y > uWindowMinY) {
          float y = vWinWorldPos.y / uRowHeight;
          float rowFrac = fract(y);
          float rowIdx = floor(y);
          float bandMask = step(1.0 - uWindowBandFrac, rowFrac);

          // Horizontal coordinate along the wall's tangent (x on +/-z faces,
          // z on +/-x faces). Offset per-building so column phase varies.
          float horiz = vWinWorldPos.x * abs(vWinObjNormal.z)
                      + vWinWorldPos.z * abs(vWinObjNormal.x);
          horiz += vWinSeed * 17.0;
          float colIdx = floor(horiz / uColWidth);

          float litRand = winHash(colIdx + rowIdx * 91.7, vWinSeed);
          float lit = step(1.0 - uLitProbability, litRand);

          // Per-instance warm-white with small hue jitter.
          vec3 col = uWindowColor + vec3(
            (vWinSeed - 0.5) * 0.10,
            (fract(vWinSeed * 3.13) - 0.5) * 0.08,
            0.0
          );

          totalEmissiveRadiance += col * uWindowIntensity * bandMask * lit;
        }`
      );
  };
}
