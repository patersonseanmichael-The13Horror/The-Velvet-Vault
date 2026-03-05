import {
  collection,
  getDocs,
  getFirestore,
  limit as queryLimit,
  orderBy,
  query,
  startAfter
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-functions.js";

(function initMembersPage() {
  const $ = (id) => document.getElementById(id);
  const auth = window.vvAuth || null;
  const app = window.vvApp || null;
  const db = app ? getFirestore(app) : null;
  const fx = app ? getFunctions(app) : null;
  const vvGetLiveFeed = fx ? httpsCallable(fx, "vvGetLiveFeed") : null;

  function formatAUD(cents) {
    const n = Number(cents || 0) / 100;
    return `$${n.toFixed(2)}`;
  }

  function timestampToMillis(value) {
    if (value && typeof value.toMillis === "function") {
      return value.toMillis();
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function formatTimestamp(value) {
    return new Date(timestampToMillis(value)).toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function normalizeType(type) {
    const map = {
      deposit: "Deposit",
      bet: "Bet",
      win: "Win",
      withdrawal_request: "Withdrawal Request",
      withdrawal_paid: "Withdrawal",
      bonus_credit: "Bonus",
      rebate_credit: "Rebate",
      cancel: "Cancel"
    };
    return map[String(type || "").toLowerCase()] || "Entry";
  }

  function anonymizeUid(uid, salt = 0) {
    const clean = String(uid || "VV0000").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const tail = clean.slice(-4).padStart(4, "X");
    const mix = `${clean}${salt}`;
    let total = 0;
    for (let i = 0; i < mix.length; i += 1) total += mix.charCodeAt(i);
    const suffix = String((total % 90) + 10).padStart(2, "0");
    return `VV-${tail}${suffix}`;
  }

  async function ensureUser() {
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser;
    if (typeof auth.authStateReady === "function") {
      try {
        await auth.authStateReady();
      } catch {}
    }
    return auth.currentUser || null;
  }

  const modal = $("vvWalletModal");
  const btnOpenWallet = $("btnOpenWallet");
  const btnOpenWallet2 = $("btnOpenWallet2");
  const btnCloseWallet = $("btnCloseWallet");
  const logoutBtn = $("btnLogout");

  const viewHome = $("vvWalletViewHome");
  const viewDeposit = $("vvWalletViewDeposit");
  const viewWithdraw = $("vvWalletViewWithdraw");
  const viewHistory = $("vvWalletViewHistory");

  const btnGoDeposit = $("btnGoDeposit");
  const btnGoWithdraw = $("btnGoWithdraw");
  const btnGoHistory = $("btnGoHistory");
  const qaDeposit = $("qaDeposit");
  const qaWithdraw = $("qaWithdraw");
  const qaHistory = $("qaHistory");

  const btnBackFromDeposit = $("btnBackFromDeposit");
  const btnBackFromWithdraw = $("btnBackFromWithdraw");
  const btnBackFromHistory = $("btnBackFromHistory");

  const miniBal = $("vvMiniBalanceValue");
  const cashBal = $("vvCashBalance");
  const bonusBal = $("vvBonusBalance");
  const rolloverPct = $("vvRollover");
  const rolloverDetail = $("vvRolloverDetail");

  const wCash = $("vvWalletCash");
  const wBonus = $("vvWalletBonus");
  const wRollPct = $("vvWalletRolloverPct");
  const wRollBar = $("vvWalletRolloverBar");
  const wRollNums = $("vvWalletRolloverNums");

  const payIdValue = $("vvPayIdValue");
  const btnCopyPayId = $("btnCopyPayId");

  const depositProof = $("vvDepositProof");
  const depositProofStatus = $("vvDepositProofStatus");
  const btnSubmitDeposit = $("btnSubmitDeposit");
  const depositMsg = $("vvDepositMsg");

  const withdrawAmt = $("vvWithdrawAmount");
  const withdrawPay1 = $("vvWithdrawPayid1");
  const withdrawPay2 = $("vvWithdrawPayid2");
  const withdrawName1 = $("vvWithdrawName1");
  const withdrawName2 = $("vvWithdrawName2");
  const btnSubmitWithdraw = $("btnSubmitWithdraw");
  const withdrawMsg = $("vvWithdrawMsg");

  const historyList = $("wallet-history-list");
  const historyMoreBtn = $("wallet-history-more");
  const liveFeed = $("live-feed");

  let selectedDepositCents = 0;
  let historyCursor = null;
  let historyLoading = false;
  let historyHasMore = false;
  let walletSnapshotCache = null;
  let walletSnapshotAt = 0;

  function showModal() {
    modal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("vvModalOpen");
    showView("home");
  }

  function hideModal() {
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("vvModalOpen");
  }

  function showView(which) {
    if (viewHome) viewHome.hidden = which !== "home";
    if (viewDeposit) viewDeposit.hidden = which !== "deposit";
    if (viewWithdraw) viewWithdraw.hidden = which !== "withdraw";
    if (viewHistory) viewHistory.hidden = which !== "history";
  }

  async function logClientEvent(type, message, meta = null) {
    try {
      await window.VaultEngine?.logClientEvent?.({ type, message, meta });
    } catch {}
  }

  function invalidateWalletCache() {
    walletSnapshotCache = null;
    walletSnapshotAt = 0;
  }

  async function readWalletSnapshot(force = false) {
    const now = Date.now();
    if (!force && walletSnapshotCache && now - walletSnapshotAt < 5000) {
      return walletSnapshotCache;
    }

    const snapshot = await (window.vvWallet?.getSnapshot?.() ?? window.vvWallet?.getBalances?.());
    walletSnapshotCache = snapshot || null;
    walletSnapshotAt = now;
    return snapshot;
  }

  async function refreshWalletUI(force = false) {
    try {
      const snap = await readWalletSnapshot(force);
      const cashCents = snap?.cashCents ?? snap?.balanceCents ?? 0;
      const bonusCents = snap?.bonusCents ?? 0;
      const target = snap?.rolloverTargetCents ?? 0;
      const prog = snap?.rolloverProgressCents ?? 0;
      const pct = target > 0 ? Math.min(100, Math.floor((prog / target) * 100)) : 0;

      if (miniBal) miniBal.textContent = formatAUD(cashCents);
      if (cashBal) cashBal.textContent = formatAUD(cashCents);
      if (bonusBal) bonusBal.textContent = formatAUD(bonusCents);
      if (rolloverPct) rolloverPct.textContent = `${pct}%`;
      if (rolloverDetail) rolloverDetail.textContent = `${formatAUD(prog)} / ${formatAUD(target)}`;

      if (wCash) wCash.textContent = formatAUD(cashCents);
      if (wBonus) wBonus.textContent = formatAUD(bonusCents);
      if (wRollPct) wRollPct.textContent = `${pct}%`;
      if (wRollBar) wRollBar.style.width = `${pct}%`;
      if (wRollNums) wRollNums.textContent = `${formatAUD(prog)} / ${formatAUD(target)}`;
    } catch {}
  }

  function hasDepositProof() {
    return Boolean(depositProof?.files && depositProof.files[0]);
  }

  function setDepositSelected(cents) {
    selectedDepositCents = cents;
    if (btnSubmitDeposit) {
      btnSubmitDeposit.disabled = !(selectedDepositCents && hasDepositProof());
    }
  }

  function parseAmountToCents(value) {
    const cleaned = String(value || "").replace(/[^0-9.]/g, "");
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }

  function validateWithdraw() {
    const cents = parseAmountToCents(withdrawAmt?.value);
    const p1 = String(withdrawPay1?.value || "").trim();
    const p2 = String(withdrawPay2?.value || "").trim();
    const n1 = String(withdrawName1?.value || "").trim();
    const n2 = String(withdrawName2?.value || "").trim();
    if (btnSubmitWithdraw) {
      btnSubmitWithdraw.disabled = !(cents > 0 && p1 && p2 && n1 && n2 && p1 === p2 && n1 === n2);
    }
  }

  function renderHistoryRows(rows, append = false) {
    if (!historyList) return;
    if (!append) historyList.innerHTML = "";
    if (!rows.length && !append) {
      historyList.innerHTML = `<div class="vvHistoryEmpty">No history yet.</div>`;
      return;
    }

    const html = rows
      .map((row) => {
        const amountCents = Number(row.amountCents ?? 0);
        const sign = amountCents > 0 ? "+" : amountCents < 0 ? "-" : "";
        const status = row.status ? ` • ${String(row.status)}` : "";
        return `<div class="vvHistoryRow">
          <div class="vvHistoryLeft">
            <div class="vvHistoryType">${normalizeType(row.type)}</div>
            <div class="vvHistoryTime">${formatTimestamp(row.createdAt)}${status}</div>
          </div>
          <div class="vvHistoryAmt ${amountCents < 0 ? "isNegative" : ""}">${sign}${formatAUD(Math.abs(amountCents))}</div>
        </div>`;
      })
      .join("");

    historyList.insertAdjacentHTML("beforeend", html);
  }

  async function loadWalletHistory(limitCount = 50, startAfterDoc = null) {
    if (!db || historyLoading) return;

    const user = await ensureUser();
    if (!user?.uid) {
      renderHistoryRows([], false);
      if (historyMoreBtn) historyMoreBtn.hidden = true;
      return;
    }

    historyLoading = true;
    if (historyMoreBtn) {
      historyMoreBtn.disabled = true;
      historyMoreBtn.textContent = "Loading...";
    }

    try {
      const baseQuery = [
        collection(db, "users", user.uid, "ledger"),
        orderBy("createdAt", "desc"),
        queryLimit(limitCount)
      ];
      const historyQuery = startAfterDoc
        ? query(baseQuery[0], baseQuery[1], startAfter(startAfterDoc), baseQuery[2])
        : query(baseQuery[0], baseQuery[1], baseQuery[2]);
      const snap = await getDocs(historyQuery);

      historyCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : historyCursor;
      historyHasMore = snap.docs.length === limitCount;

      const rows = snap.docs.map((docSnap) => {
        const row = docSnap.data();
        return {
          id: docSnap.id,
          type: String(row.type || ""),
          amountCents: Number(row.amountCents ?? 0),
          createdAt: row.createdAt ?? row.ts ?? Date.now(),
          status: String(row.status || "")
        };
      });

      renderHistoryRows(rows, Boolean(startAfterDoc));
      if (historyMoreBtn) {
        historyMoreBtn.hidden = !historyHasMore;
      }
    } catch (error) {
      if (historyList && !startAfterDoc) {
        historyList.innerHTML = `<div class="vvHistoryEmpty">Unable to load history.</div>`;
      }
      await logClientEvent("withdrawal_error", error?.message || "Wallet history load failed", {
        source: "wallet_history"
      });
      if (historyMoreBtn) historyMoreBtn.hidden = true;
    } finally {
      historyLoading = false;
      if (historyMoreBtn) {
        historyMoreBtn.disabled = false;
        historyMoreBtn.textContent = "Load More";
      }
    }
  }

  async function loadLiveFeed() {
    if (!liveFeed || !vvGetLiveFeed) return;
    const user = await ensureUser();
    if (!user) return;

    try {
      const res = await vvGetLiveFeed({ limit: 20 });
      const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];
      if (!entries.length) {
        liveFeed.innerHTML = `<span class="vvTickItem">Feed warming up.</span>`;
        return;
      }

      const mapped = entries.map((entry, index) => {
        const type = String(entry.type || "") === "withdrawal_paid" ? "Withdrawal" : "Deposit";
        const amount = formatAUD(Number(entry.amountCents || 0));
        const tag = anonymizeUid(entry.uid, timestampToMillis(entry.createdAt) + index);
        const cls = type === "Deposit" ? "vvTickDeposit" : "vvTickWithdraw";
        return `<span class="vvTickItem ${cls}">${tag} • ${type} • <strong>${amount}</strong></span>`;
      });
      liveFeed.innerHTML = [...mapped, ...mapped].join("");
    } catch {
      liveFeed.innerHTML = `<span class="vvTickItem">Live feed unavailable.</span>`;
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.classList?.contains("vvChip") && target.dataset.deposit) {
      setDepositSelected(Number.parseInt(target.dataset.deposit, 10));
      document.querySelectorAll(".vvChip").forEach((chip) => chip.classList.remove("isSelected"));
      target.classList.add("isSelected");
    }
  });

  depositProof?.addEventListener("change", () => {
    const file = depositProof.files && depositProof.files[0];
    if (depositProofStatus) {
      depositProofStatus.textContent = file ? `Selected: ${file.name}` : "No file selected";
    }
    if (btnSubmitDeposit) btnSubmitDeposit.disabled = !(selectedDepositCents && file);
  });

  btnCopyPayId?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(payIdValue?.textContent || "").trim());
      btnCopyPayId.textContent = "Copied";
      setTimeout(() => {
        btnCopyPayId.textContent = "Copy";
      }, 900);
    } catch {}
  });

  btnSubmitDeposit?.addEventListener("click", async () => {
    if (!btnSubmitDeposit) return;
    btnSubmitDeposit.disabled = true;
    if (depositMsg) depositMsg.textContent = "";

    const file = depositProof?.files && depositProof.files[0];
    if (!selectedDepositCents || !file) {
      btnSubmitDeposit.disabled = !(selectedDepositCents && file);
      return;
    }

    try {
      const proofUrl = await (window.vvWallet?.uploadProof?.(file) ?? Promise.resolve(""));
      await window.vvWallet?.createDepositRequest?.({
        amountCents: selectedDepositCents,
        proofImageUrl: proofUrl
      });
      invalidateWalletCache();
      await refreshWalletUI(true);
      if (depositMsg) depositMsg.textContent = "Deposit request submitted.";
      setDepositSelected(0);
      if (depositProof) depositProof.value = "";
      if (depositProofStatus) depositProofStatus.textContent = "No file selected";
      document.querySelectorAll(".vvChip").forEach((chip) => chip.classList.remove("isSelected"));
    } catch (error) {
      if (depositMsg) depositMsg.textContent = "Deposit request failed. Please try again.";
      await logClientEvent("deposit_error", error?.message || "Deposit request failed", {
        amountCents: selectedDepositCents
      });
    } finally {
      btnSubmitDeposit.disabled = !(selectedDepositCents && hasDepositProof());
    }
  });

  [withdrawAmt, withdrawPay1, withdrawPay2, withdrawName1, withdrawName2].forEach((field) => {
    field?.addEventListener("input", validateWithdraw);
  });

  btnSubmitWithdraw?.addEventListener("click", async () => {
    if (!btnSubmitWithdraw) return;
    btnSubmitWithdraw.disabled = true;
    if (withdrawMsg) withdrawMsg.textContent = "";

    const amountCents = parseAmountToCents(withdrawAmt?.value);
    const payid = String(withdrawPay1?.value || "").trim();
    const name = String(withdrawName1?.value || "").trim();
    if (!amountCents || !payid || !name) {
      validateWithdraw();
      return;
    }

    try {
      await window.vvWallet?.createWithdrawalRequest?.({
        amountCents,
        payout: { payid, name }
      });
      invalidateWalletCache();
      await refreshWalletUI(true);
      if (withdrawMsg) withdrawMsg.textContent = "Withdrawal request submitted.";
      if (withdrawAmt) withdrawAmt.value = "";
      if (withdrawPay1) withdrawPay1.value = "";
      if (withdrawPay2) withdrawPay2.value = "";
      if (withdrawName1) withdrawName1.value = "";
      if (withdrawName2) withdrawName2.value = "";
    } catch (error) {
      if (withdrawMsg) withdrawMsg.textContent = "Withdrawal request failed. Please try again.";
      await logClientEvent("withdrawal_error", error?.message || "Withdrawal request failed", {
        amountCents
      });
    } finally {
      validateWithdraw();
    }
  });

  btnOpenWallet?.addEventListener("click", showModal);
  btnOpenWallet2?.addEventListener("click", showModal);
  btnCloseWallet?.addEventListener("click", hideModal);

  // ── Hamburger / Nav Drawer ────────────────────────────────
  const hamburger   = $('vvHamburger');
  const navDrawer   = $('vvNavDrawer');
  const navOverlay  = $('vvNavOverlay');
  const drawerClose = $('vvDrawerClose');
  let drawerOpen = false;

  function openDrawer() {
    drawerOpen = true;
    navDrawer?.classList.add('vv-open');
    navOverlay?.classList.add('vv-open');
    navDrawer?.setAttribute('aria-hidden', 'false');
    navOverlay?.setAttribute('aria-hidden', 'false');
    hamburger?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    drawerOpen = false;
    navDrawer?.classList.remove('vv-open');
    navOverlay?.classList.remove('vv-open');
    navDrawer?.setAttribute('aria-hidden', 'true');
    navOverlay?.setAttribute('aria-hidden', 'true');
    hamburger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger?.addEventListener('click', () => drawerOpen ? closeDrawer() : openDrawer());
  drawerClose?.addEventListener('click', closeDrawer);
  navOverlay?.addEventListener('click', closeDrawer);

  // Drawer nav items
  $('drawerWallet')?.addEventListener('click', () => { closeDrawer(); showModal(); });
  $('drawerLedger')?.addEventListener('click', () => { closeDrawer(); showModal(); showView('history'); historyCursor = null; void loadWalletHistory(); });
  $('drawerLogout')?.addEventListener('click', async () => {
    closeDrawer();
    try { await window.vvAuth?.signOut?.(); } catch {}
    window.location.href = 'index.html';
  });

  // Settings
  let audioOn = false;
  $('drawerAudioToggle')?.addEventListener('click', () => {
    const btn = $('drawerAudioToggle');
    if (btn) btn.textContent = audioOn ? 'Audio: On' : 'Audio: Off';
  });
  $('drawerFullscreen')?.addEventListener('click', () => {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    closeDrawer();
  });
  $('drawerChangePassword')?.addEventListener('click', () => {
    closeDrawer();
    const user = window.vvAuth?.currentUser;
    window.vvAuth?.sendPasswordResetEmail?.(user.email)
      .then(() => alert('Password reset email sent to ' + user.email))
      .catch((e) => alert('Error: ' + e.message));
  });

  // ESC closes drawer first, then modals
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (drawerOpen) { e.preventDefault(); closeDrawer(); return; }
    if (modal?.getAttribute('aria-hidden') === 'false') { e.preventDefault(); hideModal(); }
  });

  // ESC key closes wallet modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.getAttribute("aria-hidden") === "false") {
      e.preventDefault();
      hideModal();
    }
  });

  modal?.addEventListener("click", (event) => {
    const target = event.target;
    if (target?.dataset?.close === "1") {
      hideModal();
    }
  });

  btnGoDeposit?.addEventListener("click", () => showView("deposit"));
  btnGoWithdraw?.addEventListener("click", () => showView("withdraw"));
  btnGoHistory?.addEventListener("click", async () => {
    showView("history");
    historyCursor = null;
    await loadWalletHistory();
  });

  qaDeposit?.addEventListener("click", () => {
    showModal();
    showView("deposit");
  });
  qaWithdraw?.addEventListener("click", () => {
    showModal();
    showView("withdraw");
  });
  qaHistory?.addEventListener("click", async () => {
    showModal();
    showView("history");
    historyCursor = null;
    await loadWalletHistory();
  });

  btnBackFromDeposit?.addEventListener("click", () => showView("home"));
  btnBackFromWithdraw?.addEventListener("click", () => showView("home"));
  btnBackFromHistory?.addEventListener("click", () => showView("home"));

  historyMoreBtn?.addEventListener("click", async () => {
    if (!historyHasMore || !historyCursor) return;
    await loadWalletHistory(50, historyCursor);
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await window.vvAuth?.signOut?.();
    } catch {}
    window.location.href = "index.html";
  });

  void loadLiveFeed();
  setInterval(loadLiveFeed, 60_000);
  window.VaultEngine?.subscribe?.(() => {
    invalidateWalletCache();
    void refreshWalletUI(true);
  });
  window.VVMembers = {
    refreshWallet: () => {
      invalidateWalletCache();
      return refreshWalletUI(true);
    }
  };
  void refreshWalletUI(true);

  // ── Admin drawer link ──────────────────────────────────────
  (async () => {
    try {
      const user = window.vvAuth?.currentUser;
      if (user) {
        const token = await user.getIdTokenResult(false);
        if (token?.claims?.admin === true) {
          const adminItem = document.getElementById('drawerAdminItem');
          if (adminItem) adminItem.style.display = '';
        }
      }
    } catch {
      // Non-critical: admin link stays hidden
    }
  })();

})();
