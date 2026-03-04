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

export async function getSelectedVGMachine(options = {}) {
  if (!selectedMachinePromise || options.force === true) {
    selectedMachinePromise = (async () => {
      const machines = await loadVGRegistry(options);
      const query = readQuerySelection();
      const stored = readStoredSelection();
      const direct = await getMachineById(query.id || query.slug, machines);
      if (direct) {
        storeSelection(direct);
        return direct;
      }
      const fallback = await getMachineById(stored?.id || stored?.slug || "", machines);
      if (fallback) {
        storeSelection(fallback);
        return fallback;
      }
      return null;
    })();
  }
  return selectedMachinePromise;
}

export { SESSION_KEY as VG_SESSION_KEY };
