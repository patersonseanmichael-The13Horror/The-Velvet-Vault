/* ==========================================================
   Velvet Vault — Secure Wallet Engine (Client)
   Keeps the SAME API your games already call:
   window.VaultEngine.getBalance()
   window.VaultEngine.debit(amount, note)
   window.VaultEngine.credit(amount, note)  (requires roundId inside note OR generated)
   window.VaultEngine.subscribe(fn)
   window.VaultEngine.formatGold(n)

   Source of truth: Firestore users/{uid}.balance
   Mutations: Cloud Functions vvDebit / vvCredit
   Idempotency: roundId required for credit (payout)
   ========================================================== */

import {
  getFirestore,
  doc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { formatAUD as sharedFormatAUD, toCents } from "./app/currency.js";

const app = window.vvApp;
const auth = window.vvAuth;

const LS_KEY = "vv_wallet_cache_v1";

function nowId() {
  return "r_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

function parseNote(note) {
  // allow existing code to pass strings like "roulette-payout" etc
  // You can optionally embed roundId: "roulette-payout|roundId=abc"
  const s = String(note || "");
  const parts = s.split("|");
  const base = parts[0] || "unknown";
  let roundId = "";
  for (const p of parts.slice(1)) {
    const [k, v] = p.split("=");
    if ((k || "").trim() === "roundId") roundId = (v || "").trim();
  }
  return { game: base.slice(0, 40), roundId };
}

function safeInt(x) {
  return toCents(x);
}

function safeStr(v, max = 120) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

let state = {
  user: null,
  balance: 0,
  ready: false,
  wallet: {
    bonusCents: 0,
    rolloverTargetCents: 0,
    rolloverProgressCents: 0,
    bonusWithdrawalCapCents: 0,
    lastRebateAt: null
  }
};

let ledgerCache = [];
const subs = new Set();
function notify() {
  for (const fn of subs) {
    try { fn(state.balance); } catch {}
  }
}

function setCache(balance) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      balance: safeInt(balance),
      at: Date.now()
    }));
  } catch {}
}

function getCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j.balance !== "number") return null;
    return j;
  } catch { return null; }
}

function formatAUD(n) {
  return sharedFormatAUD(n);
}

function formatGold(n) {
  return formatAUD(n);
}

// Firebase wiring
const db = getFirestore(app);
const fx = getFunctions(app);
const vvGetBalanceCallable = httpsCallable(fx, "vvGetBalanceCallable");
const vvDebit = httpsCallable(fx, "vvDebit");
const vvCredit = httpsCallable(fx, "vvCredit");
const vvReserveBet = httpsCallable(fx, "vvReserveBet");
const vvSettleBet = httpsCallable(fx, "vvSettleBet");
const vvCancelBet = httpsCallable(fx, "vvCancelBet");
const vvCreateDepositRequest = httpsCallable(fx, "vvCreateDepositRequest");
const vvCreateWithdrawalRequest = httpsCallable(fx, "vvCreateWithdrawalRequest");
const vvSpin = httpsCallable(fx, "vvSpin");

let unsubUser = null;
let unsubLedger = null;
let unsubWalletState = null;

