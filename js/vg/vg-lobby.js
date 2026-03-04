/**
 * js/vg/vg-lobby.js
 * Velvet Vault — Slots Lobby controller
 * Handles: search, filter, sort, flagship badges, image preload, reduced motion
 */
import { loadVGRegistry } from "./vg-registry.js";
import { getSelectedVGMachine, VG_SESSION_KEY } from "./vg-loader.js";

/* ── Constants ─────────────────────────────────────────────── */
const FLAGSHIP_IDS = new Set(["VG-01", "VG-02", "VG-03", "VG-04"]);
const LS_SEARCH    = "vv_lobby_search";
const LS_THEME     = "vv_lobby_theme";
const LS_LAYOUT    = "vv_lobby_layout";
const LS_FLAGSHIP  = "vv_lobby_flagship";
const LS_SORT      = "vv_lobby_sort";
const LS_REDUCED   = "vv_reduced_motion";

/* ── Preload helpers ───────────────────────────────────────── */
const _preloadCache = new Set();
let _preloadQueue   = [];
let _preloadActive  = 0;
const PRELOAD_CONCURRENCY = 4;

function _preloadOne(url) {
  if (_preloadCache.has(url)) return;
  _preloadCache.add(url);
  _preloadActive++;
  const img = new Image();
  img.onload = img.onerror = () => {
    _preloadActive--;
    _drainPreloadQueue();
  };
  img.src = url;
}

function _drainPreloadQueue() {
  while (_preloadActive < PRELOAD_CONCURRENCY && _preloadQueue.length > 0) {
    _preloadOne(_preloadQueue.shift());
  }
}

function preloadUrls(urls) {
  for (const url of urls) {
    if (!_preloadCache.has(url)) _preloadQueue.push(url);
  }
  _drainPreloadQueue();
}

/* ── Routing ───────────────────────────────────────────────── */
const grid = document.getElementById("vgGrid");

function routeToMachine(machine) {
  try {
    window.sessionStorage.setItem(VG_SESSION_KEY, JSON.stringify(machine));
  } catch (_) { /* ignore */ }
  window.location.href = `slots.html?vg=${encodeURIComponent(machine.id)}`;
}

/* ── Layout badge label ────────────────────────────────────── */
function layoutBadgeLabel(machine) {
  const b = machine.layout?.base    || {};
  const f = machine.layout?.feature || {};
  const bKey = `${b.reels}x${b.rows}`;
  const fKey = `${f.reels}x${f.rows}`;
  if (bKey === "5x3" && fKey === "6x4") return "5\xD73 \u2192 Feature Expand";
  if (bKey === "6x4" && fKey === "5x3") return "6\xD74 \u2192 Feature Contract";
  if (bKey === "5x3" && fKey === "5x3") return "5\xD73 Classic";
  return `${b.reels || "?"}\xD7${b.rows || "?"}`;
}

