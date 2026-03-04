import { MACHINE_CONFIGS, getMachineConfig } from "./machines.js";
import { SlotsEngine } from "./slots-engine.js";

const MACHINE_ROUTE_ALIASES = {
  "velvet-classic": "machine-01",
  "midnight-gold": "machine-05",
  "neon-diamonds": "machine-07",
  "vault-heist": "machine-10"
};

const params = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const requestedRouteMachine = hashParams.get("machine") || params.get("machine") || params.get("m") || getLastMachine();
const requestedMachine = MACHINE_ROUTE_ALIASES[requestedRouteMachine] || requestedRouteMachine;
const machine = getMachineConfig(requestedMachine);
const engine = new SlotsEngine(machine);

if (
  requestedMachine !== machine.id ||
  (params.get("machine") ? false : params.get("m") !== machine.id) ||
  hashParams.get("machine") !== machine.id
) {
  if (!params.get("machine")) {
    params.set("m", machine.id);
  }
  hashParams.set("machine", machine.id);
  const next = `${window.location.pathname}?${params.toString()}#${hashParams.toString()}`;
  window.history.replaceState({}, "", next);
}
setLastMachine(machine.id);

function getLastMachine() {
  try {
    return localStorage.getItem("vv_last_machine");
  } catch (_) {
    return null;
  }
}

function setLastMachine(machineId) {
  try {
    localStorage.setItem("vv_last_machine", machineId);
  } catch (_) {
    // Ignore storage failures in private mode / restricted contexts.
  }
}

const machineThemeCss = document.getElementById("machineThemeCss");
if (machineThemeCss) {
  machineThemeCss.setAttribute("href", `css/slots/machines/${machine.id}.css`);
}

[...document.body.classList]
  .filter((cls) => /^machine-\d{2}$/.test(cls))
  .forEach((cls) => document.body.classList.remove(cls));
document.body.classList.add(machine.themeClass);
document.body.classList.toggle("vip", Boolean(machine.vip));

const machineNameEl = document.getElementById("machineName");
const machineDescEl = document.getElementById("machineDesc");
const machineIdLabelEl = document.getElementById("machineIdLabel");
const lineCountEl = document.getElementById("lineCount");
const lineBetEl = document.getElementById("lineBet");
const walletBalanceEl = document.getElementById("walletBalance");
const betValueEl = document.getElementById("betValue");
const resultTextEl = document.getElementById("resultText");
const bigWinBannerEl = document.getElementById("bigWinBanner");

const hitRateLabelEl = document.getElementById("hitRateLabel");
const nearMissLabelEl = document.getElementById("nearMissLabel");
const jackpotLabelEl = document.getElementById("jackpotLabel");
const volatilityRangeLabelEl = document.getElementById("volatilityRangeLabel");
const paytableListEl = document.getElementById("paytableList");

const reelsEl = document.getElementById("reels");
const paylineSvgEl = document.getElementById("paylineSvg");
const machineStageEl = document.getElementById("machineStage");
const machineCardsEl = document.getElementById("machineCards");

const betDownBtn = document.getElementById("betDown");
const betUpBtn = document.getElementById("betUp");
const spinBtn = document.getElementById("spinBtn");
const turboBtn = document.getElementById("turboBtn");
const autoBtn = document.getElementById("autoBtn");
const stopAutoBtn = document.getElementById("stopAutoBtn");
const autoCountEl = document.getElementById("autoCount");

const missingSymbolAssets = new Set();

function symbolAssetPath(symbolId) {
  if (!machine.assetDir) return null;
  const fileKey = machine.symbolImageMap?.[symbolId];
  if (!fileKey) return null;

  const path = `${machine.assetDir}/${fileKey}.webp`;
  if (missingSymbolAssets.has(path)) return null;
  return path;
}