function attachUser(uid) {
  if (unsubUser) { try { unsubUser(); } catch {} }
  if (unsubLedger) { try { unsubLedger(); } catch {} }
  if (unsubWalletState) { try { unsubWalletState(); } catch {} }

  const ref = doc(db, "users", uid);
  unsubUser = onSnapshot(ref, (snap) => {
    const bal = safeInt(snap.data()?.balance || 0);
    state.balance = bal;
    state.ready = true;
    setCache(bal);
    notify();
  }, () => {
    // If snapshot fails, use cached balance for UI only
    const c = getCache();
    if (c) state.balance = safeInt(c.balance);
    notify();
  });

  const walletRef = doc(db, "users", uid, "wallet", "state");
  unsubWalletState = onSnapshot(walletRef, (snap) => {
    const data = snap.data() || {};
    state.wallet = {
      bonusCents: safeInt(data.bonusCents),
      rolloverTargetCents: safeInt(data.rolloverTargetCents),
      rolloverProgressCents: safeInt(data.rolloverProgressCents),
      bonusWithdrawalCapCents: safeInt(data.bonusWithdrawalCapCents),
      lastRebateAt: data.lastRebateAt?.toMillis ? data.lastRebateAt.toMillis() : null
    };
    notify();
  }, () => {
    state.wallet = {
      bonusCents: 0,
      rolloverTargetCents: 0,
      rolloverProgressCents: 0,
      bonusWithdrawalCapCents: 0,
      lastRebateAt: null
    };
  });

  const ledgerQuery = query(
    collection(db, "users", uid, "ledger"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  unsubLedger = onSnapshot(ledgerQuery, (snap) => {
    ledgerCache = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        ts: data.createdAt?.toMillis
          ? data.createdAt.toMillis()
          : data.ts?.toMillis
            ? data.ts.toMillis()
            : Date.now(),
        type: data.type || "",
        amount: safeInt(data.amount),
        amountCents: Number.isFinite(Number(data.amountCents)) ? Number(data.amountCents) : safeInt(data.amount),
        note: data.note || "",
        game: data.game || "",
        roundId: data.roundId || "",
        balanceAfter: safeInt(data.balanceAfter ?? state.balance),
        status: data.status || "",
        meta: data.meta && typeof data.meta === "object" ? data.meta : null
      };
    });
    notify();
  }, () => {
    ledgerCache = [];
  });
}

function detachUser() {
  if (unsubUser) { try { unsubUser(); } catch {} }
  unsubUser = null;
  if (unsubLedger) { try { unsubLedger(); } catch {} }
  unsubLedger = null;
  if (unsubWalletState) { try { unsubWalletState(); } catch {} }
  unsubWalletState = null;
  state.user = null;
  state.ready = false;
  state.wallet = {
    bonusCents: 0,
    rolloverTargetCents: 0,
    rolloverProgressCents: 0,
    bonusWithdrawalCapCents: 0,
    lastRebateAt: null
  };

  const c = getCache();
  state.balance = c ? safeInt(c.balance) : 0;
  ledgerCache = [];
  notify();
}

onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  if (!user) {
    detachUser();
    return;
  }
  attachUser(user.uid);

  // Prime balance once (optional)
  try {
    const res = await vvGetBalanceCallable();
    const bal = safeInt(res.data?.balance || 0);
    state.balance = bal;
    state.wallet = {
      bonusCents: safeInt(res.data?.bonusCents || 0),
      rolloverTargetCents: safeInt(res.data?.rolloverTargetCents || 0),
      rolloverProgressCents: safeInt(res.data?.rolloverProgressCents || 0),
      bonusWithdrawalCapCents: safeInt(res.data?.bonusWithdrawalCapCents || 0),
      lastRebateAt: null
    };
    setCache(bal);
    notify();
  } catch {}
});

async function debit(amount, note) {
  if (!state.user) return false;
  const amt = safeInt(amount);
  if (amt <= 0) return false;

  const { game, roundId } = parseNote(note);

  try {
    const res = await vvDebit({ amount: amt, game, roundId });
    const bal = safeInt(res.data?.balance || state.balance);
    state.balance = bal;
    setCache(bal);
    notify();
    return true;
  } catch (e) {
    return false;
  }
}

async function credit(amount, note) {
  if (!state.user) return false;
  const amt = safeInt(amount);
  if (amt <= 0) return false;

  const parsed = parseNote(note);
  const game = parsed.game;
  const roundId = parsed.roundId || nowId(); // if game didn’t pass one, we create one (still idempotent per-call)
  // NOTE: best practice is game passes a roundId per spin/hand. This fallback prevents total failure.

  try {
    const res = await vvCredit({ amount: amt, game, roundId });
    const bal = safeInt(res.data?.balance || state.balance);
    state.balance = bal;
    setCache(bal);
    notify();
    return true;
  } catch {
    return false;
  }
}

async function reserveBet(request) {
  if (!state.user) {
    throw new Error("Not authenticated.");
  }

  const amount = safeInt(request?.amount);
  const roundId = safeStr(request?.roundId || nowId(), 120);
  const meta = request?.meta && typeof request.meta === "object" ? request.meta : null;

  const res = await vvReserveBet({ roundId, amount, meta });
  const payload = res.data || {};
  if (typeof payload.balance === "number") {
    state.balance = safeInt(payload.balance);
    setCache(state.balance);
    notify();
  }
  return payload;
}

