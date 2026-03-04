#!/usr/bin/env node
/**
 * tools/vg-validate.mjs
 *
 * Validates the VG machine registry at packages/vg-machines/index.json.
 *
 * Checks performed:
 *  1. Exactly 30 machines present
 *  2. All IDs are unique and match the pattern VG-NN (01-30)
 *  3. All slugs are unique, lowercase, hyphen-separated
 *  4. All titles are non-empty strings
 *  5. Layout base and feature have numeric reels (1-9) and rows (1-9)
 *  6. switchOn is a non-empty array of known trigger strings
 *  7. tiersCents has all four required keys with positive integer values
 *  8. Asset paths follow the expected pattern (no absolute paths)
 *  9. Asset files (card.png, logo.png) exist on disk
 * 10. symbols/ directory exists for each machine
 * 11. machineId is a non-empty string
 * 12. Layout distribution: 10 expanding, 10 contracting, 10 classic
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const INDEX     = path.join(ROOT, "packages", "vg-machines", "index.json");

const KNOWN_TRIGGERS = new Set(["freespins", "holdandwin", "jackpot", "respin", "bonus"]);
const TIER_KEYS      = ["bigMin", "superMin", "hugeMin", "extravagantMin"];

let errors = 0;
let warnings = 0;

function fail(msg)  { console.error(`  FAIL  ${msg}`); errors++;   }
function warn(msg)  { console.warn( `  WARN  ${msg}`); warnings++; }
function ok(msg)    { console.log(  `  OK    ${msg}`);             }

// ── Load registry ──────────────────────────────────────────────────────────
if (!fs.existsSync(INDEX)) {
  console.error(`FATAL: Registry not found at ${INDEX}`);
  process.exit(1);
}

const raw     = fs.readFileSync(INDEX, "utf8");
const data    = JSON.parse(raw);
const machines = data.machines;

console.log(`\nVelvet Grade Registry Validator`);
console.log(`Registry: ${INDEX}`);
console.log(`Machines found: ${machines.length}\n`);

// ── Check 1: Count ─────────────────────────────────────────────────────────
if (machines.length === 30) {
  ok("Exactly 30 machines present");
} else {
  fail(`Expected 30 machines, found ${machines.length}`);
}

// ── Check 2: Unique IDs matching VG-NN ─────────────────────────────────────
const idSet = new Set();
const idPattern = /^VG-\d{2}$/;
for (const m of machines) {
  if (!idPattern.test(m.id)) fail(`ID "${m.id}" does not match VG-NN pattern`);
  if (idSet.has(m.id))       fail(`Duplicate ID: ${m.id}`);
  idSet.add(m.id);
}
if (idSet.size === 30) ok("All 30 IDs are unique and match VG-NN pattern");

// ── Check 3: Unique slugs ──────────────────────────────────────────────────
const slugSet = new Set();
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
for (const m of machines) {
  if (!slugPattern.test(m.slug)) fail(`${m.id}: slug "${m.slug}" is not lowercase-hyphenated`);
  if (slugSet.has(m.slug))       fail(`Duplicate slug: ${m.slug} (${m.id})`);
  slugSet.add(m.slug);
}
if (slugSet.size === 30) ok("All 30 slugs are unique and correctly formatted");

// ── Check 4: Titles ────────────────────────────────────────────────────────
let titleOk = true;
for (const m of machines) {
  if (!m.title || typeof m.title !== "string" || m.title.trim() === "") {
    fail(`${m.id}: title is empty or missing`);
    titleOk = false;
  }
}
if (titleOk) ok("All 30 machines have non-empty titles");

// ── Check 5: Layout dimensions ─────────────────────────────────────────────
let layoutOk = true;
for (const m of machines) {
  const b = m.layout?.base;
  const f = m.layout?.feature;
  if (!b || typeof b.reels !== "number" || b.reels < 1 || b.reels > 9) {
    fail(`${m.id}: invalid base.reels (${b?.reels})`); layoutOk = false;
  }
  if (!b || typeof b.rows  !== "number" || b.rows  < 1 || b.rows  > 9) {
    fail(`${m.id}: invalid base.rows (${b?.rows})`);   layoutOk = false;
  }
  if (!f || typeof f.reels !== "number" || f.reels < 1 || f.reels > 9) {
    fail(`${m.id}: invalid feature.reels (${f?.reels})`); layoutOk = false;
  }
  if (!f || typeof f.rows  !== "number" || f.rows  < 1 || f.rows  > 9) {
    fail(`${m.id}: invalid feature.rows (${f?.rows})`);   layoutOk = false;
  }
}
if (layoutOk) ok("All 30 machines have valid layout dimensions");

// ── Check 6: switchOn ──────────────────────────────────────────────────────
let switchOk = true;
for (const m of machines) {
  const sw = m.layout?.switchOn;
  if (!Array.isArray(sw) || sw.length === 0) {
    fail(`${m.id}: switchOn is missing or empty`); switchOk = false; continue;
  }
  for (const t of sw) {
    if (!KNOWN_TRIGGERS.has(t)) {
      warn(`${m.id}: unknown switchOn trigger "${t}"`);
    }
  }
}
if (switchOk) ok("All 30 machines have non-empty switchOn arrays");

// ── Check 7: tiersCents ────────────────────────────────────────────────────
let tiersOk = true;
for (const m of machines) {
  const t = m.tiersCents;
  for (const key of TIER_KEYS) {
    if (typeof t?.[key] !== "number" || t[key] <= 0 || !Number.isInteger(t[key])) {
      fail(`${m.id}: tiersCents.${key} is invalid (${t?.[key]})`);
      tiersOk = false;
    }
  }
}
if (tiersOk) ok("All 30 machines have valid tiersCents");

// ── Check 8: Asset path format ─────────────────────────────────────────────
let pathFmtOk = true;
for (const m of machines) {
  const a = m.assets;
  const expected = `images/slots/vg/${m.id}`;
  if (!a?.cardImage?.startsWith(expected))   { fail(`${m.id}: cardImage path unexpected: ${a?.cardImage}`);   pathFmtOk = false; }
  if (!a?.logoImage?.startsWith(expected))   { fail(`${m.id}: logoImage path unexpected: ${a?.logoImage}`);   pathFmtOk = false; }
  if (!a?.symbolPackPath?.startsWith(expected)) { fail(`${m.id}: symbolPackPath unexpected: ${a?.symbolPackPath}`); pathFmtOk = false; }
}
if (pathFmtOk) ok("All 30 machines have correctly formatted asset paths");

// ── Check 9 & 10: Asset files exist on disk ────────────────────────────────
let assetOk = true;
for (const m of machines) {
  const card = path.join(ROOT, m.assets.cardImage);
  const logo = path.join(ROOT, m.assets.logoImage);
  const sym  = path.join(ROOT, m.assets.symbolPackPath);
  if (!fs.existsSync(card)) { fail(`${m.id}: card.png missing at ${m.assets.cardImage}`); assetOk = false; }
  if (!fs.existsSync(logo)) { fail(`${m.id}: logo.png missing at ${m.assets.logoImage}`); assetOk = false; }
  if (!fs.existsSync(sym))  { fail(`${m.id}: symbols/ dir missing at ${m.assets.symbolPackPath}`); assetOk = false; }
}
if (assetOk) ok("All 30 machines have card.png, logo.png, and symbols/ on disk");

// ── Check 11: machineId ────────────────────────────────────────────────────
let midOk = true;
for (const m of machines) {
  if (!m.machineId || typeof m.machineId !== "string" || m.machineId.trim() === "") {
    fail(`${m.id}: machineId is empty or missing`); midOk = false;
  }
}
if (midOk) ok("All 30 machines have a non-empty machineId");

// ── Check 12: Layout distribution ─────────────────────────────────────────
const expanding   = machines.filter(m => m.layout.base.reels === 5 && m.layout.base.rows === 3 && m.layout.feature.reels === 6 && m.layout.feature.rows === 4);
const contracting = machines.filter(m => m.layout.base.reels === 6 && m.layout.base.rows === 4 && m.layout.feature.reels === 5 && m.layout.feature.rows === 3);
const classic     = machines.filter(m => m.layout.base.reels === 5 && m.layout.base.rows === 3 && m.layout.feature.reels === 5 && m.layout.feature.rows === 3);

if (expanding.length   === 10) ok(`Layout distribution: 10 expanding (5×3 → 6×4)`);
else                           fail(`Expected 10 expanding, found ${expanding.length}`);

if (contracting.length === 10) ok(`Layout distribution: 10 contracting (6×4 → 5×3)`);
else                           fail(`Expected 10 contracting, found ${contracting.length}`);

if (classic.length     === 10) ok(`Layout distribution: 10 classic (5×3 → 5×3)`);
else                           fail(`Expected 10 classic, found ${classic.length}`);

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
if (errors === 0 && warnings === 0) {
  console.log(`\n  ✅  PASS — all checks passed with 0 errors, 0 warnings\n`);
  process.exit(0);
} else if (errors === 0) {
  console.log(`\n  ⚠️   PASS WITH WARNINGS — 0 errors, ${warnings} warning(s)\n`);
  process.exit(0);
} else {
  console.log(`\n  ❌  FAIL — ${errors} error(s), ${warnings} warning(s)\n`);
  process.exit(1);
}
