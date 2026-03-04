import { loadVGRegistry } from "./vg-registry.js";
import { getSelectedVGMachine, VG_SESSION_KEY } from "./vg-loader.js";

const grid = document.getElementById("vgGrid");

function routeToMachine(machine) {
  try {
    window.sessionStorage.setItem(VG_SESSION_KEY, JSON.stringify(machine));
  } catch (_) {
    // Ignore storage failures.
  }
  window.location.href = `slots.html?vg=${encodeURIComponent(machine.id)}`;
}

/**
 * Derive a human-readable layout badge label from a VG machine config.
 * 5x3 -> 6x4 expanding  : "5x3 + Feature Expand"
 * 6x4 -> 5x3 contracting: "6x4 + Feature Contract"
 * 5x3 -> 5x3 classic    : "5x3 Classic"
 * anything else         : "{r}x{c}" of base layout
 */
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

function renderCard(machine) {
  const card = document.createElement("article");
  card.className = "vv-slot-card";
  card.dataset.vg    = machine.id;
  card.dataset.slug  = machine.slug;
  card.dataset.theme = (machine.theme?.vfxTheme || "noir").toLowerCase();

  const layoutLabel = layoutBadgeLabel(machine);
  const themeLabel  = machine.theme?.frameTheme || "";

  card.innerHTML = `
    <img src="${machine.assets.cardImage}" alt="${machine.title} card art" loading="lazy">
    <div class="vv-slot-card-badges">
      <span class="vv-badge vv-badge--layout">${layoutLabel}</span>
      ${themeLabel ? `<span class="vv-badge vv-badge--theme">${themeLabel}</span>` : ""}
    </div>
    <div class="vv-slot-card-copy">
      <div class="vv-slot-card-kicker">${machine.id}</div>
      <h3>${machine.title}</h3>
      <p>${machine.subtitle}</p>
      <button class="vv-play-slot" type="button">PLAY</button>
    </div>
  `;
  card.addEventListener("click", (event) => {
    if (event.target.closest(".vv-play-slot")) return;
    routeToMachine(machine);
  });
  card.querySelector(".vv-play-slot")?.addEventListener("click", () => {
    routeToMachine(machine);
  });
  return card;
}

function renderError(message) {
  if (!grid) return;
  grid.innerHTML = `<article class="vv-slot-card"><h3>Registry unavailable</h3><p>${message}</p></article>`;
}

async function initLobby() {
  if (!grid) return;
  grid.innerHTML = `<article class="vv-slot-card"><h3>Loading Velvet Grade</h3><p>Building the machine wall...</p></article>`;
  try {
    const machines = await loadVGRegistry();
    await getSelectedVGMachine().catch(() => null);
    grid.innerHTML = "";
    machines.forEach((machine) => {
      grid.appendChild(renderCard(machine));
    });

    window.render_game_to_text = () => JSON.stringify({
      screen: "slots-lobby",
      registryCount: machines.length,
      firstId: machines[0]?.id || null
    });
  } catch (error) {
    console.error("[VG] Lobby render failed:", error);
    renderError(error?.message || "Unable to load VG registry.");
    window.render_game_to_text = () => JSON.stringify({
      screen: "slots-lobby",
      registryCount: 0,
      error: String(error?.message || error || "unknown")
    });
  }
}

window.advanceTime = async () => {};
void initLobby();
