# How to run ParAvion

Every feature lives in its own Fredrin worktree until its PR merges. Once merged, the same code lands on `main` and you can run from the repo root. The commands are the same either way — only the directory changes.

## Quick start

```bash
cd ~/Desktop/ParAvion/ParAvion   # or any per-ticket worktree — see table below
npm install                       # only if node_modules is missing
npm run dev
```

Open **http://localhost:5173/** (Vite prints the actual port if 5173 is taken) and hard-refresh (`Cmd+Shift+R`). Stop the server with `Ctrl+C`.

Node `^20.19` or `>=22.12` is required by Vite 8. No env vars, database, or API keys — everything is generated in the browser.

## Controls

- **Click canvas** — lock pointer (also arms audio)
- **W / A / S / D** — move
- **Mouse** — look
- **Space / Ctrl** — up / down
- **Shift** — boost speed
- **M** — mute storm audio
- **Esc** — release pointer

## Worktrees per feature

All four feature tickets have merged into `main`, so the repo root now runs the full scene. The worktrees are still on disk if you want to see one feature in isolation.

| Ticket | Worktree | What it adds | Status |
|---|---|---|---|
| `PARA-ME3QRO` | `~/.fredrin/worktrees/ParAvion.PARA-ME3QRO` | Base city + camera + HUD | merged to `main` |
| `PARA-4E54FX` | `~/.fredrin/worktrees/ParAvion.PARA-4E54FX` | Emissive building windows | merged to `main` |
| `PARA-7LXZQY` | `~/.fredrin/worktrees/ParAvion.PARA-7LXZQY` | Storm ceiling + lightning + thunder above 200m | merged to `main` |
| `PARA-7789ZT` | `~/.fredrin/worktrees/ParAvion.PARA-7789ZT` | Cloud layer at ~250m | merged to `main` |

## Once everything is merged

Nothing extra — this directory has the full scene:

```bash
cd ~/Desktop/ParAvion/ParAvion
npm install
npm run dev
```

## What the seed controls

`export const SEED = 1337;` at the top of `src/main.js` — change it, reload, get a different city layout. Same seed always gives the same city.
