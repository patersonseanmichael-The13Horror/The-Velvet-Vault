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
  const adminCredit = httpsCallable(fx, 'adminCredit');
  const adminDebit = httpsCallable(fx, 'adminDebit');
  const adminSetBalance = httpsCallable(fx, 'adminSetBalance');
  const adminFreeze = httpsCallable(fx, 'adminFreeze');
  const adminGetUserLedger = httpsCallable(fx, 'adminGetUserLedger');
  const adminSentryEvaluateUser = httpsCallable(fx, 'adminSentryEvaluateUser');
  const adminSentryListFlagged = httpsCallable(fx, 'adminSentryListFlagged');
  const adminDepositAssist = httpsCallable(fx, 'adminDepositAssist');
  const adminWithdrawAssist = httpsCallable(fx, 'adminWithdrawAssist');


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


  // ── HTML escape (XSS prevention) ──────────────────────────
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderEmpty(target, text) {
    if (!target) return;
    target.innerHTML = `<div class="vvAdminEmpty">${text}</div>`;
  }

  function depositMeta(entry) {
    if (entry.proofImageUrl) {
      const safeUrl = esc(entry.proofImageUrl).replace(/^javascript:/i, '');
      return '<a class="vvAdminLink" href="' + safeUrl + '" target="_blank" rel="noreferrer noopener">View Proof</a>';
    }
    return '<span class="vvAdminMuted">No proof URL</span>';
  }

  function withdrawalMeta(entry) {
    const payout = entry.payoutDetails || {};
    return '<div class="vvAdminMetaLine">Method: ' + esc(payout.method || 'payid') + '</div>' +
      '<div class="vvAdminMetaLine">Destination: ' + esc(payout.payoutDestination || '-') + '</div>' +
      '<div class="vvAdminMetaLine">Name: ' + esc(payout.accountName || '-') + '</div>';
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
              <div class="vvAdminUid">${esc(entry.uid || "unknown")}</div>
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


  // ── Tab switching ──────────────────────────────────────────
  const tabs = document.querySelectorAll('.vvAdminTab');
  const panels = document.querySelectorAll('.vvAdminTabPanel');
  function showTab(tabName) {
    tabs.forEach(t => {
      const active = t.dataset.tab === tabName;
      t.classList.toggle('vvAdminTabActive', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(p => {
      p.hidden = p.id !== 'tab-' + tabName;
    });
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  // ── Manual Ops ─────────────────────────────────────────────
  const manualUidEl = document.getElementById('manualUid');
  const manualAmountEl = document.getElementById('manualAmount');
  const manualReasonEl = document.getElementById('manualReason');
  const manualNewBalanceEl = document.getElementById('manualNewBalance');
  const manualOpResult = document.getElementById('manualOpResult');

  function showManualResult(msg, isError) {
    manualOpResult.textContent = msg;
    manualOpResult.style.color = isError ? '#ff6b6b' : '#7fff7f';
  }

  async function manualOp(fn, payload) {
    try {
      const res = await fn(payload);
      showManualResult('OK: ' + JSON.stringify(res?.data ?? {}), false);
    } catch (err) {
      showManualResult('Error: ' + String(err?.message || err), true);
    }
  }

  document.getElementById('manualCreditBtn')?.addEventListener('click', () => {
    const uid = manualUidEl?.value?.trim();
    const amount = Number(manualAmountEl?.value);
    const reason = manualReasonEl?.value?.trim() || 'admin_credit';
    void manualOp(adminCredit, { uid, amount, reason });
  });

  document.getElementById('manualDebitBtn')?.addEventListener('click', () => {
    const uid = manualUidEl?.value?.trim();
    const amount = Number(manualAmountEl?.value);
    const reason = manualReasonEl?.value?.trim() || 'admin_debit';
    void manualOp(adminDebit, { uid, amount, reason });
  });

  document.getElementById('manualSetBalBtn')?.addEventListener('click', () => {
    const uid = manualUidEl?.value?.trim();
    const newBalance = Number(manualNewBalanceEl?.value);
    const reason = manualReasonEl?.value?.trim() || 'admin_set_balance';
    void manualOp(adminSetBalance, { uid, newBalance, reason });
  });

  document.getElementById('manualFreezeBtn')?.addEventListener('click', () => {
    const uid = manualUidEl?.value?.trim();
    const reason = manualReasonEl?.value?.trim() || 'admin_freeze';
    void manualOp(adminFreeze, { uid, frozen: true, reason });
  });

  document.getElementById('manualUnfreezeBtn')?.addEventListener('click', () => {
    const uid = manualUidEl?.value?.trim();
    const reason = manualReasonEl?.value?.trim() || 'admin_unfreeze';
    void manualOp(adminFreeze, { uid, frozen: false, reason });
  });

  // ── Sentry ─────────────────────────────────────────────────
  const sentryUidEl = document.getElementById('sentryUid');
  const sentryResult = document.getElementById('sentryResult');
  const sentryFlaggedList = document.getElementById('sentryFlaggedList');

  document.getElementById('sentryEvalBtn')?.addEventListener('click', async () => {
    const uid = sentryUidEl?.value?.trim();
    if (sentryResult) sentryResult.textContent = 'Evaluating...';
    try {
      const res = await adminSentryEvaluateUser({ uid });
      if (sentryResult) sentryResult.innerHTML = '<pre>' + JSON.stringify(res?.data ?? {}, null, 2) + '</pre>';
    } catch (err) {
      if (sentryResult) sentryResult.textContent = 'Error: ' + String(err?.message || err);
    }
  });

  document.getElementById('sentryListBtn')?.addEventListener('click', async () => {
    if (sentryFlaggedList) sentryFlaggedList.textContent = 'Loading...';
    try {
      const res = await adminSentryListFlagged({ limit: 50 });
      const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];
        if (sentryFlaggedList) sentryFlaggedList.innerHTML = '<div class="vvAdminEmpty">No flagged users.</div>';
        return;
      }
      if (sentryFlaggedList) sentryFlaggedList.innerHTML = entries.map(e =>
        '<article class="vvAdminCard"><div class="vvAdminUid">' + esc(e.uid || '?') + '</div>' +
        '<div class="vvAdminMeta">Score: ' + esc(String(e.riskScore ?? '?')) + ' | ' + esc(e.reason || '') + '</div></article>'
      ).join('');
    } catch (err) {
      if (sentryFlaggedList) sentryFlaggedList.textContent = 'Error: ' + String(err?.message || err);
    }
  });

  // ── Ledger ─────────────────────────────────────────────────
  const ledgerUidEl = document.getElementById('ledgerUid');
  const ledgerLimitEl = document.getElementById('ledgerLimit');
  const ledgerResult = document.getElementById('ledgerResult');

  document.getElementById('ledgerLoadBtn')?.addEventListener('click', async () => {
    const uid = ledgerUidEl?.value?.trim();
    const limit = Number(ledgerLimitEl?.value) || 50;
    if (ledgerResult) ledgerResult.textContent = 'Loading...';
    try {
      const res = await adminGetUserLedger({ uid, limit });
      const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];
        ledgerResult.innerHTML = '<div class="vvAdminEmpty">No ledger entries.</div>';
        return;
      }
      ledgerResult.innerHTML = entries.map(e =>
        '<article class="vvAdminCard">' +
        '<div class="vvAdminRow"><span class="vvAdminUid">' + esc(e.type || '?') + '</span>' +
        '<span class="vvAdminAmount">' + formatAUD(e.amountCents ?? e.amount ?? 0) + '</span></div>' +
        '<div class="vvAdminTime">' + formatTimestamp(e.ts ?? e.createdAt) + '</div>' +
        (e.reason ? '<div class="vvAdminMeta">' + esc(e.reason) + '</div>' : '') +
        '</article>'
      ).join('');
    } catch (err) {
      if (ledgerResult) ledgerResult.textContent = 'Error: ' + String(err?.message || err);
    }
  });

  // ── Assist ─────────────────────────────────────────────────
  document.getElementById('depositAssistBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('depositAssistId')?.value?.trim();
    const resultEl = document.getElementById('depositAssistResult');
    if (resultEl) resultEl.textContent = 'Running...';
    try {
      const res = await adminDepositAssist({ id });
      if (resultEl) resultEl.innerHTML = '<pre>' + JSON.stringify(res?.data ?? {}, null, 2) + '</pre>';
    } catch (err) {
      if (resultEl) resultEl.textContent = 'Error: ' + String(err?.message || err);
    }
  });

  document.getElementById('withdrawAssistBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('withdrawAssistId')?.value?.trim();
    const resultEl = document.getElementById('withdrawAssistResult');
    if (resultEl) resultEl.textContent = 'Running...';
    try {
      const res = await adminWithdrawAssist({ id });
      if (resultEl) resultEl.innerHTML = '<pre>' + JSON.stringify(res?.data ?? {}, null, 2) + '</pre>';
    } catch (err) {
      if (resultEl) resultEl.textContent = 'Error: ' + String(err?.message || err);
    }
  });

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