function renderSymbolCell(cell, symbolId) {
  const fallbackText = symbolId || "?";
  const path = symbolAssetPath(symbolId);

  cell.innerHTML = "";

  if (!path) {
    const span = document.createElement("span");
    span.className = "symTxt";
    span.textContent = fallbackText;
    cell.appendChild(span);
    return;
  }

  const img = document.createElement("img");
  img.className = "symImg";
  img.src = path;
  img.alt = fallbackText;
  img.loading = "lazy";
  img.decoding = "async";
  img.onerror = () => {
    missingSymbolAssets.add(path);
    const span = document.createElement("span");
    span.className = "symTxt";
    span.textContent = fallbackText;
    cell.replaceChildren(span);
  };
  cell.appendChild(img);
}

machineNameEl.textContent = machine.name;
machineDescEl.textContent = machine.description;
machineIdLabelEl.textContent = machine.id;
lineCountEl.textContent = String(machine.paylines.length);
document.title = `Velvet Vault — ${machine.name}`;

hitRateLabelEl.textContent = `${Math.round(machine.volatility.hitRate * 100)}%`;
nearMissLabelEl.textContent = `${Math.round(machine.volatility.nearMissChance * 100)}%`;
jackpotLabelEl.textContent = `${(machine.volatility.jackpotChance * 100).toFixed(2)}%`;
volatilityRangeLabelEl.textContent = `${machine.volatility.payoutMultMin}x – ${machine.volatility.payoutMultMax}x`;

function renderPaytable() {
  paytableListEl.innerHTML = "";
  machine.symbols.forEach((symbol) => {
    const table = machine.paytable[symbol];
    if (!table) return;
    const row = document.createElement("div");
    row.className = "paytable-row";
    row.innerHTML = `<span>${symbol}</span><b>3:${table[3]} 4:${table[4]} 5:${table[5]}</b>`;
    paytableListEl.appendChild(row);
  });
}

function renderMachineCards() {
  machineCardsEl.innerHTML = "";
  MACHINE_CONFIGS.forEach((m) => {
    const card = document.createElement("a");
    card.className = `machine-card ${m.id === machine.id ? "active" : ""}`.trim();
    card.href = `slots.html?m=${encodeURIComponent(m.id)}#machine=${encodeURIComponent(m.id)}`;
    card.dataset.machine = m.id;
    card.addEventListener("click", () => setLastMachine(m.id));

    const tokens = m.symbols.slice(0, 4).map((sym) => `<span class="token">${sym}</span>`).join("");
    card.innerHTML = `
      <strong>${m.name}</strong>
      <small>Hit ${Math.round(m.volatility.hitRate * 100)}% • Jackpot ${(m.volatility.jackpotChance * 100).toFixed(2)}%</small>
      <div class="tokens">${tokens}</div>
    `;

    machineCardsEl.appendChild(card);
  });
}

let AC = null;
const pendingTimeouts = new Set();
const pendingIntervals = new Set();
const pendingRafs = new Set();
let pageClosed = false;

function trackedTimeout(fn, ms) {
  const id = setTimeout(() => {
    pendingTimeouts.delete(id);
    fn();
  }, ms);
  pendingTimeouts.add(id);
  return id;
}

function trackedInterval(fn, ms) {
  const id = setInterval(fn, ms);
  pendingIntervals.add(id);
  return id;
}

function trackedRaf(fn) {
  const id = requestAnimationFrame((ts) => {
    pendingRafs.delete(id);
    fn(ts);
  });
  pendingRafs.add(id);
  return id;
}

function clearTrackedWork() {
  pendingTimeouts.forEach((id) => clearTimeout(id));
  pendingIntervals.forEach((id) => clearInterval(id));
  pendingRafs.forEach((id) => cancelAnimationFrame(id));
  pendingTimeouts.clear();
  pendingIntervals.clear();
  pendingRafs.clear();
}

function shutdownPageWork() {
  if (pageClosed) return;
  pageClosed = true;
  autoRunning = false;
  autoRemaining = 0;
  clearTrackedWork();
}

function audioOn() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === "suspended") AC.resume();
}

