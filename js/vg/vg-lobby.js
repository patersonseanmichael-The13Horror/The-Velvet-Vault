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

function renderCard(machine) {
  const card = document.createElement("article");
  card.className = "vv-slot-card";
  card.dataset.vg = machine.id;
  card.dataset.slug = machine.slug;
  card.innerHTML = `
    <img src="${machine.assets.cardImage}" alt="${machine.title} card art" loading="lazy">
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
