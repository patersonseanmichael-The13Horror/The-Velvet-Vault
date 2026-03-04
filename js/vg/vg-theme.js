/**
 * vg-theme.js — Shared VG Theme Template System
 * Applies body classes, CSS variables, and dynamically loads per-machine
 * theme CSS. Safe if CSS is missing (no crash). UI-only — zero game logic.
 *
 * Usage:
 *   import { applyTheme, removeTheme, provideThemeTokens } from './vg-theme.js';
 *   applyTheme(vgMachineConfig);
 */

/** All known VG theme class names — cleaned on every theme switch */
const ALL_THEME_CLASSES = [
  "vv-theme-vg-01",
  "vv-vfx-noir-vip",
  "vv-vfx-neon-syndicate",
  "vv-theme-vg-02",
  "vv-theme-vg-03",
  "vv-theme-vg-04",
  "vv-theme-vg-05",
  "vv-theme-vg-06",
  "vv-theme-vg-07",
  "vv-theme-vg-08",
  "vv-theme-vg-09",
  "vv-theme-vg-10",
];

/** Map machineId → CSS theme class */
const THEME_CLASS_MAP = {
  "VG-01": "vv-theme-vg-01",
  "VG-02": "vv-vfx-neon-syndicate",
  "VG-03": "vv-theme-vg-03",
  "VG-04": "vv-theme-vg-04",
  "VG-05": "vv-theme-vg-05",
  "VG-06": "vv-theme-vg-06",
  "VG-07": "vv-theme-vg-07",
  "VG-08": "vv-theme-vg-08",
  "VG-09": "vv-theme-vg-09",
  "VG-10": "vv-theme-vg-10",
};

/** Map machineId → CSS file path (relative to site root) */
const THEME_CSS_MAP = {
  "VG-01": "css/pages/slots-vip.css",
  "VG-02": "css/pages/slots-vg-02.css",
  "VG-03": "css/pages/slots-vg-03.css",
  "VG-04": "css/pages/slots-vg-04.css",
  "VG-05": "css/pages/slots-vg-05.css",
  "VG-06": "css/pages/slots-vg-06.css",
  "VG-07": "css/pages/slots-vg-07.css",
  "VG-08": "css/pages/slots-vg-08.css",
  "VG-09": "css/pages/slots-vg-09.css",
  "VG-10": "css/pages/slots-vg-10.css",
};

/** Default token fallbacks */
const DEFAULT_TOKENS = {
  accent:    "#c9a84c",
  secondary: "#ffffff",
  glow:      "rgba(201,168,76,0.45)",
  text:      "#f5e6c8",
  overlay:   "rgba(10,8,6,0.92)",
};

/**
 * Derive theme tokens from a VG machine config object.
 * @param {object} config — VG machine entry from index.json
 * @returns {object} token map
 */
export function provideThemeTokens(config = {}) {
  const theme = config.theme || {};
  return {
    accent:    theme.accentColor    || DEFAULT_TOKENS.accent,
    secondary: theme.secondaryColor || DEFAULT_TOKENS.secondary,
    glow:      theme.glowColor      || DEFAULT_TOKENS.glow,
    text:      theme.textColor      || DEFAULT_TOKENS.text,
    overlay:   theme.overlayColor   || DEFAULT_TOKENS.overlay,
    frameTheme: theme.frameTheme    || config.id?.toLowerCase() || "default",
    vfxTheme:   theme.vfxTheme      || "noir",
  };
}

/**
 * Apply a VG machine theme to the document body.
 * - Removes all previous theme classes
 * - Adds the correct theme class for this machine
 * - Sets CSS custom properties on :root for token-driven styling
 * - Dynamically ensures the theme CSS file is loaded (safe if missing)
 * @param {object} config — VG machine entry from index.json
 */
export function applyTheme(config = {}) {
  if (!config || !config.id) return;

  const tokens = provideThemeTokens(config);
  const themeClass = THEME_CLASS_MAP[config.id];

  // 1. Remove all existing VG theme classes
  ALL_THEME_CLASSES.forEach(cls => document.body.classList.remove(cls));

  // 2. Apply the new theme class
  if (themeClass) {
    document.body.classList.add(themeClass);
  }

  // 3. Set CSS custom properties for token-driven overlays/frames
  const root = document.documentElement;
  root.style.setProperty("--vg-accent",    tokens.accent);
  root.style.setProperty("--vg-secondary", tokens.secondary);
  root.style.setProperty("--vg-glow",      tokens.glow);
  root.style.setProperty("--vg-text",      tokens.text);
  root.style.setProperty("--vg-overlay",   tokens.overlay);

  // 4. Ensure the theme CSS file is loaded (no crash if missing)
  const cssPath = THEME_CSS_MAP[config.id];
  if (cssPath) {
    _ensureCSSLoaded(cssPath);
  }
}

/**
 * Remove all VG theme classes and reset CSS custom properties.
 */
export function removeTheme() {
  ALL_THEME_CLASSES.forEach(cls => document.body.classList.remove(cls));
  const root = document.documentElement;
  root.style.removeProperty("--vg-accent");
  root.style.removeProperty("--vg-secondary");
  root.style.removeProperty("--vg-glow");
  root.style.removeProperty("--vg-text");
  root.style.removeProperty("--vg-overlay");
}

/**
 * Dynamically inject a <link> for a CSS file if not already loaded.
 * Silently ignores 404s — no crash.
 * @param {string} href
 */
function _ensureCSSLoaded(href) {
  const existing = document.querySelector(`link[href="${href}"]`);
  if (existing) return; // already loaded
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.onerror = () => {
    // Silent — theme CSS missing is non-fatal
    link.remove();
  };
  document.head.appendChild(link);
}
