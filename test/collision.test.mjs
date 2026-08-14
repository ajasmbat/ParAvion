import { createCollisionSystem } from '../src/collision.js';

const v = (x, y, z) => ({ x, y, z });

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

console.log('createCollisionSystem — buildings');
{
  const buildings = [{ min: v(-10, 0, -10), max: v(10, 50, 10) }];
  const sys = createCollisionSystem({ buildings });

  assertEqual(sys.check(v(0, 100, 0)), null, 'open sky above the building clears');
  assertEqual(sys.check(v(0, 25, 0)), { kind: 'building', hit: 0 }, 'inside the AABB → building hit');
  assertEqual(sys.check(v(0, 25, 20)), null, 'well outside the AABB clears');

  // planeRadius=2, wall at x=10 → sphere center at x=11.5 is 1.5 from the wall → inside the sphere padding.
  assertEqual(
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
  assertEqual(sys.check(v(0, -0.1, 0)), { kind: 'ground', hit: null }, 'below ground → ground hit');
  assertEqual(sys.check(v(0, 1.9, 0)), { kind: 'ground', hit: null }, 'sphere touching ground → ground hit');
  assertEqual(sys.check(v(0, 2.1, 0)), null, 'sphere clear of ground → null');
}

console.log('createCollisionSystem — ground supersedes buildings');
{
  // Ground check runs first — cheap, and any position below ground level is a crash regardless.
  const buildings = [{ min: v(-10, 0, -10), max: v(10, 50, 10) }];
  const sys = createCollisionSystem({ buildings });
  assertEqual(
    sys.check(v(0, -1, 0)),
    { kind: 'ground', hit: null },
    'inside a building AND below ground → ground wins (first check)',
  );
}

if (process.exitCode) {
  console.error('\ncollision tests: FAILED');
} else {
  console.log('\ncollision tests: PASSED');
}
