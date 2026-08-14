# ParAvion

Minimal Three.js flight-game prototype (Vite + vanilla JS). Fly a free camera
through a deterministically-generated 2 km &times; 2 km city rendered as a
single `InstancedMesh`.

## Running locally

### Prerequisites

- **Node.js** `^20.19` or `>=22.12` (required by Vite 8) &mdash; check with `node -v`
- **npm** (ships with Node)

No environment variables, database, or API keys are needed &mdash; everything is
static and generated in the browser.

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

Vite serves the app at **http://localhost:5173** and prints the URL it picked
(if 5173 is already taken it falls back to the next free port, so trust the
printed line). Pass `--port` to pin it:

```bash
npm run dev -- --port 3000
```

To reach the server from another device on your network, add `--host`.

### 3. Open it

Open http://localhost:5173 in a browser, click the canvas to lock the pointer,
and fly. Edits to files under `src/` hot-reload; changing `SEED` (see below)
needs a page reload.

Stop the server with `Ctrl+C`.

### Production build

```bash
npm run build     # bundles to dist/
npm run preview   # serves dist/ at http://localhost:4173
```

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