function beep(freq = 520, ms = 45, type = "sine", gain = 0.03) {
  if (!AC) return;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(AC.destination);
  o.start();
  trackedTimeout(() => o.stop(), ms);
}

function spinTone() {
  const hz = machine.soundPreset?.spinHz || 440;
  beep(hz, 30, "square", 0.018);
}

function winTone() {
  const hz = machine.soundPreset?.winHz || 760;
  beep(hz, 80, "sine", 0.035);
  trackedTimeout(() => beep(hz * 1.25, 90, "sine", 0.03), 70);
}

function bigWinTone() {
  const hz = machine.soundPreset?.bigWinHz || 980;
  beep(hz * 0.8, 110, "triangle", 0.04);
  trackedTimeout(() => beep(hz, 120, "sawtooth", 0.04), 90);
}

const REELS = 5;
const ROWS = 3;

const reelCells = [];
const reelCols = [];

function randomSymbol() {
  return machine.symbols[Math.floor(Math.random() * machine.symbols.length)];
}

function ensureReelDOM() {
  if (!reelsEl) return;

  // Hard rebuild to normalize into a strict 5x3 cabinet grid.
  reelsEl.innerHTML = "";
  reelCols.length = 0;
  reelCells.length = 0;

  for (let reel = 0; reel < REELS; reel += 1) {
    const col = document.createElement("div");
    col.className = "reel-col reelCol";
    col.dataset.reel = String(reel);

    const colCells = [];
    for (let row = 0; row < ROWS; row += 1) {
      const cell = document.createElement("div");
      cell.className = "reel-cell cell";
      cell.dataset.row = String(row);
      renderSymbolCell(cell, randomSymbol());
      col.appendChild(cell);
      colCells.push(cell);
    }

    reelsEl.appendChild(col);
    reelCols.push(col);
    reelCells.push(colCells);
  }
}

function buildReels() {
  ensureReelDOM();
}

function renderGrid(grid) {
  for (let reel = 0; reel < REELS; reel += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const value = grid[row][reel];
      const cell = reelCells[reel]?.[row];
      if (!cell) continue;
      renderSymbolCell(cell, value);
    }
  }
}

const paylineEls = [];

function buildPaylineOverlay() {
  paylineSvgEl.innerHTML = "";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  gradient.setAttribute("id", "paylineGlow");
  gradient.setAttribute("x1", "0%");
  gradient.setAttribute("x2", "100%");
  gradient.setAttribute("y1", "0%");
  gradient.setAttribute("y2", "0%");

  const stopA = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stopA.setAttribute("offset", "0%");
  stopA.setAttribute("stop-color", "#ff233d");
  const stopB = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stopB.setAttribute("offset", "50%");
  stopB.setAttribute("stop-color", "#00ff9a");
  const stopC = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stopC.setAttribute("offset", "100%");
  stopC.setAttribute("stop-color", "#ff233d");

  gradient.appendChild(stopA);
  gradient.appendChild(stopB);
  gradient.appendChild(stopC);
  defs.appendChild(gradient);
  paylineSvgEl.appendChild(defs);

  const xPoints = Array.from({ length: REELS }, (_, reel) => 10 + (reel * (80 / (REELS - 1))));
  const rowY = [16, 50, 84];

  machine.paylines.forEach((line, idx) => {
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute(
      "points",
      line.map((row, reel) => `${xPoints[reel]},${rowY[row]}`).join(" ")
    );
    poly.setAttribute("class", "payline");
    poly.dataset.line = String(idx);
    paylineSvgEl.appendChild(poly);
    paylineEls.push(poly);
  });
}

function showWinningPaylines(activeLineIndexes) {
  const active = new Set(activeLineIndexes);
  paylineEls.forEach((lineEl, idx) => {
    lineEl.classList.toggle("active", active.has(idx));
  });
}

let currentBet = machine.bet.default;
let turboMode = false;
let uiSpinning = false;
let autoRunning = false;
let autoRemaining = 0;

