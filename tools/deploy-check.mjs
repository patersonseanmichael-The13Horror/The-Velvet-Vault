import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const EXPECTED_PROJECT_ID = "the-velvet-vault-11bd2";
const EXPECTED_RENDER_URL = "https://velvet-vault.onrender.com";
const checks = [];

function record(name, pass, details) {
  checks.push({ name, pass, details });
}

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

try {
  const firebaserc = readJson(".firebaserc");
  const projectIds = Object.values(firebaserc.projects || {});
  record(
    ".firebaserc project",
    projectIds.includes(EXPECTED_PROJECT_ID),
    `found: ${projectIds.join(", ") || "none"}`
  );
} catch (error) {
  record(".firebaserc project", false, error.message);
}

record(".firebaserc exists", fs.existsSync(path.join(ROOT, ".firebaserc")), ".firebaserc");

try {
  const firebaseConfig = fs.readFileSync(path.join(ROOT, "js/firebase-config.js"), "utf8");
  record(
    "firebase projectId",
    firebaseConfig.includes(`projectId: "${EXPECTED_PROJECT_ID}"`),
    EXPECTED_PROJECT_ID
  );
} catch (error) {
  record("firebase projectId", false, error.message);
}

try {
  const runtimeConfig = fs.readFileSync(path.join(ROOT, "js/runtime-config.js"), "utf8");
  record(
    "Render URL",
    runtimeConfig.includes(`window.VV_SLOT_SERVER_URL = "${EXPECTED_RENDER_URL}"`),
    EXPECTED_RENDER_URL
  );
} catch (error) {
  record("Render URL", false, error.message);
}

try {
  const functionsPkg = readJson("functions/package.json");
  record(
    "Functions runtime",
    String(functionsPkg.engines?.node || "") === "20",
    `node=${functionsPkg.engines?.node ?? "missing"}`
  );
} catch (error) {
  record("Functions runtime", false, error.message);
}

try {
  const tracked = execFileSync("git", ["ls-files", "functions/lib"], {
    cwd: ROOT,
    encoding: "utf8"
  }).trim();
  record("functions/lib tracked", tracked.length === 0, tracked || "not tracked");
} catch (error) {
  try {
    const gitIndex = fs.readFileSync(path.join(ROOT, ".git", "index"), "latin1");
    const tracked = gitIndex.includes("functions/lib/");
    record(
      "functions/lib tracked",
      !tracked,
      tracked ? "functions/lib entry found in .git/index" : "not tracked (index scan)"
    );
  } catch (fallbackError) {
    record("functions/lib tracked", false, `${error.message}; fallback failed: ${fallbackError.message}`);
  }
}

const hasFailures = checks.some((check) => !check.pass);
for (const check of checks) {
  const prefix = check.pass ? "PASS" : "FAIL";
  console.log(`${prefix} ${check.name}: ${check.details}`);
}

if (hasFailures) {
  process.exitCode = 1;
} else {
  console.log("PASS deploy-check summary");
}
