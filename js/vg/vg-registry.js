const REGISTRY_URL = new URL("../../packages/vg-machines/index.json", import.meta.url);
let registryPromise = null;
const VALID_SWITCH_ON = new Set(["freespins", "holdandwin", "jackpot"]);
const VALID_VFX_THEMES = new Set(["noir", "neon", "diamond", "crimson", "gold"]);

function readMachines(payload) {
  if (payload && Array.isArray(payload.machines)) {
    return payload.machines;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  throw new Error("VG registry payload is missing a machines array.");
}

function validateLayoutShape(shape, label) {
  if (!shape || typeof shape !== "object") {
    throw new Error(`${label} is missing.`);
  }
  if (![5, 6].includes(Number(shape.reels))) {
    throw new Error(`${label}.reels must be 5 or 6.`);
  }
  if (![3, 4].includes(Number(shape.rows))) {
    throw new Error(`${label}.rows must be 3 or 4.`);
  }
}

function requireNonEmptyString(value, label) {
  if (!String(value || "").trim()) {
    throw new Error(`${label} is missing.`);
  }
}

export function validateMinimalFields(machine, index = 0) {
  const label = `VG registry entry ${index + 1}`;
  if (!machine || typeof machine !== "object") {
    throw new Error(`${label} is not an object.`);
  }
  if (!/^VG-(0[1-9]|[12][0-9]|30)$/.test(String(machine.id || ""))) {
    throw new Error(`${label} is missing a valid id.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(machine.slug || ""))) {
    throw new Error(`${label} is missing a valid slug.`);
  }
  requireNonEmptyString(machine.title, `${label}.title`);
  requireNonEmptyString(machine.subtitle, `${label}.subtitle`);
  if (!String(machine.machineId || "").trim()) {
    throw new Error(`${label} is missing a machineId.`);
  }
  if (!machine.layout || typeof machine.layout !== "object") {
    throw new Error(`${label} is missing layout.`);
  }
  validateLayoutShape(machine.layout.base, `${label}.layout.base`);
  validateLayoutShape(machine.layout.feature, `${label}.layout.feature`);
  if (!Array.isArray(machine.layout.switchOn)) {
    throw new Error(`${label}.layout.switchOn must be an array.`);
  }
  machine.layout.switchOn.forEach((value) => {
    if (!VALID_SWITCH_ON.has(String(value || "").toLowerCase())) {
      throw new Error(`${label}.layout.switchOn contains an unsupported trigger.`);
    }
  });
  if (!machine.theme || typeof machine.theme !== "object") {
    throw new Error(`${label}.theme is missing.`);
  }
  if (!VALID_VFX_THEMES.has(String(machine.theme.vfxTheme || "").toLowerCase())) {
    throw new Error(`${label}.theme.vfxTheme is invalid.`);
  }
  requireNonEmptyString(machine.theme.frameTheme, `${label}.theme.frameTheme`);
  requireNonEmptyString(machine.theme.soundTheme, `${label}.theme.soundTheme`);
  if (!machine.assets || typeof machine.assets !== "object") {
    throw new Error(`${label}.assets is missing.`);
  }
  requireNonEmptyString(machine.assets.cardImage, `${label}.assets.cardImage`);
  requireNonEmptyString(machine.assets.logoImage, `${label}.assets.logoImage`);
  requireNonEmptyString(machine.assets.symbolPackPath, `${label}.assets.symbolPackPath`);
  if (!machine.tiersCents || typeof machine.tiersCents !== "object") {
    throw new Error(`${label}.tiersCents is missing.`);
  }
  ["bigMin", "superMin", "hugeMin", "extravagantMin"].forEach((key) => {
    const value = Number(machine.tiersCents[key]);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label}.tiersCents.${key} must be a non-negative integer.`);
    }
  });
  return machine;
}

function validateRegistryCatalog(machines) {
  if (machines.length !== 30) {
    throw new Error(`VG registry must contain exactly 30 machines; received ${machines.length}.`);
  }

  const seenIds = new Set();
  const seenSlugs = new Set();
  machines.forEach((machine, index) => {
    const id = String(machine.id || "").trim().toLowerCase();
    const slug = String(machine.slug || "").trim().toLowerCase();
    if (seenIds.has(id)) {
      throw new Error(`VG registry entry ${index + 1} duplicates id ${machine.id}.`);
    }
    if (seenSlugs.has(slug)) {
      throw new Error(`VG registry entry ${index + 1} duplicates slug ${machine.slug}.`);
    }
    seenIds.add(id);
    seenSlugs.add(slug);
  });
  return machines;
}

export async function loadVGRegistry(options = {}) {
  if (!registryPromise || options.force === true) {
    registryPromise = fetch(options.url || REGISTRY_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`VG registry request failed with ${response.status}.`);
        }
        return response.json();
      })
      .then((payload) => readMachines(payload).map(validateMinimalFields))
      .then((machines) => validateRegistryCatalog(machines));
  }
  return registryPromise;
}

export async function getMachineById(idOrSlug, machines = null) {
  const needle = String(idOrSlug || "").trim().toLowerCase();
  if (!needle) return null;
  const catalog = machines || await loadVGRegistry();
  return catalog.find((machine) => {
    return String(machine.id || "").trim().toLowerCase() === needle ||
      String(machine.slug || "").trim().toLowerCase() === needle;
  }) || null;
}

export { REGISTRY_URL };
