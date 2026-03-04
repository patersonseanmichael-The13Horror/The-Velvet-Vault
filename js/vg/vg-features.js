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
  "VG-11": {
    holdWin:        "BOULEVARD LOCK • 6 DROPS",
    holdWinDetail:  "Noir icons lock in under the gaslight.",
    freeSpins:      (n) => `SHADOW FREE SPINS • x${n}`,
    freeSpinsDetail: "The boulevard floods with shadow — velvet reels ignite.",
    complete:       "SHADOW SPINS COMPLETE",
    completeDetail: (amt) => `Noir boulevard settles at ${amt}.`,
    jackpot:        "NOIR JACKPOT",
  },
  "VG-12": {
    holdWin:        "MIRAGE LOCK • 6 DROPS",
    holdWinDetail:  "Golden icons lock in the labyrinth.",
    freeSpins:      (n) => `LUXE FREE SPINS • x${n}`,
    freeSpinsDetail: "The mirage shimmers — golden reels expand.",
    complete:       "LUXE SPINS COMPLETE",
    completeDetail: (amt) => `Mirage gold settles at ${amt}.`,
    jackpot:        "LUXE JACKPOT",
  },
  "VG-13": {
    holdWin:        "VOLTAGE LOCK • 6 DROPS",
    holdWinDetail:  "Neon circuits lock in — voltage holds.",
    freeSpins:      (n) => `ELECTRIC FREE SPINS • x${n}`,
    freeSpinsDetail: "Full voltage — neon reels overload.",
    complete:       "ELECTRIC SPINS COMPLETE",
    completeDetail: (amt) => `Voltage payout: ${amt}.`,
    jackpot:        "VOLTAGE JACKPOT",
  },
  "VG-14": {
    holdWin:        "UNDERGROUND LOCK • 6 DROPS",
    holdWinDetail:  "Opal icons lock in the underground.",
    freeSpins:      (n) => `OPAL FREE SPINS • x${n}`,
    freeSpinsDetail: "The oasis rises — opal reels shimmer.",
    complete:       "OPAL SPINS COMPLETE",
    completeDetail: (amt) => `Underground vault settles at ${amt}.`,
    jackpot:        "OPAL JACKPOT",
  },
  "VG-15": {
    holdWin:        "WHISPER LOCK • 6 DROPS",
    holdWinDetail:  "Gilded icons lock in silence.",
    freeSpins:      (n) => `GILDED FREE SPINS • x${n}`,
    freeSpinsDetail: "The throne room opens — gilded reels ignite.",
    complete:       "GILDED SPINS COMPLETE",
    completeDetail: (amt) => `Gilded whisper settles at ${amt}.`,
    jackpot:        "GILDED JACKPOT",
  },
  "VG-16": {
    holdWin:        "RELIC LOCK • 6 DROPS",
    holdWinDetail:  "Neon relics lock into the grid.",
    freeSpins:      (n) => `NEON FREE SPINS • x${n}`,
    freeSpinsDetail: "The relic ignites — neon reels pulse.",
    complete:       "NEON SPINS COMPLETE",
    completeDetail: (amt) => `Relic payout: ${amt}.`,
    jackpot:        "NEON RELIC JACKPOT",
  },
  "VG-17": {
    holdWin:        "CHROME LOCK • 6 DROPS",
    holdWinDetail:  "Chrome icons lock in the empire.",
    freeSpins:      (n) => `CROWN FREE SPINS • x${n}`,
    freeSpinsDetail: "The chrome crown descends — empire reels expand.",
    complete:       "CROWN SPINS COMPLETE",
    completeDetail: (amt) => `Chrome empire settles at ${amt}.`,
    jackpot:        "CHROME JACKPOT",
  },
  "VG-18": {
    holdWin:        "EXCHANGE LOCK • 6 DROPS",
    holdWinDetail:  "Violet icons lock in the exchange.",
    freeSpins:      (n) => `VIOLET FREE SPINS • x${n}`,
    freeSpinsDetail: "The violet dark descends — obsidian reels ignite.",
    complete:       "VIOLET SPINS COMPLETE",
    completeDetail: (amt) => `Violet exchange settles at ${amt}.`,
    jackpot:        "VIOLET JACKPOT",
  },
  "VG-19": {
    holdWin:        "HOUSE LOCK • 6 DROPS",
    holdWinDetail:  "The house locks its secrets in.",
    freeSpins:      (n) => `PHANTOM FREE SPINS • x${n}`,
    freeSpinsDetail: "The house is listening — phantom reels expand.",
    complete:       "PHANTOM SPINS COMPLETE",
    completeDetail: (amt) => `The house settles at ${amt}.`,
    jackpot:        "HOUSE JACKPOT",
  },
  "VG-20": {
    holdWin:        "PULSE LOCK • 6 DROPS",
    holdWinDetail:  "Platinum icons lock at frequency.",
    freeSpins:      (n) => `PLATINUM FREE SPINS • x${n}`,
    freeSpinsDetail: "Platinum pulse resonates — reels vibrate.",
    complete:       "PLATINUM SPINS COMPLETE",
    completeDetail: (amt) => `Platinum pulse settles at ${amt}.`,
    jackpot:        "PLATINUM JACKPOT",
  },
  "VG-21": {
    holdWin:        "HALO LOCK • 6 DROPS",
    holdWinDetail:  "High roller icons lock with halo glow.",
    freeSpins:      (n) => `GOLDEN FREE SPINS • x${n}`,
    freeSpinsDetail: "The halo descends — golden reels ignite.",
    complete:       "GOLDEN SPINS COMPLETE",
    completeDetail: (amt) => `Halo vault settles at ${amt}.`,
    jackpot:        "HALO JACKPOT",
  },
  "VG-22": {
    holdWin:        "OBSIDIAN LOCK • 6 DROPS",
    holdWinDetail:  "Dark icons lock in obsidian.",
    freeSpins:      (n) => `SHADOW FREE SPINS • x${n}`,
    freeSpinsDetail: "The obsidian dark descends — shadow reels ignite.",
    complete:       "SHADOW SPINS COMPLETE",
    completeDetail: (amt) => `Obsidian fortune settles at ${amt}.`,
    jackpot:        "OBSIDIAN JACKPOT",
  },
  "VG-23": {
    holdWin:        "METRO LOCK • 6 DROPS",
    holdWinDetail:  "Crimson icons lock at the station.",
    freeSpins:      (n) => `CRIMSON FREE SPINS • x${n}`,
    freeSpinsDetail: "The metro departs — crimson reels ignite.",
    complete:       "CRIMSON SPINS COMPLETE",
    completeDetail: (amt) => `Crimson metro settles at ${amt}.`,
    jackpot:        "CRIMSON JACKPOT",
  },
  "VG-24": {
    holdWin:        "NIGHTFALL LOCK • 6 DROPS",
    holdWinDetail:  "Sapphire icons lock at nightfall.",
    freeSpins:      (n) => `SAPPHIRE FREE SPINS • x${n}`,
    freeSpinsDetail: "The sapphire moon rises — midnight reels expand.",
    complete:       "SAPPHIRE SPINS COMPLETE",
    completeDetail: (amt) => `Sapphire nightfall settles at ${amt}.`,
    jackpot:        "SAPPHIRE JACKPOT",
  },
  "VG-25": {
    holdWin:        "SOCIETY LOCK • 6 DROPS",
    holdWinDetail:  "Secret icons locked by the society.",
    freeSpins:      (n) => `SECRET FREE SPINS • x${n}`,
    freeSpinsDetail: "The society convenes — velvet reels ignite.",
    complete:       "SECRET SPINS COMPLETE",
    completeDetail: (amt) => `Society vault settles at ${amt}.`,
    jackpot:        "SOCIETY JACKPOT",
  },
  "VG-26": {
    holdWin:        "VORTEX LOCK • 6 DROPS",
    holdWinDetail:  "Velvet icons lock in the vortex.",
    freeSpins:      (n) => `VORTEX FREE SPINS • x${n}`,
    freeSpinsDetail: "The vortex spirals — velvet reels ignite.",
    complete:       "VORTEX SPINS COMPLETE",
    completeDetail: (amt) => `Vortex vault settles at ${amt}.`,
    jackpot:        "VORTEX JACKPOT",
  },
  "VG-27": {
    holdWin:        "TRAIN LOCK • 6 DROPS",
    holdWinDetail:  "Money icons lock on the train.",
    freeSpins:      (n) => `MONEY FREE SPINS • x${n}`,
    freeSpinsDetail: "The money train departs — gold reels ignite.",
    complete:       "MONEY SPINS COMPLETE",
    completeDetail: (amt) => `Money train delivers ${amt}.`,
    jackpot:        "MONEY JACKPOT",
  },
  "VG-28": {
    holdWin:        "DISTRICT LOCK • 6 DROPS",
    holdWinDetail:  "Diamond icons lock in the district.",
    freeSpins:      (n) => `DIAMOND FREE SPINS • x${n}`,
    freeSpinsDetail: "The district opens — diamond reels ignite.",
    complete:       "DIAMOND SPINS COMPLETE",
    completeDetail: (amt) => `Diamond district settles at ${amt}.`,
    jackpot:        "DIAMOND JACKPOT",
  },
  "VG-29": {
    holdWin:        "HEIST LOCK • 6 DROPS",
    holdWinDetail:  "Royal icons lock in the heist.",
    freeSpins:      (n) => `ROYAL FREE SPINS • x${n}`,
    freeSpinsDetail: "The heist is in progress — royal reels ignite.",
    complete:       "ROYAL SPINS COMPLETE",
    completeDetail: (amt) => `Royal heist secures ${amt}.`,
    jackpot:        "ROYAL HEIST JACKPOT",
  },
  "VG-30": {
    holdWin:        "ASCENSION LOCK • 6 DROPS",
    holdWinDetail:  "Icons lock in the ascending vault.",
    freeSpins:      (n) => `AURORA FREE SPINS • x${n}`,
    freeSpinsDetail: "The aurora ascends — platinum reels ignite.",
    complete:       "AURORA SPINS COMPLETE",
    completeDetail: (amt) => `Velvet ascension settles at ${amt}.`,
    jackpot:        "ASCENSION JACKPOT",
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
