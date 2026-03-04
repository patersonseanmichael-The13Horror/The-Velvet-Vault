/**
 * js/vg/vg-skins.js
 *
 * VG Symbol Skin System — UI-only renderer override.
 *
 * This module patches machine.visual.symbolMap ONLY when a VG machine
 * with a dedicated symbol skin is active. It does NOT alter:
 *   - symbol IDs, weights, or paylines
 *   - RNG or payout math
 *   - wallet / atomic / reserve / settle logic
 *   - render endpoints
 *
 * Usage (called from slots.js after machine is resolved):
 *   import { applyVGSkin } from "../vg/vg-skins.js";
 *   applyVGSkin(machine, activeVGMachine);
 */

/** Map of VG machine IDs to their symbol skin manifest paths */
const VG_SKIN_MANIFESTS = {
  "VG-01": "packages/vg-machines/VG-01.symbols.json",
  "VG-02": "packages/vg-machines/VG-02.symbols.json",
  "VG-03": "packages/vg-machines/VG-03.symbols.json",
  "VG-04": "packages/vg-machines/VG-04.symbols.json",
  "VG-05": "packages/vg-machines/VG-05.symbols.json",
  "VG-06": "packages/vg-machines/VG-06.symbols.json",
  "VG-07": "packages/vg-machines/VG-07.symbols.json",
  "VG-08": "packages/vg-machines/VG-08.symbols.json",
  "VG-09": "packages/vg-machines/VG-09.symbols.json",
  "VG-10": "packages/vg-machines/VG-10.symbols.json"
};

/** In-memory cache so we only fetch each manifest once per session */
const _skinCache = new Map();

/**
 * Fetch and cache a skin manifest JSON.
 * @param {string} vgId  e.g. "VG-01"
 * @returns {Promise<object|null>}
 */
async function loadSkinManifest(vgId) {
  if (_skinCache.has(vgId)) return _skinCache.get(vgId);
  const path = VG_SKIN_MANIFESTS[vgId];
  if (!path) return null;
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _skinCache.set(vgId, data);
    return data;
  } catch (err) {
    console.warn(`[VG Skins] Failed to load manifest for ${vgId}:`, err);
    return null;
  }
}

/**
 * Resolve a skin entry from a manifest's symbols field.
 * Supports both the legacy object format (VG-01: { "0": { file, label, tier } })
 * and the new array format (VG-02+: [{ key, label, tier, path, glowColor }]).
 *
 * @param {object|Array} symbols  manifest.symbols
 * @param {number}       index    positional index of the engine symbol
 * @returns {{ src: string, label: string, tier: string, glowColor?: string }|null}
 */
function resolveSkinEntry(symbols, index, vgId) {
  if (!symbols) return null;

  // New array format (VG-02+)
  if (Array.isArray(symbols)) {
    const entry = symbols[index];
    if (!entry) return null;
    return {
      src: entry.path || null,
      label: entry.label || null,
      tier: entry.tier || "low",
      glowColor: entry.glowColor || null
    };
  }

  // Legacy object format (VG-01)
  const entry = symbols[String(index)] || null;
  if (!entry) return null;
  const basePath = `images/slots/vg/${vgId}/symbols/`;
  return {
    src: entry.file ? `${basePath}${entry.file}` : null,
    label: entry.label || null,
    tier: entry.tier || "low",
    glowColor: null
  };
}

/**
 * Apply a VG symbol skin to the active machine's visual symbolMap.
 *
 * The function iterates over the engine's existing symbolMap keys and,
 * for each non-special key, looks up the corresponding VG skin entry.
 * It replaces only the `src`, `label`, and `tier` fields — symbol IDs
 * and engine logic are never changed.
 *
 * @param {object} machine        The active MACHINES entry (has .visual.symbolMap)
 * @param {object|null} vgMachine The resolved VG registry entry (has .id)
 * @returns {Promise<boolean>}    true if skin was applied, false otherwise
 */
export async function applyVGSkin(machine, vgMachine) {
  if (!vgMachine || !machine?.visual?.symbolMap) return false;
  const vgId = vgMachine.id;
  if (!VG_SKIN_MANIFESTS[vgId]) return false;

  const manifest = await loadSkinManifest(vgId);
  if (!manifest) return false;

  const skinSymbols = manifest.symbols;
  const symbolMap = machine.visual.symbolMap;

  // Build an ordered list of non-special engine symbol IDs
  const specialIds = new Set(["SCAT", "COIN", "WILD"]);
  const regularEngineKeys = Object.keys(symbolMap).filter(k => !specialIds.has(k));

  regularEngineKeys.forEach((engineKey, index) => {
    const skinEntry = resolveSkinEntry(skinSymbols, index, vgId);
    if (!skinEntry) return;

    symbolMap[engineKey] = {
      ...symbolMap[engineKey],
      ...(skinEntry.src   ? { src: skinEntry.src }     : {}),
      ...(skinEntry.label ? { label: skinEntry.label } : {}),
      tier: skinEntry.tier || symbolMap[engineKey]?.tier || "low",
      ...(skinEntry.glowColor ? { glowColor: skinEntry.glowColor } : {}),
      _vgSkin: vgId   // debug marker — not used by engine
    };
  });

  // Apply theme CSS variables from manifest
  if (manifest.accentColor) {
    document.documentElement.style.setProperty("--vg-accent", manifest.accentColor);
  }
  if (manifest.secondaryColor) {
    document.documentElement.style.setProperty("--vg-secondary", manifest.secondaryColor);
  }
  if (manifest.glowColor) {
    document.documentElement.style.setProperty("--vg-glow", manifest.glowColor);
  }

  // Mark the machine visual as skinned for CSS targeting
  document.body.dataset.vgSkin = vgId;
  if (manifest.skinClass) {
    document.body.classList.add(manifest.skinClass);
  }

  console.info(`[VG Skins] Applied skin "${vgId}" — ${regularEngineKeys.length} symbols patched`);
  return true;
}

/**
 * Remove any VG skin markers from the document body.
 * Called when switching away from a VG machine.
 */
export function removeVGSkin() {
  // Remove all known skin classes
  document.body.classList.remove(
    "vv-vfx-noir-vip", "vv-vfx-neon-syndicate",
    "vv-theme-vg-03", "vv-theme-vg-04",
    "vv-theme-vg-05", "vv-theme-vg-06", "vv-theme-vg-07",
    "vv-theme-vg-08", "vv-theme-vg-09", "vv-theme-vg-10"
  );
  delete document.body.dataset.vgSkin;
  // Reset CSS variables to defaults
  document.documentElement.style.removeProperty("--vg-accent");
  document.documentElement.style.removeProperty("--vg-secondary");
  document.documentElement.style.removeProperty("--vg-glow");
}
