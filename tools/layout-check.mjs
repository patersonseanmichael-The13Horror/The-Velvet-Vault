import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:4173";
const outDir = path.join("output", "layout-check");

fs.mkdirSync(outDir, { recursive: true });

const firebaseAppStub = `
export const initializeApp = (config) => ({ config });
`;

const firebaseAuthStub = `
const mkUser = () => ({
  uid: "stub-admin",
  email: "stub@velvet.test",
  emailVerified: true,
  getIdTokenResult: async () => ({ claims: { admin: true } })
});
export const getAuth = () => ({ currentUser: mkUser(), authStateReady: async () => {} });
export const onAuthStateChanged = (auth, cb) => { Promise.resolve().then(() => cb(auth.currentUser)); return () => {}; };
export const signOut = async (auth) => { auth.currentUser = null; };
export const createUserWithEmailAndPassword = async () => ({ user: mkUser() });
export const signInWithEmailAndPassword = async () => ({ user: mkUser() });
export const sendEmailVerification = async () => {};
`;

const firebaseFunctionsStub = `
export const getFunctions = () => ({});
export const httpsCallable = (_fx, name) => async () => {
  if (name === "vvGetBalanceCallable") {
    return { data: { balance: 0, bonusCents: 0, rolloverTargetCents: 0, rolloverProgressCents: 0, bonusWithdrawalCapCents: 0 } };
  }
  if (name === "vvGetLiveFeed") {
    return { data: { entries: [] } };
  }
  if (name === "adminListPendingDepositRequests" || name === "adminListPendingWithdrawalRequests") {
    return { data: { entries: [] } };
  }
  return { data: {} };
};
`;

const firebaseFirestoreStub = `
const mkDocSnap = (data) => ({ data: () => data || {} });
export const getFirestore = () => ({});
export const doc = (...segments) => ({ kind: "doc", path: segments.join("/") });
export const collection = (...segments) => ({ kind: "collection", path: segments.join("/") });
export const query = (target, ...parts) => ({ kind: "query", target, parts });
export const orderBy = (...args) => ({ kind: "orderBy", args });
export const limit = (value) => ({ kind: "limit", value });
export const startAfter = (...args) => ({ kind: "startAfter", args });
export const getDocs = async () => ({ docs: [] });
export const onSnapshot = (target, onNext, onError) => {
  try {
    if (target?.kind === "doc" && String(target.path).includes("wallet/state")) {
      onNext?.(mkDocSnap({
        bonusCents: 0,
        rolloverTargetCents: 0,
        rolloverProgressCents: 0,
        bonusWithdrawalCapCents: 0,
        lastRebateAt: null
      }));
      return () => {};
    }
    if (target?.kind === "doc" && String(target.path).startsWith("users/")) {
      onNext?.(mkDocSnap({ balance: 0 }));
      return () => {};
    }
    onNext?.({ docs: [] });
  } catch (error) {
    onError?.(error);
  }
  return () => {};
};
`;

const firebaseStorageStub = `
export const getStorage = () => ({});
export const ref = (...segments) => ({ path: segments.join("/") });
export const uploadBytes = async () => ({});
export const getDownloadURL = async () => "https://example.test/proof.png";
`;

function normalizeError(value) {
  return String(value || "").replace(/\\s+/g, " ").trim();
}

async function addRoutes(page) {
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, body: "/* font stub */", contentType: "text/css" })
  );
  await page.route("https://fonts.gstatic.com/**", (route) =>
    route.fulfill({ status: 204, body: "", contentType: "font/woff2" })
  );
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-app.js", (route) =>
    route.fulfill({ status: 200, body: firebaseAppStub, contentType: "application/javascript" })
  );
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-auth.js", (route) =>
    route.fulfill({ status: 200, body: firebaseAuthStub, contentType: "application/javascript" })
  );
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-functions.js", (route) =>
    route.fulfill({ status: 200, body: firebaseFunctionsStub, contentType: "application/javascript" })
  );
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-firestore.js", (route) =>
    route.fulfill({ status: 200, body: firebaseFirestoreStub, contentType: "application/javascript" })
  );
  await page.route("https://www.gstatic.com/firebasejs/**/firebase-storage.js", (route) =>
    route.fulfill({ status: 200, body: firebaseStorageStub, contentType: "application/javascript" })
  );
}

const checks = [
  {
    name: "members",
    url: `${baseUrl}/members.html?demo=1`,
    screenshot: "members-wallet.png",
    act: async (page) => {
      await page.click("#btnOpenWallet");
      await page.waitForTimeout(300);
    },
    inspect: async (page) =>
      page.evaluate(() => ({
        modalVisible: document.querySelector("#vvWalletModal")?.getAttribute("aria-hidden") === "false",
        bodyLocked: document.body.classList.contains("vvModalOpen"),
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      }))
  },
  {
    name: "slots-lobby",
    url: `${baseUrl}/slots-lobby.html?demo=1`,
    screenshot: "slots-lobby-modal.png",
    act: async (page) => {
      await page.click(".vvLobbyTile");
      await page.waitForTimeout(300);
    },
    inspect: async (page) =>
      page.evaluate(() => ({
        modalVisible: document.querySelector("#vvLobbyModal")?.classList.contains("open") ?? false,
        bodyLocked: document.body.classList.contains("vvLobbyModalOpen"),
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      }))
  },
  {
    name: "slots",
    url: `${baseUrl}/slots.html?demo=1&machine=velvet_noir`,
    screenshot: "slots-idle.png",
    act: async (page) => {
      await page.waitForTimeout(1200);
    },
    inspect: async (page) =>
      page.evaluate(() => {
        const paytable = document.querySelector("#paytableModal");
        const holdWin = document.querySelector("#holdWinModal");
        const style = (el) => (el ? window.getComputedStyle(el).display : "missing");
        return {
          paytableHidden: style(paytable) === "none" && paytable?.getAttribute("aria-hidden") === "true",
          holdWinHidden: style(holdWin) === "none" && holdWin?.getAttribute("aria-hidden") === "true",
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
        };
      })
  },
  {
    name: "admin",
    url: `${baseUrl}/admin.html?demo=1`,
    screenshot: "admin.png",
    act: async (page) => {
      await page.waitForTimeout(400);
    },
    inspect: async (page) =>
      page.evaluate(() => ({
        depositsEmpty: document.querySelector("#adminDepositList")?.textContent?.includes("No pending deposits.") ?? false,
        withdrawalsEmpty: document.querySelector("#adminWithdrawalList")?.textContent?.includes("No pending withdrawals.") ?? false,
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      }))
  }
];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const summary = [];

for (const check of checks) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1366, height: 900 });
  const errors = [];
  const requestFails = [];
  await addRoutes(page);

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push({ type: "console", text: normalizeError(msg.text()) });
    }
  });
  page.on("pageerror", (error) => {
    errors.push({ type: "pageerror", text: normalizeError(error?.message || error) });
  });
  page.on("requestfailed", (request) => {
    requestFails.push({
      url: request.url(),
      reason: normalizeError(request.failure()?.errorText || "failed")
    });
  });

  let result = { ok: true };
  try {
    await page.goto(check.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1200);
    await check.act(page);
    await page.screenshot({ path: path.join(outDir, check.screenshot), fullPage: false });
    result = await check.inspect(page);
  } catch (error) {
    errors.push({ type: "audit", text: normalizeError(error?.message || error) });
  }

  const entry = {
    page: check.name,
    result,
    errors,
    requestFails
  };
  summary.push(entry);
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  try {
    await page.close();
  } catch {}
}

try {
  await browser.close();
} catch {}

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
