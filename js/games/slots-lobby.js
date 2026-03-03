const MACHINES = [
  {
    id: "velvet_noir",
    name: "Velvet Noir",
    subtitle: "VIP Noir",
    tagline: "Dark luxury reels with hold-and-win pressure and rose-lit symbols.",
    logo: "images/slots/velvet_noir/logo.svg",
    pills: ["Hold & Win", "Free Spins", "High Drama"]
  },
  {
    id: "cyber_sakura",
    name: "Cyber Sakura",
    subtitle: "Neon Bloom",
    tagline: "Electric petals, quick spins, and sharp neon volatility.",
    logo: "images/slots/cyber_sakura/logo.svg",
    pills: ["Neon", "Wild Heavy", "Fast Tempo"]
  },
  {
    id: "neon_pharaoh",
    name: "Neon Pharaoh",
    subtitle: "Desert Pulse",
    tagline: "Ancient iconography with bright feature triggers and desert heat.",
    logo: "images/slots/neon_pharaoh/logo.svg",
    pills: ["Scatters", "Coins", "Feature Rich"]
  },
  {
    id: "emerald_heist",
    name: "Emerald Heist",
    subtitle: "Vault Break",
    tagline: "Heist-themed reels built for darker volatility and sharp accents.",
    logo: "images/slots/emerald_heist/logo.svg",
    pills: ["Heist", "VIP", "Swingy"]
  },
  {
    id: "crimson_crown",
    name: "Crimson Crown",
    subtitle: "Royal Risk",
    tagline: "Crown, flame, and seal symbols with heavier line-hit energy.",
    logo: "images/slots/crimson_crown/logo.svg",
    pills: ["Royal", "Multipliers", "Premium"]
  },
  {
    id: "abyssal_pearls",
    name: "Abyssal Pearls",
    subtitle: "Deep Luxe",
    tagline: "Ocean-blue shimmer with a smoother reel feel and glowing wilds.",
    logo: "images/slots/abyssal_pearls/logo.svg",
    pills: ["Ocean", "Smooth", "Biolume"]
  },
  {
    id: "clockwork_vault",
    name: "Clockwork Vault",
    subtitle: "Steel Velvet",
    tagline: "Precision-tuned noir mechanics with clockwork chrome and measured suspense.",
    logo: "images/slots/clockwork_vault/logo.svg",
    pills: ["Clockwork", "Measured", "Mechanical"]
  }
];

const gridEl = document.getElementById("vvLobbyGrid");
const modalEl = document.getElementById("vvLobbyModal");
const modalPreviewEl = document.getElementById("vvLobbyModalPreview");
const modalTitleEl = document.getElementById("vvLobbyModalTitle");
const modalSubtitleEl = document.getElementById("vvLobbyModalSubtitle");
const modalDescEl = document.getElementById("vvLobbyModalDesc");
const modalPillsEl = document.getElementById("vvLobbyModalPills");
const modalEnterEl = document.getElementById("vvLobbyEnter");
const modalCloseEls = document.querySelectorAll("[data-lobby-close]");

function machineHref(id) {
  return `slots.html?machine=${encodeURIComponent(id)}`;
}

function renderGrid() {
  if (!gridEl) return;
  gridEl.innerHTML = MACHINES.map((machine) => `
    <button class="vvLobbyTile" type="button" data-machine-id="${machine.id}">
      <span class="vvLobbyLogoFrame">
        <img src="${machine.logo}" alt="${machine.name} logo" loading="lazy" />
      </span>
      <span>
        <span class="vvLobbyTileTitle">${machine.name}</span>
        <span class="vvLobbyTileTag">${machine.subtitle}</span>
      </span>
    </button>
  `).join("");
}

function openModal(machine) {
  if (!modalEl || !modalPreviewEl || !modalTitleEl || !modalSubtitleEl || !modalDescEl || !modalPillsEl || !modalEnterEl) {
    return;
  }
  modalPreviewEl.innerHTML = `<img src="${machine.logo}" alt="${machine.name} logo" />`;
  modalTitleEl.textContent = machine.name;
  modalSubtitleEl.textContent = machine.subtitle;
  modalDescEl.textContent = machine.tagline;
  modalPillsEl.innerHTML = machine.pills.map((pill) => `<span class="vvLobbyPill">${pill}</span>`).join("");
  modalEnterEl.setAttribute("href", machineHref(machine.id));
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("vvLobbyModalOpen");
}

function closeModal() {
  if (!modalEl) return;
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("vvLobbyModalOpen");
}

renderGrid();

gridEl?.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-machine-id]");
  if (!trigger) return;
  const machine = MACHINES.find((entry) => entry.id === trigger.getAttribute("data-machine-id"));
  if (!machine) return;
  openModal(machine);
});

modalCloseEls.forEach((el) => {
  el.addEventListener("click", closeModal);
});

modalEl?.addEventListener("click", (event) => {
  if (event.target === modalEl) closeModal();
});
