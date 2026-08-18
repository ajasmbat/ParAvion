import { createCollisionSystem } from '../src/collision.js';
import { mulberry32 } from '../src/rng.js';

const v = (x, y, z) => ({ x, y, z });
const EPS = 1e-6;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('  ok:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) {
    console.error('FAIL:', msg, '\n    expected:', expected, '\n    actual:  ', actual);
    process.exitCode = 1;
  } else {
    console.log('  ok:', msg);
  }
}

// Compare a check()/checkSegment() result against expected fields with a
// float tolerance. `expected` may omit fields (only listed ones are checked).
function assertHit(actual, expected, msg) {
  if (!actual) {
    console.error('FAIL:', msg, '\n    expected a hit, got:', actual);
    process.exitCode = 1;
    return;
  }
  const problems = [];
  if ('kind' in expected && actual.kind !== expected.kind) {
    problems.push(`kind ${actual.kind} != ${expected.kind}`);
  }
  if ('hit' in expected && actual.hit !== expected.hit) {
    problems.push(`hit ${actual.hit} != ${expected.hit}`);
  }
  for (const scalar of ['depth', 't']) {
    if (scalar in expected && Math.abs(actual[scalar] - expected[scalar]) > EPS) {
      problems.push(`${scalar} ${actual[scalar]} != ${expected[scalar]}`);
    }
  }
  for (const vec of ['normal', 'point']) {
    if (vec in expected) {
      for (const axis of ['x', 'y', 'z']) {
        if (Math.abs(actual[vec][axis] - expected[vec][axis]) > EPS) {
          problems.push(`${vec}.${axis} ${actual[vec][axis]} != ${expected[vec][axis]}`);
        }
      }
    }
  }
  if (problems.length) {
    console.error('FAIL:', msg, '\n    ' + problems.join('\n    '), '\n    actual:', actual);
    process.exitCode = 1;
  } else {
    console.log('  ok:', msg);
  }
}

console.log('createCollisionSystem — buildings');
{
  const buildings = [{ min: v(-10, 0, -10), max: v(10, 50, 10) }];
  const sys = createCollisionSystem({ buildings });

  assertEqual(sys.check(v(0, 100, 0)), null, 'open sky above the building clears');
  assertHit(sys.check(v(0, 25, 0)), { kind: 'building', hit: 0 }, 'inside the AABB → building hit');
  assertEqual(sys.check(v(0, 25, 20)), null, 'well outside the AABB clears');

  // planeRadius=2, wall at x=10 → sphere center at x=11.5 is 1.5 from the wall → inside the sphere padding.
  assertHit(
    sys.check(v(11.5, 25, 0)),
    { kind: 'building', hit: 0 },
    '1.5 m from the wall face → 2 m sphere overlaps → hit',
  );

  // A center further out than r clears — 12.5 is 2.5 from the wall face → outside.
  assertEqual(sys.check(v(12.5, 25, 0)), null, '2.5 m from the wall face → 2 m sphere clears');
}

console.log('createCollisionSystem — ground');
{
  const buildings = [];
  const sys = createCollisionSystem({ buildings });

  // Sphere radius = 2, groundY = 0 → ground fires when y ≤ 2.
  assertHit(
    sys.check(v(0, -0.1, 0)),
    { kind: 'ground', hit: null, normal: v(0, 1, 0), depth: 2.1 },
    'below ground → ground hit with +Y normal and depth',
  );
  assertHit(sys.check(v(0, 1.9, 0)), { kind: 'ground', depth: 0.1 }, 'sphere touching ground → ground hit');
  assertEqual(sys.check(v(0, 2.1, 0)), null, 'sphere clear of ground → null');
}

console.log('createCollisionSystem — ground supersedes buildings');
{
  // Ground check runs first — cheap, and any position below ground level is a crash regardless.
  const buildings = [{ min: v(-10, 0, -10), max: v(10, 50, 10) }];
  const sys = createCollisionSystem({ buildings });
  assertHit(
    sys.check(v(0, -1, 0)),
    { kind: 'ground', hit: null },
    'inside a building AND below ground → ground wins (first check)',
  );
}

