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
  "VG-01": "packages/vg-machines/VG-01.symbols.json"
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
 * Apply the VG-01 symbol skin to the active machine's visual symbolMap.
 *
 * The function iterates over the engine's existing symbolMap keys and,
 * for each numeric-style key, looks up the corresponding VG skin entry.
 * It replaces only the `src` and `label` fields — tier is preserved or
 * upgraded from the skin manifest. Symbol IDs are never changed.
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

  const basePath = manifest.symbolBasePath || `images/slots/vg/${vgId}/symbols/`;
  const skinSymbols = manifest.symbols || {};
  const fallbackFile = manifest.fallback || "card-10.png";
  const symbolMap = machine.visual.symbolMap;

  // Build an ordered list of non-special engine symbol IDs so we can
  // map them positionally to the skin manifest's numeric keys (0..N-1).
  const specialIds = new Set(["SCAT", "COIN", "WILD"]);
  const regularEngineKeys = Object.keys(symbolMap).filter(k => !specialIds.has(k));

  regularEngineKeys.forEach((engineKey, index) => {
    const skinEntry = skinSymbols[String(index)] || null;
    const file = skinEntry?.file || fallbackFile;
    const src = `${basePath}${file}`;

    // Only override src and label — never touch tier logic used by engine
    symbolMap[engineKey] = {
      ...symbolMap[engineKey],
      src,
      label: skinEntry?.label || symbolMap[engineKey]?.label || engineKey,
      tier: skinEntry?.tier || symbolMap[engineKey]?.tier || "low",
      _vgSkin: vgId   // debug marker — not used by engine
    };
  });

  // Mark the machine visual as skinned for CSS targeting
  document.body.dataset.vgSkin = vgId;
  console.info(`[VG Skins] Applied skin "${vgId}" — ${regularEngineKeys.length} symbols patched`);
  return true;
}

/**
 * Remove any VG skin markers from the document body.
 * Called when switching away from a VG machine.
 */
export function removeVGSkin() {
  delete document.body.dataset.vgSkin;
}
