// Sphere-vs-world collision. Pure, allocation-free.
//
// `buildings` is `city.buildings` from `generateCity`: an array of
// `{ min, max }` where each is a Vector3-shaped `{x, y, z}` — we only read
// those three fields, so no THREE import is needed here.
//
// `check(position)` returns `null` on a clear position, or
// `{ kind: 'building' | 'ground', hit: <index|null> }` on contact.
// Ground fires when the sphere center's y drops to `groundY + planeRadius`.

export function createCollisionSystem({ buildings, groundY = 0, planeRadius = 2 }) {
  const r2 = planeRadius * planeRadius;

  return {
    check(position) {
      const px = position.x;
      const py = position.y;
      const pz = position.z;

      if (py <= groundY + planeRadius) {
        return { kind: 'ground', hit: null };
      }

      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const cx = px < b.min.x ? b.min.x : px > b.max.x ? b.max.x : px;
        const cy = py < b.min.y ? b.min.y : py > b.max.y ? b.max.y : py;
        const cz = pz < b.min.z ? b.min.z : pz > b.max.z ? b.max.z : pz;
        const dx = px - cx;
        const dy = py - cy;
        const dz = pz - cz;
        if (dx * dx + dy * dy + dz * dz <= r2) {
          return { kind: 'building', hit: i };
        }
      }

      return null;
    },
  };
}
