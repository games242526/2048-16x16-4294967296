# 2048 16x16 — 4294967296

2048 on a giant 16×16 board that starts from **1** and aims for the **4,294,967,296** tile (2<sup>32</sup>), built from scratch with plain HTML/CSS/JavaScript (no framework, no build step). The board always fits the screen — no scrolling, at any size — and a fullscreen button lets it grow on big monitors.

Demo: `https://<username>.github.io/<repo>/` (replace with your GitHub Pages link after deploying).

## Features

- 256-cell board; new tiles are 1 (90%) or 2 (10%). Reach 4,294,967,296 to win, then keep going beyond it.
- Huge tiles are shortened so they stay readable in small cells (4294967296 → `4.3B`), and every doubling has its own color across 33+ tiers.
- **Auto Move**: Corner, Swing, Swirl, or Random patterns at Normal (animated), Fast, or Turbo speed (as many moves per frame as the device can handle).
- **Time Rush**: 60, 300, or 1500-second runs. The clock starts on your first move and pauses while the help window is open or the page is hidden. Each time limit has its own Best score.
- **Fullscreen** button (or the F key); the board grows up to 720px on large screens.
- Keyboard (arrow keys / WASD) and swipe anywhere on the page. Undo (single step) and New Game.
- Best score saved with `localStorage`; light/dark theme toggle.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server, e.g. `npx serve .`.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo (`main` branch).
2. **Settings → Pages**: source = that branch, folder `/ (root)`.

## Embedding via iframe

```html
<iframe
  src="https://<username>.github.io/<repo>/"
  style="width:100%; height:100%; border:0;"
  loading="lazy"
  allowfullscreen
></iframe>
```

`allowfullscreen` is needed for the fullscreen button to work inside an iframe; without it the button hides itself.

## Credit

Inspired by [2048 by Gabriele Cirulli](https://github.com/gabrielecirulli/2048). The 4294967296 goal, Auto Move, and Time Rush ideas are inspired by [4294967296 by TheReal4096](https://thereal4096.github.io/4294967296/) — this project reuses those ideas only; all code here is written from scratch.
