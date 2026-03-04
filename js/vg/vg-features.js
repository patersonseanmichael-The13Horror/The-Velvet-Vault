/**
 * vg-features.js — Shared VG Feature Frame + Win Tier Overlay Renderer
 * Provides theme-token-driven text and styling for all VG machines.
 * Hooks into existing feature state (same as VG-01..VG-04).
 * No RNG changes. No wallet/atomic math changes.
 *
 * Usage:
 *   import { getFeatureText, getWinTierStyle } from './vg-features.js';
 */

import { provideThemeTokens } from "./vg-theme.js";

/**
 * Feature frame text definitions per machine.
 * Keys: machineId → { holdWin, holdWinDetail, freeSpins, freeSpinsDetail, complete, completeDetail, jackpot }
 */
const FEATURE_TEXT = {
  "VG-01": {
    holdWin:        "HOLD & WIN",
    holdWinDetail:  "Private vault coins lock in under the noir lights.",
    freeSpins:      (n) => `FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "VIP noir floods the cabinet and the floor opens wider.",
    complete:       "FREE SPINS COMPLETE",
    completeDetail: (amt) => `House lights settle at ${amt}.`,
    jackpot:        "VAULT JACKPOT",
  },
  "VG-02": {
    holdWin:        "SYNDICATE LOCK",
    holdWinDetail:  "Neon coins lock into the syndicate grid.",
    freeSpins:      (n) => `SYNDICATE FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The neon grid expands — syndicate reels ignite.",
    complete:       "SYNDICATE SPINS COMPLETE",
    completeDetail: (amt) => `Neon settles at ${amt}.`,
    jackpot:        "NEON JACKPOT",
  },
  "VG-03": {
    holdWin:        "LOTUS LOCK",
    holdWinDetail:  "6 DROPS \u2014 jade coins lock into the dynasty grid.",
    freeSpins:      (n) => `DYNASTY FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The aurora opens the dynasty grid \u2014 the dragon awakens.",
    complete:       "DYNASTY SPINS COMPLETE",
    completeDetail: (amt) => `Aurora settles at ${amt}.`,
    jackpot:        "DYNASTY JACKPOT",
  },
  "VG-04": {
    holdWin:        "LOCKED IN \u2022 6 DROPS",
    holdWinDetail:  "Security engaged \u2014 hold your positions.",
    freeSpins:      (n) => `HEIST FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The vault is open \u2014 take what you can.",
    complete:       "HEIST COMPLETE",
    completeDetail: (amt) => `Vault cleared \u2014 ${amt} secured.`,
    jackpot:        "VAULT BREACH JACKPOT",
  },
  "VG-05": {
    holdWin:        "GRID LOCK \u2022 6 DROPS",
    holdWinDetail:  "Protocol engaged \u2014 diamond grid locks in.",
    freeSpins:      (n) => `PROTOCOL FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The diamond protocol activates \u2014 chrome reels ignite.",
    complete:       "PROTOCOL COMPLETE",
    completeDetail: (amt) => `Diamond grid cleared \u2014 ${amt} crystallised.`,
    jackpot:        "DIAMOND JACKPOT",
  },
  "VG-06": {
    holdWin:        "ROYAL LOCK \u2022 6 DROPS",
    holdWinDetail:  "The Council seals the grid \u2014 crimson coins lock.",
    freeSpins:      (n) => `COUNCIL FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The Crimson Council convenes \u2014 velvet reels ignite.",
    complete:       "COUNCIL COMPLETE",
    completeDetail: (amt) => `The Council awards ${amt}.`,
    jackpot:        "CRIMSON JACKPOT",
  },
  "VG-07": {
    holdWin:        "SAPPHIRE LOCK \u2022 6 DROPS",
    holdWinDetail:  "Ocean depths lock in \u2014 sapphire coins hold.",
    freeSpins:      (n) => `FORTUNE FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The sapphire aura rises \u2014 fortune reels expand.",
    complete:       "FORTUNE COMPLETE",
    completeDetail: (amt) => `Sapphire fortune settles at ${amt}.`,
    jackpot:        "BLUE JACKPOT",
  },
  "VG-08": {
    holdWin:        "GILDED LOCK \u2022 6 DROPS",
    holdWinDetail:  "The Cartel seals the vault \u2014 gold coins lock.",
    freeSpins:      (n) => `CARTEL FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The Golden Cartel opens the grid \u2014 gilded reels shimmer.",
    complete:       "CARTEL COMPLETE",
    completeDetail: (amt) => `Cartel gold secured \u2014 ${amt} claimed.`,
    jackpot:        "GOLD JACKPOT",
  },
  "VG-09": {
    holdWin:        "SHADOW LOCK \u2022 6 DROPS",
    holdWinDetail:  "The phantom seals the grid \u2014 obsidian coins hold.",
    freeSpins:      (n) => `PHANTOM FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The phantom haze descends \u2014 shadow reels ignite.",
    complete:       "PHANTOM COMPLETE",
    completeDetail: (amt) => `Shadow reserve settled at ${amt}.`,
    jackpot:        "OBSIDIAN JACKPOT",
  },
  "VG-10": {
    holdWin:        "NODE LOCK \u2022 6 DROPS",
    holdWinDetail:  "Circuit nodes lock in \u2014 royal chips hold.",
    freeSpins:      (n) => `CIRCUIT FREE SPINS \u2022 x${n}`,
    freeSpinsDetail: "The Royal Circuit fires \u2014 neon reels expand.",
    complete:       "CIRCUIT COMPLETE",
    completeDetail: (amt) => `Royal circuit payout: ${amt}.`,
    jackpot:        "ROYAL JACKPOT",
  },
};

/** Fallback text for unknown machines */
const FALLBACK_TEXT = {
  holdWin:        "HOLD & WIN",
  holdWinDetail:  "Coins lock in.",
  freeSpins:      (n) => `FREE SPINS \u2022 x${n}`,
  freeSpinsDetail: "Reels expand.",
  complete:       "FREE SPINS COMPLETE",
  completeDetail: (amt) => `Total: ${amt}.`,
  jackpot:        "JACKPOT",
};

/**
 * Get feature frame text for a given machine and frame kind.
 * @param {string} machineId — e.g. "VG-05"
 * @param {"hold-win"|"free-spins"|"free-spins-summary"|"jackpot"} kind
 * @param {object} detail — { count, totalWin (formatted string) }
 * @returns {{ title: string, detail: string }}
 */
export function getFeatureText(machineId, kind, detail = {}) {
  const t = FEATURE_TEXT[machineId] || FALLBACK_TEXT;
  const count = detail.count || 8;
  const amt   = detail.totalWin || "$0.00";

  switch (kind) {
    case "hold-win":
      return { title: t.holdWin, detail: t.holdWinDetail };
    case "free-spins-summary":
      return { title: t.complete, detail: typeof t.completeDetail === "function" ? t.completeDetail(amt) : t.completeDetail };
    case "jackpot":
      return { title: t.jackpot, detail: `Maximum payout achieved.` };
    default: // free-spins
      return {
        title:  typeof t.freeSpins === "function" ? t.freeSpins(count) : t.freeSpins,
        detail: t.freeSpinsDetail,
      };
  }
}

/**
 * Get win tier overlay style tokens for a given machine.
 * Returns CSS variable overrides to apply to the overlay element.
 * @param {object} config — VG machine entry from index.json
 * @returns {object} style token map
 */
export function getWinTierStyle(config = {}) {
  const tokens = provideThemeTokens(config);
  return {
    "--vg-win-accent":    tokens.accent,
    "--vg-win-secondary": tokens.secondary,
    "--vg-win-glow":      tokens.glow,
    "--vg-win-overlay":   tokens.overlay,
  };
}

/**
 * Initialise feature frame text overrides for a VG machine.
 * Call this after VV_VG is resolved. Stores the machineId on the
 * feature frame element as a data attribute so showFeatureFrame()
 * can read it without knowing the machine.
 * @param {object} config — VG machine entry from index.json
 */
export function initFeatureFrames(config = {}) {
  if (!config || !config.id) return;
  const featureFrameEl = document.getElementById("vvFeatureFrame");
  if (featureFrameEl) {
    featureFrameEl.dataset.vgMachineId = config.id;
  }
  const winFrameEl = document.getElementById("vvWinFrame");
  if (winFrameEl) {
    winFrameEl.dataset.vgMachineId = config.id;
    // Apply win tier style tokens
    const styles = getWinTierStyle(config);
    Object.entries(styles).forEach(([k, v]) => winFrameEl.style.setProperty(k, v));
  }
}

/**
 * Initialise win tier overlay styling for a VG machine.
 * Applies theme tokens to the win frame element.
 * @param {object} config — VG machine entry from index.json
 */
export function initWinTierOverlay(config = {}) {
  initFeatureFrames(config); // shared implementation
}
