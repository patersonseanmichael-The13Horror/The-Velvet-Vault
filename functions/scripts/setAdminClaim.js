#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

function usage() {
  console.error(
    "Usage: node scripts/setAdminClaim.js --key <service-account.json> --email <user@example.com>"
  );
  process.exit(1);
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return String(process.argv[index + 1] || "").trim();
}

async function main() {
  const keyArg = readArg("--key");
  const email = readArg("--email");

  if (!keyArg || !email) {
    usage();
  }

  const keyPath = path.resolve(process.cwd(), keyArg);
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Service account key not found: ${keyPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  const user = await admin.auth().getUserByEmail(email);
  const existingClaims = user.customClaims || {};

  await admin.auth().setCustomUserClaims(user.uid, {
    ...existingClaims,
    admin: true
  });

  const updatedUser = await admin.auth().getUser(user.uid);

  console.log("Admin claim set.");
  console.log(`email: ${updatedUser.email}`);
  console.log(`uid: ${updatedUser.uid}`);
  console.log(`claims: ${JSON.stringify(updatedUser.customClaims || {}, null, 2)}`);
  console.log("Next step: sign out/in or call currentUser.getIdToken(true).");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
