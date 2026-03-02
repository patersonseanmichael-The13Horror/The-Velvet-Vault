import { formatAUD as sharedFormatAUD, toCents } from "./app/currency.js";

const LS_KEY = "vv_wallet_balance_v1";
const LEGACY_KEYS = ["vv_wallet_balance", "vault_wallet_balance", "walletBalance"];
const LEDGER_KEY = "vv_wallet_ledger_v1";
const DEFAULT_BALANCE = 10000;
const subscribers = new Set();
const localRounds = new Map();

// Try to load the server-authoritative wallet first; fall back to local cache.
(async function initWallet() {
  if (window.vvApp && window.vvAuth) {
    try {
      await import("./wallet-secure.js");
      return; // secure engine installed window.VaultEngine
    } catch (err) {
      console.warn("[VelvetVault] Secure wallet unavailable, using local fallback.", err);
    }
  }
  initLocalWallet();
})();

function toInt(value) {
  return toCents(value);
}

export function formatAUD(value) {
  return sharedFormatAUD(value);
}

export function formatGold(value) {
  return formatAUD(value);
}

function readWallet() {
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (raw == null) {
      // migrate from any legacy keys
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy != null) {
          raw = legacy;
          localStorage.setItem(LS_KEY, legacy);
          break;
        }
      }
    }
    if (raw == null) {
      localStorage.setItem(LS_KEY, String(DEFAULT_BALANCE));
      return DEFAULT_BALANCE;
    }
    return toInt(raw);
  } catch {
    return DEFAULT_BALANCE;
  }
}

function readLedger() {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLedger(entries) {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(entries.slice(0, 250)));
  } catch {}
}

function appendLedger(type, amount, note, balanceAfter) {
  const next = [{
    ts: Date.now(),
    type,
    amount: toInt(amount),
    note: String(note || ""),
    balanceAfter: toInt(balanceAfter)
  }, ...readLedger()];
  writeLedger(next);
}

function writeWallet(nextBalance) {
  const safeBalance = toInt(nextBalance);
  try {
    localStorage.setItem(LS_KEY, String(safeBalance));
  } catch {}
  updateWalletUI();
  notify();
  return safeBalance;
}

export function updateWalletUI() {
  const balance = readWallet();
  const text = formatGold(balance);
  const targets = [
    ...document.querySelectorAll("#walletBal"),
    ...document.querySelectorAll("[data-wallet-balance]")
  ];
  for (const el of targets) {
    el.textContent = text;
  }
}

function notify() {
  const balance = readWallet();
  for (const fn of subscribers) {
    try {
      fn(balance);
    } catch {}
  }
}

function getBalance() {
  return readWallet();
}

function debit(amount, note = "") {
  const spend = toInt(amount);
  if (spend <= 0) return false;
  const current = readWallet();
  if (spend > current) return false;
  const next = writeWallet(current - spend);
  appendLedger("debit", spend, note, next);
  return true;
}

function credit(amount, note) {
  const win = toInt(amount);
  if (win <= 0) return false;
  const next = writeWallet(readWallet() + win);
  appendLedger("credit", win, note, next);
  return true;
}

function subscribe(handler) {
  if (typeof handler !== "function") {
    return () => {};
  }
  subscribers.add(handler);
  try {
    handler(readWallet());
  } catch {}
  return () => subscribers.delete(handler);
}

async function reserveBet(request) {
  const roundId = String(request?.roundId || "").trim();
  const amount = toInt(request?.amount);
  if (!roundId) throw new Error("roundId required");

  const existing = localRounds.get(roundId);
  if (existing) {
    return { ok: true, status: existing.status || "reserved", existing: true, amount: existing.amount || 0 };
  }

  if (amount > 0) {
    const ok = debit(amount, `reserve|roundId=${roundId}`);
    if (!ok) throw new Error("Insufficient funds");
  }

  localRounds.set(roundId, {
    amount,
    status: "reserved",
    meta: request?.meta ?? null
  });

  return {
    ok: true,
    status: "reserved",
    amount,
    balance: readWallet()
  };
}

async function settleBet(request) {
  const roundId = String(request?.roundId || "").trim();
  const payout = toInt(request?.payout);
  if (!roundId) throw new Error("roundId required");

  const round = localRounds.get(roundId);
  if (!round) return { ok: true, status: "noop", balance: readWallet() };
  if (round.status === "settled") return { ok: true, status: "settled", existing: true, balance: readWallet() };
  if (round.status !== "reserved") return { ok: true, status: round.status || "noop", balance: readWallet() };

  if (payout > 0) {
    credit(payout, `settle|roundId=${roundId}`);
  }

  round.status = "settled";
  round.payout = payout;
  localRounds.set(roundId, round);

  return {
    ok: true,
    status: "settled",
    balance: readWallet()
  };
}

async function cancelBet(request) {
  const roundId = String(request?.roundId || "").trim();
  if (!roundId) throw new Error("roundId required");

  const round = localRounds.get(roundId);
  if (!round) return { ok: true, status: "noop", balance: readWallet() };
  if (round.status === "cancelled") return { ok: true, status: "cancelled", existing: true, balance: readWallet() };
  if (round.status === "settled") return { ok: true, status: "settled", existing: true, balance: readWallet() };

  if (toInt(round.amount) > 0) {
    credit(round.amount, `cancel|roundId=${roundId}`);
  }

  round.status = "cancelled";
  localRounds.set(roundId, round);

  return {
    ok: true,
    status: "cancelled",
    balance: readWallet()
  };
}

function initLocalWallet() {
  if (!window.VaultEngine) {
    window.VaultEngine = {
      mode: "local",
      get user() {
        return window.vvAuth?.currentUser || { uid: "local-user" };
      },
      getBalance,
      debit,
      credit,
      subscribe,
      formatAUD,
      formatGold,
      getLedger: () => readLedger(),
      getWalletMeta: () => ({
        bonusCents: 0,
        rolloverTargetCents: 0,
        rolloverProgressCents: 0,
        bonusWithdrawalCapCents: 0
      }),
      createDepositRequest: async () => {
        throw new Error("Deposit requests require Firebase.");
      },
      createWithdrawalRequest: async () => {
        throw new Error("Withdrawal requests require Firebase.");
      },
      reserveBet,
      settleBet,
      cancelBet
    };
  }

  // keep other tabs in sync
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY || e.key === LEDGER_KEY) {
      updateWalletUI();
      notify();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateWalletUI();
    }, { once: true });
  } else {
    updateWalletUI();
  }
}
