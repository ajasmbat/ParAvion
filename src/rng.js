// Seeded PRNG. Same seed -> same sequence -> reproducible cities.
export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

{
  const a = mulberry32(1337);
  const b = mulberry32(1337);
  console.assert(a() === b() && a() === b() && a() === b(), 'mulberry32: same seed must produce the same sequence');
}
