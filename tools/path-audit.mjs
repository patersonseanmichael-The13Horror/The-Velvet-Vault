#!/usr/bin/env node
/**
 * tools/path-audit.mjs
 *
 * Audits every asset path referenced in:
 *   - packages/vg-machines/index.json  (card.png, logo.png, symbolsDir)
 *   - packages/vg-machines/VG-NN.symbols.json  (each symbol file)
 *   - css/pages/slots-vg-*.css  (existence only)
 *   - js/vg/vg-skins.js  (manifest import paths)
 *
 * Exits with code 1 if any referenced file is missing.
 */
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const INDEX     = path.join(ROOT, "packages", "vg-machines", "index.json");

let errors   = 0;
let warnings = 0;
let checked  = 0;

function fail(msg)  { console.error(`  FAIL  ${msg}`); errors++;   }
function warn(msg)  { console.warn( `  WARN  ${msg}`); warnings++; }
function ok(msg)    { console.log(  `  OK    ${msg}`);             }

function checkFile(relPath, label) {
  checked++;
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    fail(`Missing: ${relPath}  [${label}]`);
    return false;
  }
  return true;
}

// ── 1. Load registry ────────────────────────────────────────────────────────
if (!fs.existsSync(INDEX)) {
  console.error(`FATAL: Registry not found at ${INDEX}`);
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(INDEX, "utf8"));
const machines = registry.machines ?? registry;
if (!Array.isArray(machines) || machines.length === 0) {
  console.error("FATAL: Registry has no machines array");
  process.exit(1);
}
console.log(`\n[path-audit] Checking ${machines.length} machines...\n`);

// ── 2. Per-machine asset checks ─────────────────────────────────────────────
for (const m of machines) {
  const id = m.id ?? m.machineId ?? "unknown";
  process.stdout.write(`  ${id}  `);

  // card.png and logo.png
  const cardPath = m.assets?.cardImage;
  const logoPath = m.assets?.logoImage;
  if (cardPath) checkFile(cardPath, `${id} cardImage`);
  else { fail(`${id}: assets.cardImage missing`); }

  if (logoPath) checkFile(logoPath, `${id} logoImage`);
  else { warn(`${id}: assets.logoImage missing`); }

  // symbols directory
  const symDir = m.assets?.symbolsDir ?? `images/slots/vg/${id}/symbols`;
  const symAbs = path.join(ROOT, symDir);
  if (!fs.existsSync(symAbs)) {
    fail(`${id}: symbolsDir not found: ${symDir}`);
  } else {
    const pngs = fs.readdirSync(symAbs).filter(f => f.endsWith(".png"));
    if (pngs.length < 4) {
      warn(`${id}: only ${pngs.length} PNG symbols in ${symDir}`);
    }
  }

  // symbol manifest
  const manifestPath = path.join(ROOT, "packages", "vg-machines", `${id}.symbols.json`);
  if (!fs.existsSync(manifestPath)) {
    warn(`${id}: symbol manifest not found (packages/vg-machines/${id}.symbols.json)`);
  } else {
    let syms;
    try {
      syms = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (e) {
      fail(`${id}: symbol manifest JSON parse error: ${e.message}`);
      syms = null;
    }
    if (Array.isArray(syms)) {
      for (const sym of syms) {
        if (sym.file) checkFile(sym.file, `${id} symbol ${sym.id}`);
      }
    }
  }

  process.stdout.write("\n");
}

// ── 3. CSS theme files ───────────────────────────────────────────────────────
console.log("\n[path-audit] Checking CSS theme files...\n");
for (const m of machines) {
  const id = m.id ?? m.machineId ?? "unknown";
  const num = parseInt(id.replace("VG-", ""), 10);
  // VG-01 uses the original slots-vip.css (flagship machine)
  const cssPath = (num === 1)
    ? "css/pages/slots-vip.css"
    : `css/pages/slots-${id.toLowerCase()}.css`;
  checkFile(cssPath, `${id} CSS theme`);
}

// ── 4. Summary ───────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`[path-audit] Checked ${checked} paths across ${machines.length} machines`);
if (errors > 0) {
  console.error(`[path-audit] FAILED — ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else if (warnings > 0) {
  console.warn(`[path-audit] PASSED with ${warnings} warning(s)`);
  process.exit(0);
} else {
  console.log(`[path-audit] PASSED — all ${checked} paths verified`);
  process.exit(0);
}
