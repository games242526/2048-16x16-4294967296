(() => {
  "use strict";

  const SIZE = 16;
  const WIN_VALUE = 2 ** 32; // 4,294,967,296 — and you can keep going beyond it
  const TILE_ABBREVIATE_FROM = 100000;
  const SCORE_ABBREVIATE_FROM = 10000000;
  const MAX_BOARD_PX = 720;
  const BEST_KEY_BASE = "game2048_16x16_4294967296_best_score";
  const THEME_KEY = "game2048_16x16_4294967296_theme";
  const SWIPE_THRESHOLD = 24;
  const DIR_NAMES = ["up", "right", "down", "left"];

  const DIRECTIONS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
  };

  const boardEl = document.getElementById("board");
  const boardWrapEl = boardEl.parentElement;
  const gridBgEl = document.getElementById("grid-bg");
  const tileLayerEl = document.getElementById("tile-layer");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const timeBoxEl = document.getElementById("time-box");
  const timeEl = document.getElementById("time");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlayContinueBtn = document.getElementById("overlay-continue-btn");
  const overlayRetryBtn = document.getElementById("overlay-retry-btn");
  const newGameBtn = document.getElementById("new-game-btn");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const undoBtn = document.getElementById("undo-btn");
  const infoBtn = document.getElementById("info-btn");
  const infoModalEl = document.getElementById("info-modal");
  const infoCloseBtn = document.getElementById("info-close-btn");
  const autoPlaySelect = document.getElementById("auto-play-select");
  const autoSpeedSelect = document.getElementById("auto-speed-select");
  const rushSelect = document.getElementById("rush-select");
  const autoPlayBtn = document.getElementById("auto-play-btn");

  let cells = [];
  let tiles = new Map();
  const elMap = new Map();
  let nextTileId = 1;
  let score = 0;
  let best = 0;
  let hasWon = false;
  let keepPlayingAfterWin = false;
  let isBusy = false;
  let pendingMoveTimeout = null;
  let cellSize = 0;
  let gapSize = 0;
  let lastSnapshot = null;
  let layoutDirty = true;
  let instantVisual = false;

  // --- Number formatting ------------------------------------------------
  // Tiles reach 10+ digits in cells only 15-40px wide, so big values are
  // shortened (4294967296 -> 4.3B). Scores get the same treatment later.
  const SUFFIXES = [
    [1e15, "Q"],
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];

  function compact(value, threshold) {
    if (value < threshold) return String(value);
    let idx = SUFFIXES.findIndex(([divisor]) => value >= divisor);
    if (idx === -1) return String(value);
    const format = (i) => {
      const scaled = value / SUFFIXES[i][0];
      return scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    };
    let rounded = format(idx);
    if (rounded >= 1000 && idx > 0) {
      idx -= 1;
      rounded = format(idx);
    }
    return rounded + SUFFIXES[idx][1];
  }

  // --- Tile colors ------------------------------------------------------
  // One entry per doubling (index = log2 of the value): the classic 2048
  // gradient for 1..2048, then a teal-to-blue ring and a purple-to-red ring
  // so 33+ tiers stay distinguishable, with the 2^32 goal tile in gold and
  // everything beyond it in near-black.
  const PALETTE = [
    ["#f6f0e4", "#6b5f52"], // 1
    ["#eee4da", "#4a4238"], // 2
    ["#ede0c8", "#4a4238"], // 4
    ["#f2b179", "#fff8f0"], // 8
    ["#f59563", "#fff8f0"], // 16
    ["#f67c5f", "#fff8f0"], // 32
    ["#f65e3b", "#fff8f0"], // 64
    ["#edcf72", "#fff8f0"], // 128
    ["#edcc61", "#fff8f0"], // 256
    ["#edc850", "#fff8f0"], // 512
    ["#edc53f", "#fff8f0"], // 1024
    ["#edc22e", "#fff8f0"], // 2048
    ["#d3f0ea", "#214e48"], // 4096
    ["#b6e8de", "#214e48"],
    ["#86d7cf", "#ffffff"],
    ["#5cc4c8", "#ffffff"],
    ["#45aedb", "#ffffff"],
    ["#3a93d6", "#ffffff"],
    ["#3578cf", "#ffffff"],
    ["#3a5fc4", "#ffffff"],
    ["#4650b8", "#ffffff"],
    ["#3b3fa6", "#ffffff"],
    ["#2f3190", "#ffffff"], // 4194304 (2^22)
    ["#e6d5f5", "#4b2a6b"], // 2^23
    ["#d3b8ee", "#4b2a6b"],
    ["#bc94e6", "#ffffff"],
    ["#a672dd", "#ffffff"],
    ["#9254d3", "#ffffff"],
    ["#8040c4", "#ffffff"],
    ["#b43fb4", "#ffffff"],
    ["#cc3a98", "#ffffff"],
    ["#de3a7c", "#ffffff"],
    ["#f7c600", "#3b2c00"], // 2^32 = the goal
  ];
  const BEYOND = ["#2d2a26", "#f4d26b"];

  function paletteFor(tier) {
    return tier < PALETTE.length ? PALETTE[tier] : BEYOND;
  }

  function fontSizeForText(text) {
    const len = text.length;
    const ratio = len <= 2 ? 0.5 : len === 3 ? 0.42 : len === 4 ? 0.36 : len === 5 ? 0.28 : 0.22;
    return Math.max(6, cellSize * ratio);
  }

  // --- Best score (one per Time Rush length) ----------------------------
  let rushSeconds = 0;

  function bestKey() {
    return rushSeconds ? `${BEST_KEY_BASE}_t${rushSeconds}` : BEST_KEY_BASE;
  }

  function loadBest() {
    best = Number(localStorage.getItem(bestKey())) || 0;
    bestEl.textContent = compact(best, SCORE_ABBREVIATE_FROM);
  }

  // --- Board setup ------------------------------------------------------
  function buildGridBackground() {
    gridBgEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      frag.appendChild(cell);
    }
    gridBgEl.appendChild(frag);
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function createTile(row, col, value) {
    const tile = { id: nextTileId++, row, col, value, merged: false };
    tiles.set(tile.id, tile);
    cells[row][col] = tile.id;
    return tile;
  }

  function spawnRandomTile() {
    if (tiles.size >= SIZE * SIZE) return;
    let n = Math.floor(Math.random() * (SIZE * SIZE - tiles.size));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (cells[r][c]) continue;
        if (n-- === 0) {
          createTile(r, c, Math.random() < 0.9 ? 1 : 2);
          return;
        }
      }
    }
  }

  function startNewGame() {
    stopAutoPlay();
    inputQueue.length = 0;
    stopRush();
    clearTimeout(pendingMoveTimeout);
    cells = emptyGrid();
    tiles = new Map();
    elMap.clear();
    nextTileId = 1;
    score = 0;
    hasWon = false;
    keepPlayingAfterWin = false;
    isBusy = false;
    lastSnapshot = null;
    undoBtn.disabled = true;
    tileLayerEl.innerHTML = "";
    hideOverlay();
    resetRushClock();
    spawnRandomTile();
    spawnRandomTile();
    updateScoreDisplay();
    render();
  }

  function updateScoreDisplay() {
    if (score > best) {
      best = score;
      localStorage.setItem(bestKey(), String(best));
    }
    scoreEl.textContent = compact(score, SCORE_ABBREVIATE_FROM);
    bestEl.textContent = compact(best, SCORE_ABBREVIATE_FROM);
  }

  // --- Layout / rendering ----------------------------------------------
  function measureBoard() {
    // Never scrolling outranks keeping the board above some "readable" size,
    // so there's no minimum floor here beyond 0.
    const fitSize = Math.max(0, Math.min(boardWrapEl.clientWidth, boardWrapEl.clientHeight, MAX_BOARD_PX));
    boardEl.style.width = `${fitSize}px`;
    boardEl.style.height = `${fitSize}px`;

    // 15 gaps instead of 3, so they get a fixed share of the board.
    const gap = Math.max(0.5, (fitSize * 0.07) / (SIZE - 1));
    boardEl.style.setProperty("--gap", `${gap}px`);

    boardEl.style.setProperty("--overlay-title-size", `${Math.max(10, fitSize * 0.064)}px`);
    boardEl.style.setProperty("--overlay-title-gap", `${Math.max(2, fitSize * 0.032)}px`);
    boardEl.style.setProperty("--overlay-box-padding", `${Math.max(2, fitSize * 0.032)}px`);
    boardEl.style.setProperty("--overlay-btn-size", `${Math.max(8, fitSize * 0.03)}px`);
    boardEl.style.setProperty("--overlay-btn-padding", `${Math.max(1, fitSize * 0.02)}px ${Math.max(3, fitSize * 0.036)}px`);
    boardEl.style.setProperty("--overlay-actions-gap", `${Math.max(2, fitSize * 0.02)}px`);

    const cell0 = gridBgEl.children[0].getBoundingClientRect();
    const cell1 = gridBgEl.children[1].getBoundingClientRect();
    cellSize = cell0.width;
    gapSize = cell1.left - cell0.right;
    layoutDirty = false;
  }

  function setInstantVisual(on) {
    instantVisual = on;
    tileLayerEl.classList.toggle("no-transition", on);
  }

  function render(skipAnimation) {
    if (layoutDirty) measureBoard();
    if (skipAnimation) tileLayerEl.classList.add("no-transition");
    const animate = !skipAnimation && !instantVisual;

    tiles.forEach((tile) => {
      let el = elMap.get(tile.id);
      const isNewEl = !el;
      if (isNewEl) {
        el = document.createElement("div");
        el.className = "tile";
        el._tier = -1;
        el._text = "";
        el._pos = "";
        el._font = "";
        tileLayerEl.appendChild(el);
        elMap.set(tile.id, el);
      }

      const text = compact(tile.value, TILE_ABBREVIATE_FROM);
      if (el._text !== text) {
        el.textContent = text;
        el._text = text;
      }
      const tier = Math.round(Math.log2(tile.value));
      if (el._tier !== tier) {
        const [bg, fg] = paletteFor(tier);
        el.style.background = bg;
        el.style.color = fg;
        el._tier = tier;
      }
      const font = `${fontSizeForText(text)}px`;
      if (el._font !== font) {
        el.style.fontSize = font;
        el._font = font;
      }
      const pos = `${tile.col * (cellSize + gapSize)}|${tile.row * (cellSize + gapSize)}|${cellSize}`;
      if (el._pos !== pos) {
        el.style.left = `${tile.col * (cellSize + gapSize)}px`;
        el.style.top = `${tile.row * (cellSize + gapSize)}px`;
        el.style.width = `${cellSize}px`;
        el.style.height = `${cellSize}px`;
        el._pos = pos;
      }

      if (animate) {
        el.classList.remove("new", "merged");
        if (isNewEl) el.classList.add("new");
        if (tile.merged) el.classList.add("merged");
      }
      tile.merged = false;
    });

    if (elMap.size !== tiles.size) {
      for (const [id, el] of elMap) {
        if (!tiles.has(id)) {
          el.remove();
          elMap.delete(id);
        }
      }
    }

    if (skipAnimation && !instantVisual) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!instantVisual) tileLayerEl.classList.remove("no-transition");
      }));
    }
  }

  // --- Game logic -------------------------------------------------------
  function buildTraversalOrder(vector) {
    const rows = Array.from({ length: SIZE }, (_, i) => i);
    const cols = Array.from({ length: SIZE }, (_, i) => i);
    if (vector.dr === 1) rows.reverse();
    if (vector.dc === 1) cols.reverse();
    return { rows, cols };
  }

  const TRAVERSALS = {};
  for (const name of Object.keys(DIRECTIONS)) TRAVERSALS[name] = buildTraversalOrder(DIRECTIONS[name]);

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function captureSnapshot() {
    return {
      cells: cells.map((row) => row.slice()),
      tiles: new Map([...tiles].map(([id, tile]) => [id, { ...tile }])),
      nextTileId,
      score,
      hasWon,
      keepPlayingAfterWin,
    };
  }

  function undo() {
    if (!lastSnapshot) return;
    inputQueue.length = 0;
    stopAutoPlay();
    clearTimeout(pendingMoveTimeout);
    isBusy = false;
    cells = lastSnapshot.cells;
    tiles = lastSnapshot.tiles;
    nextTileId = lastSnapshot.nextTileId;
    score = lastSnapshot.score;
    hasWon = lastSnapshot.hasWon;
    keepPlayingAfterWin = lastSnapshot.keepPlayingAfterWin;
    lastSnapshot = null;
    undoBtn.disabled = true;
    hideOverlay();
    updateScoreDisplay();
    render(true);
  }

  // Slides and merges tiles; returns whether anything changed. Touches only
  // game state, never the DOM, so Auto Move can run it many times per frame.
  function applyMove(direction) {
    const vector = DIRECTIONS[direction];
    const { rows, cols } = TRAVERSALS[direction];
    const mergedThisMove = new Set();
    let moved = false;

    for (const r of rows) {
      for (const c of cols) {
        const tileId = cells[r][c];
        if (!tileId) continue;
        const tile = tiles.get(tileId);

        let curR = r;
        let curC = c;

        while (true) {
          const nr = curR + vector.dr;
          const nc = curC + vector.dc;
          if (!inBounds(nr, nc)) break;

          const targetId = cells[nr][nc];
          if (!targetId) {
            cells[curR][curC] = null;
            curR = nr;
            curC = nc;
            cells[curR][curC] = tileId;
            moved = true;
            continue;
          }

          const targetTile = tiles.get(targetId);
          if (targetTile.value === tile.value && !mergedThisMove.has(targetId) && !mergedThisMove.has(tileId)) {
            cells[curR][curC] = null;
            targetTile.value *= 2;
            targetTile.merged = true;
            mergedThisMove.add(targetId);
            tiles.delete(tileId);
            score += targetTile.value;
            moved = true;
            if (targetTile.value === WIN_VALUE && !hasWon) hasWon = true;
          }
          break;
        }

        if (tiles.has(tileId)) {
          tile.row = curR;
          tile.col = curC;
        }
      }
    }
    return moved;
  }

  function afterMove() {
    if (hasWon && !keepPlayingAfterWin) {
      showOverlay("win");
    } else if (!canMove()) {
      showOverlay("lose");
    }
  }

  // `instant` skips the animation and the 110ms lock, so the caller must
  // call render() itself once it is done batching moves.
  function move(direction, instant) {
    if (isBusy || !overlayEl.hidden || !infoModalEl.hidden) return false;
    const snapshotBeforeMove = captureSnapshot();
    if (!applyMove(direction)) return false;

    lastSnapshot = snapshotBeforeMove;
    if (undoBtn.disabled) undoBtn.disabled = false;
    startRushIfNeeded();

    if (instant) {
      spawnRandomTile();
      afterMove();
      return true;
    }

    updateScoreDisplay();
    render();
    isBusy = true;
    pendingMoveTimeout = setTimeout(() => {
      spawnRandomTile();
      render();
      isBusy = false;
      afterMove();
      drainInputQueue();
    }, 110);
    return true;
  }

  // Key presses and swipes that land while tiles are still sliding are
  // queued (a few deep) instead of dropped, so fast play never loses input.
  const inputQueue = [];
  const MAX_QUEUED_INPUTS = 3;

  function requestMove(direction) {
    if (isBusy) {
      if (inputQueue.length < MAX_QUEUED_INPUTS) inputQueue.push(direction);
      return;
    }
    move(direction, false);
  }

  function drainInputQueue() {
    while (inputQueue.length && !isBusy) {
      if (!overlayEl.hidden || !infoModalEl.hidden) {
        inputQueue.length = 0;
        return;
      }
      move(inputQueue.shift(), false);
    }
  }

  function canMove() {
    if (tiles.size < SIZE * SIZE) return true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const value = tiles.get(cells[r][c]).value;
        if (r + 1 < SIZE && tiles.get(cells[r + 1][c]).value === value) return true;
        if (c + 1 < SIZE && tiles.get(cells[r][c + 1]).value === value) return true;
      }
    }
    return false;
  }

  function showOverlay(kind) {
    stopAutoPlay();
    if (kind === "win") {
      overlayTitleEl.textContent = "You Win! 🎉";
      overlayContinueBtn.hidden = false;
    } else if (kind === "time") {
      overlayTitleEl.textContent = "Time's Up! ⏱";
      overlayContinueBtn.hidden = true;
    } else {
      overlayTitleEl.textContent = "Game Over!";
      overlayContinueBtn.hidden = true;
    }
    if (kind !== "win") stopRush();
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function openInfoModal() {
    infoModalEl.hidden = false;
  }

  function closeInfoModal() {
    infoModalEl.hidden = true;
  }

  // --- Time Rush ----------------------------------------------------------
  let rushRemaining = 0;
  let rushRunning = false;
  let rushTimer = null;
  let rushLast = 0;

  function formatClock(seconds) {
    const t = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }

  function resetRushClock() {
    rushRemaining = rushSeconds;
    timeBoxEl.hidden = !rushSeconds;
    timeEl.textContent = formatClock(rushRemaining);
  }

  function stopRush() {
    rushRunning = false;
    clearInterval(rushTimer);
    rushTimer = null;
  }

  // The clock starts on the first successful move, so reading the board
  // before you begin costs nothing.
  function startRushIfNeeded() {
    if (!rushSeconds || rushRunning || rushRemaining <= 0) return;
    rushRunning = true;
    rushLast = performance.now();
    rushTimer = setInterval(rushTick, 100);
  }

  function rushTick() {
    const now = performance.now();
    // Paused while a dialog is open, the page is hidden, or a win is showing.
    if (document.hidden || !infoModalEl.hidden || !overlayEl.hidden) {
      rushLast = now;
      return;
    }
    rushRemaining -= (now - rushLast) / 1000;
    rushLast = now;
    if (rushRemaining <= 0) {
      rushRemaining = 0;
      timeEl.textContent = formatClock(0);
      render();
      updateScoreDisplay();
      showOverlay("time");
      return;
    }
    timeEl.textContent = formatClock(rushRemaining);
  }

  rushSelect.addEventListener("change", () => {
    rushSeconds = Number(rushSelect.value) || 0;
    rushSelect.blur();
    loadBest();
    startNewGame();
  });

  // --- Auto Move ------------------------------------------------------------
  // Four simple scripted patterns (not a lookahead solver) driving the same
  // move() as keyboard and swipe, so every move they make is a normal move.
  let autoActive = false;
  let autoTimer = null;
  let autoRaf = 0;
  let autoSide = 0;
  let autoIndex = 0;
  let autoStuck = 0;
  let autoPattern = "corner";

  function nextAutoDirection() {
    switch (autoPattern) {
      case "corner":
        return autoIndex++ % 2 === 0 ? "up" : autoSide === 0 ? "left" : "right";
      case "swing": {
        const pair = autoSide === 0 ? ["up", "down"] : ["left", "right"];
        return pair[autoIndex++ % 2];
      }
      case "swirl":
        return DIR_NAMES[autoIndex++ % 4];
      default:
        return DIR_NAMES[Math.floor(Math.random() * 4)];
    }
  }

  function autoAttempt(instant) {
    if (isBusy) return;
    if (move(nextAutoDirection(), instant)) {
      autoStuck = 0;
      return;
    }
    autoStuck += 1;
    if (autoStuck >= 2 && (autoPattern === "corner" || autoPattern === "swing")) {
      autoSide = 1 - autoSide;
      autoIndex = 0;
    }
    // Safety net: if the pattern can't move at all, try every direction once
    // so a legal move the pattern doesn't favour never leaves it stalled.
    if (autoStuck >= 6) {
      for (const name of DIR_NAMES) {
        if (move(name, instant)) {
          autoStuck = 0;
          break;
        }
      }
    }
  }

  function autoCanRun() {
    return autoActive && overlayEl.hidden && infoModalEl.hidden;
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPattern = autoPlaySelect.value;
    autoSide = 0;
    autoIndex = 0;
    autoStuck = 0;
    autoActive = true;
    const speed = autoSpeedSelect.value;
    setInstantVisual(speed !== "normal");

    if (speed === "normal") {
      autoTimer = setInterval(() => autoAttempt(false), 125);
    } else if (speed === "fast") {
      autoTimer = setInterval(() => {
        for (let i = 0; i < 3 && autoCanRun(); i++) autoAttempt(true);
        updateScoreDisplay();
        render();
      }, 40);
    } else {
      const frame = () => {
        if (!autoActive) return;
        const start = performance.now();
        while (autoCanRun() && performance.now() - start < 8) autoAttempt(true);
        updateScoreDisplay();
        render();
        autoRaf = requestAnimationFrame(frame);
      };
      autoRaf = requestAnimationFrame(frame);
    }

    autoPlayBtn.textContent = "■ Stop";
    autoPlayBtn.classList.add("running");
    autoPlaySelect.disabled = true;
    autoSpeedSelect.disabled = true;
  }

  function stopAutoPlay() {
    autoActive = false;
    clearInterval(autoTimer);
    autoTimer = null;
    cancelAnimationFrame(autoRaf);
    autoRaf = 0;
    if (instantVisual) {
      setInstantVisual(false);
      // Settle the last batched frame so nothing is left half-drawn.
      updateScoreDisplay();
      render(true);
    }
    autoPlayBtn.textContent = "▶ Start";
    autoPlayBtn.classList.remove("running");
    autoPlaySelect.disabled = false;
    autoSpeedSelect.disabled = false;
  }

  autoPlayBtn.addEventListener("click", () => {
    if (autoActive) stopAutoPlay();
    else startAutoPlay();
    autoPlayBtn.blur();
  });

  [autoPlaySelect, autoSpeedSelect].forEach((select) => {
    select.addEventListener("change", () => select.blur());
  });

  // --- Theme toggle (defaults to light; never follows system preference) ---
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");

  themeToggleBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    themeToggleBtn.blur();
  });

  // --- Fullscreen -----------------------------------------------------------
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fullscreenSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  function toggleFullscreen() {
    if (!fullscreenSupported) return;
    try {
      if (fullscreenElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const root = document.documentElement;
        const result = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
        if (result && result.catch) result.catch(() => {});
      }
    } catch (err) {
      // Embedded without allowfullscreen, or blocked by the browser: stay windowed.
    }
  }

  function syncFullscreenState() {
    document.documentElement.setAttribute("data-fs", fullscreenElement() ? "true" : "false");
  }

  if (fullscreenSupported) {
    fullscreenBtn.addEventListener("click", () => {
      toggleFullscreen();
      fullscreenBtn.blur();
    });
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
  } else {
    fullscreenBtn.hidden = true;
  }

  // --- Keyboard input ---
  const KEY_MAP = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
    W: "up",
    S: "down",
    A: "left",
    D: "right",
  };

  window.addEventListener("keydown", (e) => {
    if (!infoModalEl.hidden) {
      if (e.key === "Escape") closeInfoModal();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Let the pickers keep their own arrow-key behavior.
    if (e.target && e.target.tagName === "SELECT") return;
    if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    const direction = KEY_MAP[e.key];
    if (!direction) return;
    e.preventDefault();
    requestMove(direction);
  });

  // --- Touch / swipe input ---
  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;

  document.addEventListener(
    "touchstart",
    (e) => {
      if (!infoModalEl.hidden) return;
      if (e.target.closest && e.target.closest("select, button, a")) return;
      if (e.touches.length !== 1) return;
      touchActive = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!touchActive) return;
      e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!touchActive) return;
      touchActive = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return;

      if (absDx > absDy) {
        requestMove(dx > 0 ? "right" : "left");
      } else {
        requestMove(dy > 0 ? "down" : "up");
      }
    },
    { passive: true }
  );

  document.addEventListener("touchcancel", () => {
    touchActive = false;
  });

  // --- Buttons ---
  newGameBtn.addEventListener("click", () => {
    startNewGame();
    newGameBtn.blur();
  });
  overlayRetryBtn.addEventListener("click", startNewGame);
  undoBtn.addEventListener("click", () => {
    undo();
    undoBtn.blur();
  });
  overlayContinueBtn.addEventListener("click", () => {
    keepPlayingAfterWin = true;
    hideOverlay();
  });
  infoBtn.addEventListener("click", openInfoModal);
  infoCloseBtn.addEventListener("click", closeInfoModal);
  infoModalEl.addEventListener("click", (e) => {
    if (e.target === infoModalEl) closeInfoModal();
  });

  // --- Resize handling ---
  let resizeRaf = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      layoutDirty = true;
      render(true);
    });
  });
  resizeObserver.observe(boardWrapEl);

  // --- Init ---
  buildGridBackground();
  syncFullscreenState();
  loadBest();
  startNewGame();
})();
