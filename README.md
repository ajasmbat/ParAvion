# ParAvion

Minimal Three.js flight-game prototype (Vite + vanilla JS).

```bash
npm install
npm run dev
```

Then open the printed URL. This ticket (PARA-Y6KLG7) ships only the scaffold:
an empty sky-blue scene with a ground plane, a seeded `mulberry32` PRNG, and
stub exports for `generateCity` / `createCameraController` so sibling tickets
can develop against a stable interface. City, camera controls, fixed-timestep
loop, and HUD arrive in later tickets.
