import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

(function initAdminPage() {
  const auth = window.vvAuth || null;
  const app = window.vvApp || null;
  const fx = app ? getFunctions(app) : null;
  const $ = (id) => document.getElementById(id);

  const adminDepositList = $("adminDepositList");
  const adminWithdrawalList = $("adminWithdrawalList");
  const refreshDepositsBtn = $("refreshDepositsBtn");
  const refreshWithdrawalsBtn = $("refreshWithdrawalsBtn");
  const logoutBtn = $("adminLogoutBtn");

  if (!auth || !fx) {
    window.location.href = "slots.html";
    return;
  }

  const adminListPendingDepositRequests = httpsCallable(fx, "adminListPendingDepositRequests");
  const adminListPendingWithdrawalRequests = httpsCallable(
    fx,
    "adminListPendingWithdrawalRequests"
  );
  const adminApproveDepositRequest = httpsCallable(fx, "adminApproveDepositRequest");
  const adminApproveWithdrawalRequest = httpsCallable(fx, "adminApproveWithdrawalRequest");
  const adminRejectDepositRequest = httpsCallable(fx, "adminRejectDepositRequest");
  const adminRejectWithdrawalRequest = httpsCallable(fx, "adminRejectWithdrawalRequest");

  function formatAUD(cents) {
    return `$${(Number(cents || 0) / 100).toFixed(2)}`;
  }

  function formatTimestamp(value) {
    const parsed = Number(value || 0);
    return new Date(parsed || Date.now()).toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function renderEmpty(target, text) {
    if (!target) return;
    target.innerHTML = `<div class="vvAdminEmpty">${text}</div>`;
  }

  function depositMeta(entry) {
    return entry.proofImageUrl
      ? `<a class="vvAdminLink" href="${entry.proofImageUrl}" target="_blank" rel="noreferrer">Proof</a>`
      : `<span class="vvAdminMuted">No proof URL</span>`;
  }

  function withdrawalMeta(entry) {
    const payout = entry.payoutDetails || {};
    return `<div class="vvAdminMetaLine">Method: ${String(payout.method || "payid")}</div>
      <div class="vvAdminMetaLine">Destination: ${String(payout.payoutDestination || "-")}</div>
      <div class="vvAdminMetaLine">Name: ${String(payout.accountName || "-")}</div>`;
  }

  function renderRequests(target, kind, entries) {
    if (!target) return;
    if (!entries.length) {
      renderEmpty(target, `No pending ${kind}.`);
      return;
    }

    target.innerHTML = entries
      .map((entry) => {
        const meta = kind === "deposits" ? depositMeta(entry) : withdrawalMeta(entry);
        return `<article class="vvAdminCard" data-kind="${kind}" data-id="${entry.id}">
          <div class="vvAdminRow">
            <div>
              <div class="vvAdminUid">${String(entry.uid || "unknown")}</div>
              <div class="vvAdminTime">${formatTimestamp(entry.createdAt)}</div>
            </div>
            <div class="vvAdminAmount">${formatAUD(entry.amountCents)}</div>
          </div>
          <div class="vvAdminMeta">${meta}</div>
          <div class="vvAdminActions">
            <button class="vvPrimary" type="button" data-action="approve">Approve</button>
            <button class="vvSecondary" type="button" data-action="reject">Reject</button>
          </div>
        </article>`;
      })
      .join("");
  }

  async function loadDeposits() {
    renderEmpty(adminDepositList, "Loading deposits...");
    const res = await adminListPendingDepositRequests({ limit: 50 });
    const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];
    renderRequests(adminDepositList, "deposits", entries);
  }

  async function loadWithdrawals() {
    renderEmpty(adminWithdrawalList, "Loading withdrawals...");
    const res = await adminListPendingWithdrawalRequests({ limit: 50 });
    const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];
    renderRequests(adminWithdrawalList, "withdrawals", entries);
  }

  async function refreshAll() {
    await Promise.all([loadDeposits(), loadWithdrawals()]);
  }

  async function requireAdminUser(user) {
    if (!user) {
      window.location.href = "login.html";
      return false;
    }

    const token = await user.getIdTokenResult(true);
    if (token?.claims?.admin !== true) {
      window.location.href = "slots.html";
      return false;
    }
    return true;
  }

  async function handleAction(button) {
    const card = button.closest(".vvAdminCard");
    if (!card) return;

    const id = String(card.dataset.id || "");
    const kind = String(card.dataset.kind || "");
    const action = String(button.dataset.action || "");
    if (!id || !kind || !action) return;

    button.disabled = true;
    try {
      if (kind === "deposits" && action === "approve") {
        await adminApproveDepositRequest({ id });
      } else if (kind === "deposits" && action === "reject") {
        await adminRejectDepositRequest({ id, reason: "admin_rejected" });
      } else if (kind === "withdrawals" && action === "approve") {
        await adminApproveWithdrawalRequest({ id });
      } else if (kind === "withdrawals" && action === "reject") {
        await adminRejectWithdrawalRequest({ id, reason: "admin_rejected" });
      }
      await refreshAll();
    } catch (error) {
      card.insertAdjacentHTML(
        "beforeend",
        `<div class="vvAdminError">${String(error?.message || "Action failed.")}</div>`
      );
      button.disabled = false;
    }
  }

  adminDepositList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) {
      void handleAction(button);
    }
  });

  adminWithdrawalList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) {
      void handleAction(button);
    }
  });

  refreshDepositsBtn?.addEventListener("click", () => {
    void loadDeposits();
  });
  refreshWithdrawalsBtn?.addEventListener("click", () => {
    void loadWithdrawals();
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await window.vvAuth?.signOut?.();
    } catch {}
    window.location.href = "index.html";
  });

  onAuthStateChanged(auth, (user) => {
    void (async () => {
      if (!(await requireAdminUser(user))) return;
      await refreshAll();
    })();
  });
})();
