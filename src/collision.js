// Sphere-vs-world and segment-vs-world collision. Pure, allocation-free in
// the hot path.
//
// `buildings` is `city.buildings` from `generateCity`: an array of
// `{ min, max }` where each is a Vector3-shaped `{x, y, z}` — we only read
// those three fields, so no THREE import is needed here. The array is treated
// as a flat AABB list; nothing here assumes one AABB == one building beyond
// the `hit: i` index semantics.
//
// AABBs are indexed in a uniform grid hashed on XZ (`CELL_SIZE` = the city's
// 80 m block period; buildings all start at y=0, so Y is ignored). The grid is
// built once at creation; queries only test AABBs in the cells they overlap.
//
// `check(position)` returns `null` on a clear position, or
// `{ kind: 'building' | 'ground', hit: <index|null>, normal: {x,y,z}, depth }`
// on contact. Ground fires when the sphere center's y drops to
// `groundY + planeRadius`; its normal is +Y.
//
// `checkSegment(from, to)` sweeps a point from `from` to `to` and returns
// `null` on a clear path, or
// `{ kind, hit, t, point: {x,y,z}, normal: {x,y,z} }` for the nearest hit
// (t ∈ [0,1] along the segment). Ground for segments is the actual plane at
// `groundY` — no sphere padding.
//
// Results are reused scratch objects: each is invalidated by the next call to
// the same query. Copy fields out if you need them to survive.

const CELL_SIZE = 80;
// Cell coords are offset+packed into one integer Map key. The city is ~2 km
// (±13 cells); KEY_OFFSET/KEY_STRIDE leave room for a far larger world.
const KEY_OFFSET = 4096;
const KEY_STRIDE = 8192;

