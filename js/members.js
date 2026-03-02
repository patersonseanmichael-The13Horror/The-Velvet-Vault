/* Members page controller (UI only; does not change wallet authority) */

(function(){
  const $ = (id) => document.getElementById(id);

  function formatAUD(cents){
    const n = (cents || 0) / 100;
    return `$${n.toFixed(2)}`;
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

  const historyList = $("vvHistoryList");

  function showModal(){
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("vvModalOpen");
    showView("home");
  }
  function hideModal(){
    modal.setAttribute("aria-hidden","true");
    document.body.classList.remove("vvModalOpen");
  }
  function showView(which){
    viewHome.hidden = which !== "home";
    viewDeposit.hidden = which !== "deposit";
    viewWithdraw.hidden = which !== "withdraw";
    viewHistory.hidden = which !== "history";
  }

  function makeId(){
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "VV-";
    for(let i=0;i<6;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  }
  function randBetween(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

  function buildTicker(){
    const track = $("vvTickerTrack");
    if(!track) return;

    const items = [];
    for(let i=0;i<10;i++){
      const isDeposit = Math.random() < 0.55;
      const id = makeId();
      const amount = isDeposit
        ? randBetween(10100, 250000)
        : randBetween(250001, 2500000);
      items.push({ type: isDeposit ? "Deposit" : "Withdrawal", id, cents: amount });
    }

    function renderItem(x){
      const amt = formatAUD(x.cents);
      const cls = x.type === "Deposit" ? "vvTickDeposit" : "vvTickWithdraw";
      return `<span class="vvTickItem ${cls}">${x.type} • ${x.id} • <strong>${amt}</strong></span>`;
    }

    const html = items.map(renderItem).join("") + items.map(renderItem).join("");
    track.innerHTML = html;
  }

  async function refreshWalletUI(){
    try{
      const snap = await (window.vvWallet?.getSnapshot?.() ?? window.vvWallet?.getBalances?.());

      const cashCents = snap?.cashCents ?? snap?.balanceCents ?? 0;
      const bonusCents = snap?.bonusCents ?? 0;
      const target = snap?.rolloverTargetCents ?? 0;
      const prog = snap?.rolloverProgressCents ?? 0;

      miniBal.textContent = formatAUD(cashCents);
      cashBal.textContent = formatAUD(cashCents);
      bonusBal.textContent = formatAUD(bonusCents);

      const pct = target > 0 ? Math.min(100, Math.floor((prog/target)*100)) : 0;
      rolloverPct.textContent = `${pct}%`;
      rolloverDetail.textContent = `${formatAUD(prog)} / ${formatAUD(target)}`;

      wCash.textContent = formatAUD(cashCents);
      wBonus.textContent = formatAUD(bonusCents);
      wRollPct.textContent = `${pct}%`;
      wRollBar.style.width = `${pct}%`;
      wRollNums.textContent = `${formatAUD(prog)} / ${formatAUD(target)}`;
    }catch(e){
    }
  }

  let selectedDepositCents = 0;
  function setDepositSelected(cents){
    selectedDepositCents = cents;
    btnSubmitDeposit.disabled = !selectedDepositCents;
  }

  document.addEventListener("click", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("vvChip") && t.dataset.deposit){
      setDepositSelected(parseInt(t.dataset.deposit,10));
      document.querySelectorAll(".vvChip").forEach((b)=>b.classList.remove("isSelected"));
      t.classList.add("isSelected");
    }
  });

  depositProof?.addEventListener("change", ()=>{
    const f = depositProof.files && depositProof.files[0];
    depositProofStatus.textContent = f ? `Selected: ${f.name}` : "No file selected";
    btnSubmitDeposit.disabled = !(selectedDepositCents && f);
  });

  btnCopyPayId?.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(payIdValue.textContent.trim());
      btnCopyPayId.textContent = "Copied";
      setTimeout(()=>btnCopyPayId.textContent="Copy", 900);
    }catch{}
  });

  btnSubmitDeposit?.addEventListener("click", async ()=>{
    depositMsg.textContent = "";
    const f = depositProof.files && depositProof.files[0];
    if(!selectedDepositCents || !f) return;

    const proofUrl = await (window.vvWallet?.uploadProof?.(f) ?? Promise.resolve(""));

    try{
      await window.vvWallet?.createDepositRequest?.({
        amountCents: selectedDepositCents,
        proofImageUrl: proofUrl
      });
      depositMsg.textContent = "Deposit request submitted.";
      setDepositSelected(0);
      depositProof.value = "";
      depositProofStatus.textContent = "No file selected";
      btnSubmitDeposit.disabled = true;
    }catch(err){
      depositMsg.textContent = "Deposit request failed. Please try again.";
    }
  });

  function parseAmountToCents(s){
    const cleaned = (s||"").replace(/[^0-9.]/g,"");
    const n = Number(cleaned);
    if(!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }

  function validateWithdraw(){
    const cents = parseAmountToCents(withdrawAmt.value);
    const p1 = (withdrawPay1.value||"").trim();
    const p2 = (withdrawPay2.value||"").trim();
    const n1 = (withdrawName1.value||"").trim();
    const n2 = (withdrawName2.value||"").trim();
    btnSubmitWithdraw.disabled = !(cents > 0 && p1 && p2 && n1 && n2 && p1 === p2 && n1 === n2);
  }

  [withdrawAmt, withdrawPay1, withdrawPay2, withdrawName1, withdrawName2].forEach((el)=>{
    el && el.addEventListener("input", validateWithdraw);
  });

  btnSubmitWithdraw?.addEventListener("click", async ()=>{
    withdrawMsg.textContent = "";
    const amountCents = parseAmountToCents(withdrawAmt.value);
    const payid = (withdrawPay1.value||"").trim();
    const name = (withdrawName1.value||"").trim();
    if(!amountCents || !payid || !name) return;

    try{
      await window.vvWallet?.createWithdrawalRequest?.({
        amountCents,
        payout: { payid, name }
      });
      withdrawMsg.textContent = "Withdrawal request submitted.";
      withdrawAmt.value = "";
      withdrawPay1.value = "";
      withdrawPay2.value = "";
      withdrawName1.value = "";
      withdrawName2.value = "";
      validateWithdraw();
    }catch(err){
      withdrawMsg.textContent = "Withdrawal request failed. Please try again.";
    }
  });

  async function loadHistory(){
    historyList.innerHTML = "";
    try{
      const rows = await window.vvWallet?.getHistory?.();
      const safe = Array.isArray(rows) ? rows : [];
      if(!safe.length){
        historyList.innerHTML = `<div class="vvHistoryEmpty">No history yet.</div>`;
        return;
      }
      historyList.innerHTML = safe.map((r)=>{
        const amt = formatAUD(r.amountCents||0);
        const type = (r.type||"").toUpperCase();
        const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
        const status = r.status ? ` • ${r.status}` : "";
        return `<div class="vvHistoryRow">
          <div class="vvHistoryLeft">
            <div class="vvHistoryType">${type}</div>
            <div class="vvHistoryTime">${when}${status}</div>
          </div>
          <div class="vvHistoryAmt">${amt}</div>
        </div>`;
      }).join("");
    }catch{
      historyList.innerHTML = `<div class="vvHistoryEmpty">Unable to load history.</div>`;
    }
  }

  btnOpenWallet?.addEventListener("click", showModal);
  btnOpenWallet2?.addEventListener("click", showModal);
  btnCloseWallet?.addEventListener("click", hideModal);

  modal?.addEventListener("click", (e)=>{
    const t = e.target;
    if(t && t.dataset && t.dataset.close === "1") hideModal();
  });

  btnGoDeposit?.addEventListener("click", ()=>showView("deposit"));
  btnGoWithdraw?.addEventListener("click", ()=>showView("withdraw"));
  btnGoHistory?.addEventListener("click", async ()=>{ showView("history"); await loadHistory(); });

  qaDeposit?.addEventListener("click", ()=>{ showModal(); showView("deposit"); });
  qaWithdraw?.addEventListener("click", ()=>{ showModal(); showView("withdraw"); });
  qaHistory?.addEventListener("click", async ()=>{ showModal(); showView("history"); await loadHistory(); });

  btnBackFromDeposit?.addEventListener("click", ()=>showView("home"));
  btnBackFromWithdraw?.addEventListener("click", ()=>showView("home"));
  btnBackFromHistory?.addEventListener("click", ()=>showView("home"));

  buildTicker();
  setInterval(refreshWalletUI, 2000);
  refreshWalletUI();
})();