console.log('contact normal + depth');
{
  const buildings = [{ min: v(-10, 0, -10), max: v(10, 50, 10) }];
  const sys = createCollisionSystem({ buildings });

  // Face contact: 1.5 m out from the +X wall → normal +X, depth = 2 - 1.5.
  assertHit(
    sys.check(v(11.5, 25, 0)),
    { kind: 'building', hit: 0, normal: v(1, 0, 0), depth: 0.5 },
    'face contact → axis normal + depth',
  );
  // Opposite face.
  assertHit(
    sys.check(v(-11.5, 25, 0)),
    { normal: v(-1, 0, 0), depth: 0.5 },
    'opposite face → flipped normal',
  );
  // Top face.
  assertHit(sys.check(v(0, 51.5, 0)), { normal: v(0, 1, 0), depth: 0.5 }, 'roof contact → +Y normal');

  // Edge contact: 1 m out on +X and +Z past the corner column (10, ·, 10).
  const invSqrt2 = 1 / Math.SQRT2;
  assertHit(
    sys.check(v(11, 25, 11)),
    { normal: v(invSqrt2, 0, invSqrt2), depth: 2 - Math.SQRT2 },
    'edge contact → diagonal normal + depth',
  );

  // Corner contact: 1 m out on all three axes past (10, 50, 10).
  const invSqrt3 = 1 / Math.sqrt(3);
  assertHit(
    sys.check(v(11, 51, 11)),
    { normal: v(invSqrt3, invSqrt3, invSqrt3), depth: 2 - Math.sqrt(3) },
    'corner contact → diagonal normal + depth',
  );

  // Center inside the box: pushed out through the nearest face (+X, 0.5 m in).
  assertHit(
    sys.check(v(9.5, 25, 0)),
    { normal: v(1, 0, 0), depth: 2.5 },
    'center inside box → nearest-face normal, depth = r + face distance',
  );

  // Scratch reuse: the result object is invalidated by the next call.
  const first = sys.check(v(11.5, 25, 0));
  sys.check(v(0, 51.5, 0));
  assert(first.normal.y === 1, 'result is a reused scratch object (documented invalidation)');
}

console.log('spatial grid — boundaries and multi-cell buildings');
{
  // Building sitting just past the x=80 cell boundary; sphere center in the
  // neighboring cell must still reach across the boundary.
  const buildings = [{ min: v(80.5, 0, -10), max: v(100, 50, 10) }];
  const sys = createCollisionSystem({ buildings });
  assertHit(
    sys.check(v(79, 25, 0)),
    { kind: 'building', hit: 0, normal: v(-1, 0, 0), depth: 0.5 },
    'sphere spanning a grid-cell boundary hits a building in the next cell',
  );
  assertEqual(sys.check(v(76, 25, 0)), null, 'same cell, out of reach → clear');

  // Building spanning the x=0 boundary (cells -1 and 0): hits from both sides.
  const spanning = [{ min: v(-30, 0, -10), max: v(30, 50, 10) }];
  const sys2 = createCollisionSystem({ buildings: spanning });
  assertHit(sys2.check(v(-31.5, 25, 0)), { kind: 'building', hit: 0 }, 'multi-cell building hit from the -X side');
  assertHit(sys2.check(v(31.5, 25, 0)), { kind: 'building', hit: 0 }, 'multi-cell building hit from the +X side');
  assertHit(sys2.check(v(0, 25, 0)), { kind: 'building', hit: 0 }, 'multi-cell building hit in the middle');

  // Far away in an empty cell.
  assertEqual(sys2.check(v(400, 25, 400)), null, 'empty cell → clear');
}

console.log('checkSegment — buildings');
{
  const buildings = [
    { min: v(-10, 0, -10), max: v(10, 50, 10) },
    { min: v(40, 0, -10), max: v(60, 50, 10) },
  ];
  const sys = createCollisionSystem({ buildings });

  // Head-on into the -X face of building 0: from x=-20 to x=0 at mid height.
  assertHit(
    sys.checkSegment(v(-20, 25, 0), v(0, 25, 0)),
    { kind: 'building', hit: 0, t: 0.5, point: v(-10, 25, 0), normal: v(-1, 0, 0) },
    'segment into a building face → hit at the wall with face normal',
  );

  // Same line but stopping short of the wall.
  assertEqual(sys.checkSegment(v(-20, 25, 0), v(-12, 25, 0)), null, 'segment stopping short → clear');

  // Down the gap between the two buildings (x = 25 is clear of both).
  assertEqual(
    sys.checkSegment(v(25, 25, -100), v(25, 25, 100)),
    null,
    'segment clearing between buildings → null',
  );

  // Over the roof.
  assertEqual(sys.checkSegment(v(-20, 60, 0), v(20, 60, 0)), null, 'segment above the roofline → clear');

  // Nearest hit wins: a long segment through both buildings reports building 0.
  assertHit(
    sys.checkSegment(v(-30, 25, 0), v(70, 25, 0)),
    { kind: 'building', hit: 0, t: 0.2, point: v(-10, 25, 0) },
    'segment through two buildings → nearest hit',
  );

  // Diagonal into the roof: entry through the +Y face.
  assertHit(
    sys.checkSegment(v(0, 70, -30), v(0, 30, 10)),
    { kind: 'building', hit: 0, normal: v(0, 1, 0) },
    'descending segment entering through the roof → +Y normal',
  );
}