function slotsRoundKey() {
  return `slots-${machine.id}`;
}

function ensureSlotsRound() {
  return window.RoundEngine?.begin(slotsRoundKey()) || "";
}

function clearSlotsRound() {
  window.RoundEngine?.clear(slotsRoundKey());
}

function clampBet(value) {
  const min = machine.bet.min;
  const max = machine.bet.max;
  const step = machine.bet.step;
  let next = Math.max(min, Math.min(max, value));

  const delta = next - min;
  next = min + (Math.round(delta / step) * step);
  next = Math.max(min, Math.min(max, next));
  return next;
}

function lineBetValue() {
  return Math.max(1, Math.floor(currentBet / machine.paylines.length));
}

function renderBet() {
  betValueEl.textContent = `${currentBet} GOLD`;
  lineBetEl.textContent = `${lineBetValue()} GOLD`;
}

function renderWallet() {
  if (!window.VaultEngine?.user) return;
  walletBalanceEl.textContent = window.VaultEngine.formatGold(window.VaultEngine.getBalance());
}

function flashBigWin(multiplierText) {
  bigWinBannerEl.textContent = `BIG WIN ${multiplierText}`;
  bigWinBannerEl.classList.remove("show");
  void bigWinBannerEl.offsetWidth;
  bigWinBannerEl.classList.add("show");
  trackedTimeout(() => bigWinBannerEl.classList.remove("show"), 1100);
}

function setControlState() {
  const lock = uiSpinning || autoRunning;
  betDownBtn.disabled = lock;
  betUpBtn.disabled = lock;
  spinBtn.disabled = uiSpinning || autoRunning;
  turboBtn.disabled = uiSpinning || autoRunning;
  autoBtn.disabled = uiSpinning || autoRunning;
  autoCountEl.disabled = uiSpinning || autoRunning;
  stopAutoBtn.disabled = !autoRunning;

  turboBtn.classList.toggle("active", turboMode);
  turboBtn.textContent = `Turbo: ${turboMode ? "On" : "Off"}`;
}

function wait(ms) {
  return new Promise((resolve) => trackedTimeout(resolve, ms));
}

async function animateSpin(finalGrid) {
  const speed = turboMode ? 45 : 78;
  const base = turboMode ? 260 : 760;
  const stagger = turboMode ? 90 : 170;

  machineStageEl.classList.add("spinning");

  const tasks = reelCols.map((col, reel) => new Promise((resolve) => {
    col.classList.add("spinning");
    let tickCounter = 0;

    const spinTimer = trackedInterval(() => {
      for (let row = 0; row < ROWS; row += 1) {
        renderSymbolCell(reelCells[reel][row], randomSymbol());
      }
      tickCounter += 1;
      if (tickCounter % 3 === 0) spinTone();
    }, speed);

    const stopAfter = base + (reel * stagger);
    trackedTimeout(() => {
      clearInterval(spinTimer);
      pendingIntervals.delete(spinTimer);
      for (let row = 0; row < ROWS; row += 1) {
        renderSymbolCell(reelCells[reel][row], finalGrid[row][reel]);
      }
      col.classList.remove("spinning");
      col.classList.add("settle");
      spinTone();
      trackedTimeout(() => {
        col.classList.remove("settle");
        resolve();
      }, turboMode ? 220 : 360);
    }, stopAfter);
  }));

  await Promise.all(tasks);
  machineStageEl.classList.remove("spinning");
}

function spinSummary(result) {
  if (!result.isWin) {
    if (result.nearMiss) return "Near miss. The machine is teasing a line.";
    return "No hit. Reels cool down with no payout.";
  }

  const lines = result.wins
    .map((line) => `L${line.index + 1} ${line.symbol}x${line.count}`)
    .join(" • ");

  return `Win ${result.totalWin} GOLD (${lines})`;
}