/* ── Card renderer ─────────────────────────────────────────── */
function renderCard(machine) {
  const isFlagship  = FLAGSHIP_IDS.has(machine.id);
  const layoutLabel = layoutBadgeLabel(machine);
  const themeLabel  = (machine.theme?.vfxTheme || "").toLowerCase();

  const card = document.createElement("article");
  card.className = "vv-slot-card";
  card.dataset.vg     = machine.id;
  card.dataset.slug   = machine.slug;
  card.dataset.theme  = themeLabel;
  card.dataset.title  = (machine.title || "").toLowerCase();
  if (isFlagship) card.dataset.flagship = "1";

  card.innerHTML = `
    <img
      src="${machine.assets.cardImage}"
      alt="${machine.title} card art"
      loading="lazy"
      width="400"
      height="260"
    >
    <div class="vv-slot-card-badges">
      <span class="vv-badge vv-badge--layout">${layoutLabel}</span>
      ${themeLabel ? `<span class="vv-badge vv-badge--theme">${themeLabel}</span>` : ""}
      ${isFlagship ? `<span class="vv-badge vv-badge--flagship">Flagship</span>` : ""}
    </div>
    <div class="vv-slot-card-copy">
      <div class="vv-slot-card-kicker">${machine.id}</div>
      <h3>${machine.title}</h3>
      <p>${machine.subtitle}</p>
      <button class="vv-play-slot" type="button">PLAY</button>
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.closest(".vv-play-slot")) return;
    routeToMachine(machine);
  });
  card.querySelector(".vv-play-slot")?.addEventListener("click", () => {
    routeToMachine(machine);
  });

  return card;
}

/* ── Filter + sort logic ───────────────────────────────────── */
function applyFilters(machines, { search, theme, layout, flagshipOnly, sort }) {
  let list = machines.slice();

  if (flagshipOnly) {
    list = list.filter((m) => FLAGSHIP_IDS.has(m.id));
  }

  if (theme) {
    list = list.filter((m) => (m.theme?.vfxTheme || "").toLowerCase() === theme);
  }

  if (layout === "classic") {
    list = list.filter((m) => {
      const b = m.layout?.base || {};
      const f = m.layout?.feature || {};
      return b.reels === 5 && b.rows === 3 && f.reels === 5 && f.rows === 3;
    });
  } else if (layout === "feature") {
    list = list.filter((m) => {
      const b = m.layout?.base || {};
      const f = m.layout?.feature || {};
      return !(b.reels === 5 && b.rows === 3 && f.reels === 5 && f.rows === 3);
    });
  }

  if (search) {
    const q = search.toLowerCase().trim();
    list = list.filter((m) =>
      m.id.toLowerCase().includes(q) ||
      (m.title || "").toLowerCase().includes(q) ||
      (m.subtitle || "").toLowerCase().includes(q) ||
      (m.theme?.vfxTheme || "").toLowerCase().includes(q)
    );
  }

  switch (sort) {
    case "az":
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      break;
    case "newest":
      list.sort((a, b) => {
        const na = parseInt(a.id.replace("VG-", ""), 10);
        const nb = parseInt(b.id.replace("VG-", ""), 10);
        return nb - na;
      });
      break;
    case "theme":
      list.sort((a, b) => {
        const ta = (a.theme?.vfxTheme || "").toLowerCase();
        const tb = (b.theme?.vfxTheme || "").toLowerCase();
        return ta.localeCompare(tb) || (a.title || "").localeCompare(b.title || "");
      });
      break;
    default: // "featured" — flagship first, then natural order
      list.sort((a, b) => {
        const fa = FLAGSHIP_IDS.has(a.id) ? 0 : 1;
        const fb = FLAGSHIP_IDS.has(b.id) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const na = parseInt(a.id.replace("VG-", ""), 10);
        const nb = parseInt(b.id.replace("VG-", ""), 10);
        return na - nb;
      });
  }

  return list;
}

/* ── Reduced motion ────────────────────────────────────────── */
function applyReducedMotion(enabled) {
  document.body.classList.toggle("vv-reduced-motion", enabled);
  try { localStorage.setItem(LS_REDUCED, enabled ? "1" : "0"); } catch (_) {}
}

/* ── Persist / restore controls ───────────────────────────── */
function savePrefs(vals) {
  try {
    if (vals.search    !== undefined) localStorage.setItem(LS_SEARCH,   vals.search);
    if (vals.theme     !== undefined) localStorage.setItem(LS_THEME,    vals.theme);
    if (vals.layout    !== undefined) localStorage.setItem(LS_LAYOUT,   vals.layout);
    if (vals.flagship  !== undefined) localStorage.setItem(LS_FLAGSHIP, vals.flagship ? "1" : "0");
    if (vals.sort      !== undefined) localStorage.setItem(LS_SORT,     vals.sort);
  } catch (_) {}
}

function loadPrefs() {
  try {
    return {
      search:   localStorage.getItem(LS_SEARCH)   || "",
      theme:    localStorage.getItem(LS_THEME)    || "",
      layout:   localStorage.getItem(LS_LAYOUT)   || "",
      flagship: localStorage.getItem(LS_FLAGSHIP) === "1",
      sort:     localStorage.getItem(LS_SORT)     || "featured",
      reduced:  localStorage.getItem(LS_REDUCED)  === "1",
    };
  } catch (_) {
    return { search: "", theme: "", layout: "", flagship: false, sort: "featured", reduced: false };
  }
}

/* ── Main lobby init ───────────────────────────────────────── */
async function initLobby() {
  if (!grid) return;
  grid.innerHTML = `<article class="vv-slot-card vv-slot-card--loading"><h3>Loading Velvet Grade</h3><p>Building the machine wall\u2026</p></article>`;

  let allMachines = [];
  try {
    allMachines = await loadVGRegistry();
    await getSelectedVGMachine().catch(() => null);
  } catch (err) {
    console.error("[VG] Lobby registry load failed:", err);
    grid.innerHTML = `<article class="vv-slot-card"><h3>Registry unavailable</h3><p>${err?.message || "Unable to load VG registry."}</p></article>`;
    window.render_game_to_text = () => JSON.stringify({ screen: "slots-lobby", registryCount: 0, error: String(err?.message || err) });
    return;
  }

  /* ── Wire controls ──────────────────────────────────────── */
  const elSearch   = document.getElementById("vgSearch");
  const elTheme    = document.getElementById("vgFilterTheme");
  const elLayout   = document.getElementById("vgFilterLayout");
  const elSort     = document.getElementById("vgSort");
  const elFlagship = document.getElementById("vgFlagshipOnly");
  const elReduced  = document.getElementById("vgReducedMotion");
  const elCount    = document.getElementById("vgResultCount");

  const prefs = loadPrefs();

  if (elSearch)   elSearch.value     = prefs.search;
  if (elTheme)    elTheme.value      = prefs.theme;
  if (elLayout)   elLayout.value     = prefs.layout;
  if (elSort)     elSort.value       = prefs.sort;
  if (elFlagship) elFlagship.checked = prefs.flagship;
  if (elReduced)  elReduced.checked  = prefs.reduced;

  applyReducedMotion(prefs.reduced);

  /* ── Render function ──────────────────────────────────── */
  function render() {
    const search   = elSearch?.value   || "";
    const theme    = elTheme?.value    || "";
    const layout   = elLayout?.value   || "";
    const flagship = elFlagship?.checked || false;
    const sort     = elSort?.value     || "featured";

    savePrefs({ search, theme, layout, flagship, sort });

    const visible = applyFilters(allMachines, { search, theme, layout, flagshipOnly: flagship, sort });

    if (elCount) {
      elCount.textContent = visible.length === allMachines.length
        ? `Showing all ${allMachines.length} machines`
        : `${visible.length} of ${allMachines.length} machines`;
    }

    grid.innerHTML = "";
    if (visible.length === 0) {
      grid.innerHTML = `<article class="vv-slot-card"><h3>No machines found</h3><p>Try adjusting your filters.</p></article>`;
      return;
    }
    const frag = document.createDocumentFragment();
    visible.forEach((m) => frag.appendChild(renderCard(m)));
    grid.appendChild(frag);

    // Preload visible card images (fire-and-forget)
    preloadUrls(visible.map((m) => m.assets.cardImage));
  }

  /* ── Event listeners ──────────────────────────────────── */
  let searchDebounce = null;
  elSearch?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(render, 180);
  });
  elTheme?.addEventListener("change",    render);
  elLayout?.addEventListener("change",   render);
  elSort?.addEventListener("change",     render);
  elFlagship?.addEventListener("change", render);

  elReduced?.addEventListener("change", () => {
    applyReducedMotion(elReduced.checked);
  });

  /* ── Initial render ───────────────────────────────────── */
  render();

  window.render_game_to_text = () => JSON.stringify({
    screen: "slots-lobby",
    registryCount: allMachines.length,
    firstId: allMachines[0]?.id || null,
  });
}

window.advanceTime = async () => {};
void initLobby();
