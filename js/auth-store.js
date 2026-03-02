import { signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js";

(function initAuthStore() {
  const auth = window.vvAuth || null;
  const app = window.vvApp || null;
  const storage = app ? getStorage(app) : null;

  if (auth && typeof auth.signOut !== "function") {
    auth.signOut = () => signOut(auth);
  }

  async function waitForVaultEngine(timeoutMs = 5000) {
    const started = Date.now();
    while (!window.VaultEngine && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return window.VaultEngine || null;
  }

  async function getSnapshot() {
    const engine = await waitForVaultEngine();
    const meta = engine?.getWalletMeta?.() || {};
    return {
      cashCents: Number(engine?.getBalance?.() || 0),
      balanceCents: Number(engine?.getBalance?.() || 0),
      bonusCents: Number(meta.bonusCents || 0),
      rolloverTargetCents: Number(meta.rolloverTargetCents || 0),
      rolloverProgressCents: Number(meta.rolloverProgressCents || 0)
    };
  }

  async function uploadProof(file) {
    const user = auth?.currentUser;
    if (!user || !storage) {
      throw new Error("Auth or storage unavailable.");
    }
    if (!file || !file.type?.startsWith("image/")) {
      throw new Error("Valid image proof required.");
    }

    const safeName = String(file.name || "proof")
      .replace(/[^a-z0-9._-]/gi, "_")
      .slice(0, 80);
    const storagePath = `uploads/${user.uid}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  }

  async function createDepositRequest(payload) {
    const engine = await waitForVaultEngine();
    if (!engine?.createDepositRequest) {
      throw new Error("Deposit request bridge unavailable.");
    }
    return engine.createDepositRequest(payload);
  }

  async function createWithdrawalRequest(payload) {
    const engine = await waitForVaultEngine();
    if (!engine?.createWithdrawalRequest) {
      throw new Error("Withdrawal request bridge unavailable.");
    }

    const payid = String(payload?.payout?.payid || "").trim();
    const name = String(payload?.payout?.name || "").trim();

    return engine.createWithdrawalRequest({
      amountCents: Number(payload?.amountCents || 0),
      payoutDetails: {
        payoutDestination: payid,
        payoutDestinationConfirm: payid,
        accountName: name,
        accountNameConfirm: name,
        method: "payid_or_bank"
      }
    });
  }

  async function getHistory() {
    const engine = await waitForVaultEngine();
    const entries = Array.isArray(engine?.getLedger?.()) ? engine.getLedger() : [];
    return entries.slice(0, 60).map((entry) => ({
      type: String(entry.type || ""),
      amountCents: Number.isFinite(Number(entry.amountCents))
        ? Number(entry.amountCents)
        : (
            ["bet", "withdrawal_request", "withdrawal_paid", "debit", "withdraw"].includes(
              String(entry.type || "")
            )
              ? -Math.abs(Number(entry.amount || 0))
              : Math.abs(Number(entry.amount || 0))
          ),
      createdAt: Number(entry.ts || Date.now()),
      status: String(entry.status || ""),
      meta: entry.meta || null
    }));
  }

  window.vvWallet = {
    getSnapshot,
    getBalances: getSnapshot,
    uploadProof,
    createDepositRequest,
    createWithdrawalRequest,
    getHistory
  };
})();
