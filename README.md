# ParAvion

Minimal Three.js flight-game prototype (Vite + vanilla JS). Fly a free camera
through a deterministically-generated 2 km &times; 2 km city rendered as a
single `InstancedMesh`.

## Run

```bash
npm install
npm run dev
```

Open the printed URL in a browser, click the canvas to lock the pointer, and
fly.

## Controls

| Input          | Action                                    |
| -------------- | ----------------------------------------- |
| Click canvas   | Lock pointer (enter fly mode)             |
| Mouse          | Look around                               |
| `W` / `S`      | Move forward / backward                   |
| `A` / `D`      | Strafe left / right                       |
| `Space`        | Ascend                                    |
| `Ctrl`         | Descend                                   |
| `Shift` (hold) | Boost (~4&times; movement speed)          |
| `Esc`          | Release pointer lock                      |

The HUD in the top-left corner shows your world position, altitude, and a
smoothed FPS.

## Changing the city

The city layout is fully determined by a single seed exported from
`src/main.js`:

```js
export const SEED = 1337;
```

Edit that value and reload the page &mdash; the block layout, building sizes,
and colour jitter all change deterministically. Same seed always gives the same
city.

## Architecture

- `src/main.js` &mdash; bootstrap: scene, camera, renderer, lighting, fog, HUD,
  and a fixed-timestep 60 Hz update loop decoupled from the rAF render.
- `src/city.js` &mdash; `generateCity(seed)` returns `{ mesh, buildings, ground }`
  where `mesh` is one `InstancedMesh` covering every building.
- `src/camera.js` &mdash; `createCameraController(camera, domElement)` wires
  pointer-lock, WASD + mouse + Space/Ctrl + Shift, and exposes `update(dt)`.
- `src/rng.js` &mdash; seeded `mulberry32` PRNG so cities are reproducible.