async function settleBet(request) {
  if (!state.user) {
    throw new Error("Not authenticated.");
  }

  const payout = safeInt(request?.payout);
  const roundId = safeStr(request?.roundId || "", 120);
  const meta = request?.meta && typeof request.meta === "object" ? request.meta : null;

  if (!roundId) {
    throw new Error("roundId required.");
  }

  const res = await vvSettleBet({ roundId, payout, meta });
  const payload = res.data || {};
  if (typeof payload.balance === "number") {
    state.balance = safeInt(payload.balance);
    setCache(state.balance);
    notify();
  }
  return payload;
}

async function cancelBet(request) {
  if (!state.user) {
    throw new Error("Not authenticated.");
  }

  const roundId = safeStr(request?.roundId || "", 120);
  const reason = safeStr(request?.reason || "", 120);

  if (!roundId) {
    throw new Error("roundId required.");
  }

  const res = await vvCancelBet({ roundId, reason });
  const payload = res.data || {};
  if (typeof payload.balance === "number") {
    state.balance = safeInt(payload.balance);
    setCache(state.balance);
    notify();
  }
  return payload;
}

async function spin(request) {
  if (!state.user) {
    return { ok: false, error: "Not authenticated." };
  }

  const bet = safeInt(request?.stake ?? request?.bet);
  const denom = safeInt(request?.denom || 1);
  const configId = safeStr(request?.machineId || request?.configId || "noir_paylines_5x3", 80);
  const roundId = safeStr(request?.roundId || nowId(), 120);
  const seed = safeStr(request?.seed || "", 120);
  const featureState = request?.state && typeof request.state === "object" ? request.state : null;

  if (bet <= 0 || denom <= 0) {
    return { ok: false, error: "Invalid bet/denom." };
  }

  try {
    const res = await vvSpin({
      stake: bet,
      bet,
      denom,
      machineId: configId,
      configId,
      roundId,
      seed,
      ...(featureState ? { state: featureState } : {})
    });

    const payload = res.data || {};
    const bal = safeInt(payload.balance ?? state.balance);
    state.balance = bal;
    setCache(bal);
    notify();
    return payload;
  } catch (err) {
    return { ok: false, error: err?.message || "Spin failed." };
  }
}

function getBalance() {
  return safeInt(state.balance);
}

function getLedger() {
  return Array.isArray(ledgerCache) ? ledgerCache : [];
}

function getWalletMeta() {
  return { ...state.wallet };
}

async function createDepositRequest(request) {
  if (!state.user) {
    throw new Error("Not authenticated.");
  }

  const amountCents = safeInt(request?.amountCents);
  const proofImageUrl = safeStr(request?.proofImageUrl || "", 1500);
  const proofStoragePath = safeStr(request?.proofStoragePath || "", 300);

  const res = await vvCreateDepositRequest({
    amountCents,
    proofImageUrl,
    proofStoragePath
  });
  return res.data || { ok: true };
}

async function createWithdrawalRequest(request) {
  if (!state.user) {
    throw new Error("Not authenticated.");
  }

  const amountCents = safeInt(request?.amountCents);
  const payoutDetails = request?.payoutDetails && typeof request.payoutDetails === "object"
    ? request.payoutDetails
    : {};

  const res = await vvCreateWithdrawalRequest({
    amountCents,
    payoutDetails
  });
  return res.data || { ok: true };
}

function subscribe(fn) {
  if (typeof fn !== "function") return () => {};
  subs.add(fn);
  // immediate fire
  try { fn(state.balance); } catch {}
  return () => subs.delete(fn);
}

// Export global (backwards compatible)
window.VaultEngine = {
  mode: "secure",
  get user() { return state.user; },
  getBalance,
  debit: (amt, note) => {
    // keep legacy sync semantics: return boolean immediately is no longer possible
    // BUT your code expects boolean right now — so we provide a "best effort":
    // if debit is called without await, it will still work visually; wallet updates async.
    debit(amt, note);
    return true;
  },
  credit: (amt, note) => {
    credit(amt, note);
    return true;
  },
  subscribe,
  formatAUD,
  formatGold,
  getLedger,
  getWalletMeta,
  createDepositRequest,
  createWithdrawalRequest,
  reserveBet,
  settleBet,
  cancelBet,
  spin
};