console.log('checkSegment — ground');
{
  const buildings = [{ min: v(-10, 0, -10), max: v(10, 50, 10) }];
  const sys = createCollisionSystem({ buildings });

  // Straight down into open ground, no sphere padding for segments.
  assertHit(
    sys.checkSegment(v(100, 10, 0), v(100, -10, 0)),
    { kind: 'ground', hit: null, t: 0.5, point: v(100, 0, 0), normal: v(0, 1, 0) },
    'segment crossing y=0 → ground hit at the plane',
  );
  assertEqual(sys.checkSegment(v(100, 10, 0), v(100, 1, 0)), null, 'segment above ground → clear');

  // Building shields the ground: shallow dive into the wall hits the building first.
  assertHit(
    sys.checkSegment(v(-30, 25, 0), v(30, -5, 0)),
    { kind: 'building', hit: 0 },
    'segment that would reach ground hits the building first',
  );
}

console.log('perf sanity — grid vs linear scan, allocation-free hot path');
{
  // City-scale synthetic box set: mirrors generateCity's layout — an 80 m
  // period grid over 2 km, two lots per block → ~1150 AABBs.
  const rand = mulberry32(0xc0ffee);
  const buildings = [];
  const PERIOD = 80;
  const HALF = 1000;
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 24; col++) {
      for (let lot = 0; lot < 2; lot++) {
        const bx = -HALF + col * PERIOD + 5 + rand() * 10;
        const bz = -HALF + row * PERIOD + 5 + lot * 32 + rand() * 5;
        const w = 15 + rand() * 35;
        const d = 12 + rand() * 12;
        const h = 30 + rand() * 150;
        buildings.push({ min: v(bx, 0, bz), max: v(bx + w, h, bz + d) });
      }
    }
  }

  const sys = createCollisionSystem({ buildings });

  // Reference linear scan — the pre-grid implementation.
  const planeRadius = 2;
  const r2 = planeRadius * planeRadius;
  function linearCheck(px, py, pz) {
    if (py <= planeRadius) return 'ground';
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const cx = px < b.min.x ? b.min.x : px > b.max.x ? b.max.x : px;
      const cy = py < b.min.y ? b.min.y : py > b.max.y ? b.max.y : py;
      const cz = pz < b.min.z ? b.min.z : pz > b.max.z ? b.max.z : pz;
      const dx = px - cx;
      const dy = py - cy;
      const dz = pz - cz;
      if (dx * dx + dy * dy + dz * dz <= r2) return 'building';
    }
    return null;
  }

  const N = 100000;
  const samples = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    samples[i * 3] = (rand() * 2 - 1) * HALF;
    samples[i * 3 + 1] = rand() * 250;
    samples[i * 3 + 2] = (rand() * 2 - 1) * HALF;
  }

  // Correctness: grid agrees with the linear scan on every sample.
  const probe = v(0, 0, 0);
  let disagreements = 0;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    probe.x = samples[i * 3];
    probe.y = samples[i * 3 + 1];
    probe.z = samples[i * 3 + 2];
    const g = sys.check(probe);
    const gKind = g ? g.kind : null;
    if (gKind !== null) hits++;
    if (gKind !== linearCheck(probe.x, probe.y, probe.z)) disagreements++;
  }
  assert(disagreements === 0, `grid agrees with linear scan on ${N} random checks (${hits} hits)`);
  assert(hits > 1000, 'sample set actually exercises hits');

  // Allocation: the hot path reuses scratch objects, so heap growth over 100k
  // checks stays near zero (run with --expose-gc for an exact measure).
  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  for (let i = 0; i < N; i++) {
    probe.x = samples[i * 3];
    probe.y = samples[i * 3 + 1];
    probe.z = samples[i * 3 + 2];
    sys.check(probe);
  }
  if (global.gc) global.gc();
  const heapGrowth = process.memoryUsage().heapUsed - heapBefore;
  const heapLimit = global.gc ? 1 << 20 : 8 << 20;
  console.log(`  heap growth over ${N} checks: ${(heapGrowth / 1024).toFixed(0)} KiB (gc ${global.gc ? 'forced' : 'not exposed'})`);
  assert(heapGrowth < heapLimit, `no allocation growth in the hot path (< ${heapLimit >> 20} MiB)`);

  // Timing: grid must beat the linear scan.
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    probe.x = samples[i * 3];
    probe.y = samples[i * 3 + 1];
    probe.z = samples[i * 3 + 2];
    sys.check(probe);
  }
  const gridMs = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < N; i++) {
    linearCheck(samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2]);
  }
  const linearMs = performance.now() - t1;

  console.log(`  grid: ${gridMs.toFixed(1)} ms, linear: ${linearMs.toFixed(1)} ms for ${N} checks over ${buildings.length} AABBs`);
  assert(gridMs < linearMs, 'grid check is measurably faster than the linear scan');
}

if (process.exitCode) {
  console.error('\ncollision tests: FAILED');
} else {
  console.log('\ncollision tests: PASSED');
}
