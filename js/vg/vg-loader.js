import { getMachineById, loadVGRegistry } from "./vg-registry.js";

const SESSION_KEY = "vv_vg_selected";
let selectedMachinePromise = null;

function readStoredSelection() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function storeSelection(machine) {
  if (!machine) return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(machine));
  } catch (_) {
    // Ignore storage failures.
  }
}

export function clearSelectedVGMachine() {
  selectedMachinePromise = null;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch (_) {
    // Ignore storage failures.
  }
}

function readQuerySelection() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get("vg") || "",
    slug: params.get("vgSlug") || ""
  };
}

/**
 * Resolve the effective machineId for a VG config entry.
 *
 * If machineIdAlias === "TODO_MAP_UNIQUE" the unique mapping has not been
 * assigned yet. In that case we fall back to machineId (the cycling
 * placeholder) so play is never blocked. No error is thrown.
 *
 * @param {object} config  A VG machine config entry from the registry.
 * @returns {string}       The machineId string slots.js should use.
 */
export function resolveEffectiveMachineId(config) {
  if (!config) return "";
  if (config.machineIdAlias && config.machineIdAlias !== "TODO_MAP_UNIQUE") {
    // A real unique mapping has been provided — use it.
    return config.machineIdAlias;
  }
  // Either no alias or alias is the placeholder — fall back to machineId.
  return config.machineId || "";
}

export async function getSelectedVGMachine(options = {}) {
  if (!selectedMachinePromise || options.force === true) {
    selectedMachinePromise = (async () => {
      const machines = await loadVGRegistry(options);
      const query    = readQuerySelection();
      const stored   = readStoredSelection();

      const direct = await getMachineById(query.id || query.slug, machines);
      if (direct) {
        storeSelection(direct);
        // Expose on window so other scripts can inspect the active VG config.
        window.VV_VG = direct;
        return direct;
      }

      const fallback = await getMachineById(
        stored?.id || stored?.slug || "",
        machines
      );
      if (fallback) {
        storeSelection(fallback);
        window.VV_VG = fallback;
        return fallback;
      }

      window.VV_VG = null;
      return null;
    })();
  }
  return selectedMachinePromise;
}

export { SESSION_KEY as VG_SESSION_KEY };