async function doSpin() {
  if (uiSpinning || pageClosed) return false;
  if (!window.VaultEngine?.user) {
    resultTextEl.textContent = "Connecting to the vault...";
    return false;
  }

  const balance = window.VaultEngine.getBalance();
  if (balance < currentBet) {
    resultTextEl.innerHTML = `Insufficient funds. Wallet: <b>${window.VaultEngine.formatGold(balance)}</b>`;
    return false;
  }

  const roundId = ensureSlotsRound();
  if (!roundId) {
    resultTextEl.textContent = "Round engine unavailable.";
    return false;
  }

  const debitOk = window.VaultEngine.debit(
    currentBet,
    window.RoundEngine.note(`${machine.id}-bet`, roundId)
  );
  if (!debitOk) {
    resultTextEl.textContent = "Bet debit failed.";
    clearSlotsRound();
    return false;
  }

  audioOn();
  uiSpinning = true;
  setControlState();
  showWinningPaylines([]);
  resultTextEl.textContent = "Spinning...";

  const result = engine.spin({ bet: currentBet });
  await animateSpin(result.grid);
  if (pageClosed) {
    clearSlotsRound();
    return false;
  }

  showWinningPaylines(result.wins.map((line) => line.index));

  if (result.totalWin > 0) {
    window.VaultEngine.credit(
      result.totalWin,
      window.RoundEngine.note(`${machine.id}-win`, roundId)
    );
    if (result.isBigWin || result.jackpotHit) {
      flashBigWin(`${Math.max(1, Math.floor(result.totalWin / currentBet))}x`);
      bigWinTone();
    } else {
      winTone();
    }
  }

  resultTextEl.innerHTML = spinSummary(result);
  renderWallet();

  uiSpinning = false;
  setControlState();
  clearSlotsRound();
  return true;
}

async function autoLoop() {
  while (autoRunning && autoRemaining > 0) {
    const success = await doSpin();
    if (!success) break;
    autoRemaining -= 1;

    if (!autoRunning || autoRemaining <= 0) break;
    resultTextEl.textContent = `Auto running... ${autoRemaining} left`;
    await wait(turboMode ? 110 : 280);
  }

  autoRunning = false;
  autoRemaining = 0;
  setControlState();
}

function startAuto() {
  if (autoRunning || uiSpinning) return;
  autoRemaining = Number(autoCountEl.value || 25);
  if (!Number.isFinite(autoRemaining) || autoRemaining <= 0) autoRemaining = 25;
  autoRunning = true;
  setControlState();
  autoLoop();
}

function stopAuto() {
  autoRunning = false;
  autoRemaining = 0;
  setControlState();
}

betDownBtn.addEventListener("click", () => {
  currentBet = clampBet(currentBet - machine.bet.step);
  renderBet();
});

betUpBtn.addEventListener("click", () => {
  currentBet = clampBet(currentBet + machine.bet.step);
  renderBet();
});

spinBtn.addEventListener("click", () => {
  doSpin();
});

turboBtn.addEventListener("click", () => {
  if (uiSpinning || autoRunning) return;
  turboMode = !turboMode;
  setControlState();
});

autoBtn.addEventListener("click", () => {
  startAuto();
});

stopAutoBtn.addEventListener("click", () => {
  stopAuto();
});

window.addEventListener("pagehide", shutdownPageWork, { once: true });
window.addEventListener("beforeunload", shutdownPageWork, { once: true });
trackedRaf(() => {});

buildReels();
buildPaylineOverlay();
renderPaytable();
renderMachineCards();
currentBet = clampBet(currentBet);
renderBet();
setControlState();

const walletWait = trackedInterval(() => {
  if (window.VaultEngine) {
    clearInterval(walletWait);
    pendingIntervals.delete(walletWait);
    window.VaultEngine.subscribe(renderWallet);
    renderWallet();
  }
}, 100);
if (machineStageEl) {
  machineStageEl.classList.toggle("vip", Boolean(machine.vip));
}