export function createCollisionSystem({ buildings, groundY = 0, planeRadius = 2 }) {
  const r2 = planeRadius * planeRadius;

  // Build the grid once. Each bucket is an array of AABB indices; an AABB is
  // pushed into every cell its XZ footprint overlaps.
  const grid = new Map();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const cx0 = Math.floor(b.min.x / CELL_SIZE);
    const cx1 = Math.floor(b.max.x / CELL_SIZE);
    const cz0 = Math.floor(b.min.z / CELL_SIZE);
    const cz1 = Math.floor(b.max.z / CELL_SIZE);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = (cx + KEY_OFFSET) * KEY_STRIDE + (cz + KEY_OFFSET);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(i);
      }
    }
  }

  // Scratch results — reused across calls, never allocated in the hot path.
  const checkResult = { kind: '', hit: null, normal: { x: 0, y: 0, z: 0 }, depth: 0 };
  const segmentResult = {
    kind: '',
    hit: null,
    t: 0,
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 0 },
  };

  // Fills checkResult.normal/depth for a sphere at (px,py,pz) whose closest
  // AABB point is (cx,cy,cz), d2 away. When the center is inside the AABB
  // (d2 === 0) the contact is the nearest face instead.
  function fillSphereContact(b, px, py, pz, cx, cy, cz, d2) {
    const n = checkResult.normal;
    if (d2 > 0) {
      const dist = Math.sqrt(d2);
      const inv = 1 / dist;
      n.x = (px - cx) * inv;
      n.y = (py - cy) * inv;
      n.z = (pz - cz) * inv;
      checkResult.depth = planeRadius - dist;
      return;
    }
    // Center inside the box: push out through the nearest face.
    let best = px - b.min.x;
    let nx = -1;
    let ny = 0;
    let nz = 0;
    let d = b.max.x - px;
    if (d < best) { best = d; nx = 1; ny = 0; nz = 0; }
    d = py - b.min.y;
    if (d < best) { best = d; nx = 0; ny = -1; nz = 0; }
    d = b.max.y - py;
    if (d < best) { best = d; nx = 0; ny = 1; nz = 0; }
    d = pz - b.min.z;
    if (d < best) { best = d; nx = 0; ny = 0; nz = -1; }
    d = b.max.z - pz;
    if (d < best) { best = d; nx = 0; ny = 0; nz = 1; }
    n.x = nx;
    n.y = ny;
    n.z = nz;
    checkResult.depth = planeRadius + best;
  }

  return {
    check(position) {
      const px = position.x;
      const py = position.y;
      const pz = position.z;

      if (py <= groundY + planeRadius) {
        checkResult.kind = 'ground';
        checkResult.hit = null;
        checkResult.normal.x = 0;
        checkResult.normal.y = 1;
        checkResult.normal.z = 0;
        checkResult.depth = groundY + planeRadius - py;
        return checkResult;
      }

      const cx0 = Math.floor((px - planeRadius) / CELL_SIZE);
      const cx1 = Math.floor((px + planeRadius) / CELL_SIZE);
      const cz0 = Math.floor((pz - planeRadius) / CELL_SIZE);
      const cz1 = Math.floor((pz + planeRadius) / CELL_SIZE);

      for (let gx = cx0; gx <= cx1; gx++) {
        for (let gz = cz0; gz <= cz1; gz++) {
          const bucket = grid.get((gx + KEY_OFFSET) * KEY_STRIDE + (gz + KEY_OFFSET));
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) {
            const i = bucket[k];
            const b = buildings[i];
            const cx = px < b.min.x ? b.min.x : px > b.max.x ? b.max.x : px;
            const cy = py < b.min.y ? b.min.y : py > b.max.y ? b.max.y : py;
            const cz = pz < b.min.z ? b.min.z : pz > b.max.z ? b.max.z : pz;
            const dx = px - cx;
            const dy = py - cy;
            const dz = pz - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 <= r2) {
              checkResult.kind = 'building';
              checkResult.hit = i;
              fillSphereContact(b, px, py, pz, cx, cy, cz, d2);
              return checkResult;
            }
          }
        }
      }

      return null;
    },

    checkSegment(from, to) {
      const fx = from.x;
      const fy = from.y;
      const fz = from.z;
      const dx = to.x - fx;
      const dy = to.y - fy;
      const dz = to.z - fz;

      let bestT = Infinity;
      let bestHit = null;
      let bestNx = 0;
      let bestNy = 0;
      let bestNz = 0;

      // Ground plane: crossing (or starting at/under) y = groundY.
      if (fy <= groundY) {
        bestT = 0;
        bestNy = 1;
      } else if (dy < 0 && to.y <= groundY) {
        bestT = (groundY - fy) / dy;
        bestNy = 1;
      }

      // Buildings in the cells the segment's XZ bounds overlap. Buckets hold
      // every AABB overlapping a cell, so the covering rectangle of cells
      // covers every cell the segment traverses.
      const cx0 = Math.floor(Math.min(fx, to.x) / CELL_SIZE);
      const cx1 = Math.floor(Math.max(fx, to.x) / CELL_SIZE);
      const cz0 = Math.floor(Math.min(fz, to.z) / CELL_SIZE);
      const cz1 = Math.floor(Math.max(fz, to.z) / CELL_SIZE);

      for (let gx = cx0; gx <= cx1; gx++) {
        for (let gz = cz0; gz <= cz1; gz++) {
          const bucket = grid.get((gx + KEY_OFFSET) * KEY_STRIDE + (gz + KEY_OFFSET));
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) {
            const i = bucket[k];
            const b = buildings[i];

            // Slab test on the segment (t ∈ [0,1]), tracking the entry axis
            // for the face normal.
            let tMin = 0;
            let tMax = 1;
            let nx = 0;
            let ny = 0;
            let nz = 0;

            // X slab
            if (dx === 0) {
              if (fx < b.min.x || fx > b.max.x) continue;
            } else {
              const inv = 1 / dx;
              let t0 = (b.min.x - fx) * inv;
              let t1 = (b.max.x - fx) * inv;
              const sign = inv < 0 ? 1 : -1;
              if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
              if (t0 > tMin) { tMin = t0; nx = sign; ny = 0; nz = 0; }
              if (t1 < tMax) tMax = t1;
              if (tMin > tMax) continue;
            }

            // Y slab
            if (dy === 0) {
              if (fy < b.min.y || fy > b.max.y) continue;
            } else {
              const inv = 1 / dy;
              let t0 = (b.min.y - fy) * inv;
              let t1 = (b.max.y - fy) * inv;
              const sign = inv < 0 ? 1 : -1;
              if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
              if (t0 > tMin) { tMin = t0; nx = 0; ny = sign; nz = 0; }
              if (t1 < tMax) tMax = t1;
              if (tMin > tMax) continue;
            }

            // Z slab
            if (dz === 0) {
              if (fz < b.min.z || fz > b.max.z) continue;
            } else {
              const inv = 1 / dz;
              let t0 = (b.min.z - fz) * inv;
              let t1 = (b.max.z - fz) * inv;
              const sign = inv < 0 ? 1 : -1;
              if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
              if (t0 > tMin) { tMin = t0; nx = 0; ny = 0; nz = sign; }
              if (t1 < tMax) tMax = t1;
              if (tMin > tMax) continue;
            }

            if (tMin < bestT) {
              bestT = tMin;
              bestHit = i;
              bestNx = nx;
              bestNy = ny;
              bestNz = nz;
            }
          }
        }
      }

      if (bestT === Infinity) return null;

      segmentResult.kind = bestHit === null ? 'ground' : 'building';
      segmentResult.hit = bestHit;
      segmentResult.t = bestT;
      segmentResult.point.x = fx + dx * bestT;
      segmentResult.point.y = fy + dy * bestT;
      segmentResult.point.z = fz + dz * bestT;
      segmentResult.normal.x = bestNx;
      segmentResult.normal.y = bestNy;
      segmentResult.normal.z = bestNz;
      return segmentResult;
    },
  };
}
