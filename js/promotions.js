/* © 2026 Velvet Vault — Sean Michael Paterson. All rights reserved. */
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

(async function initPromotions() {
  // Wait for Firebase app to be ready
  await new Promise(resolve => {
    const check = () => window.__VV_FIREBASE_APP ? resolve() : setTimeout(check, 50);
    check();
  });

  const auth = getAuth(window.__VV_FIREBASE_APP);
  const functions = getFunctions(window.__VV_FIREBASE_APP, "australia-southeast1");

  const msgEl = document.getElementById("promoMsg");

  function showMsg(text, isError = false) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = "vvPromoMsg " + (isError ? "vvPromoMsg--error" : "vvPromoMsg--ok");
    msgEl.hidden = false;
    clearTimeout(msgEl._timer);
    msgEl._timer = setTimeout(() => { msgEl.hidden = true; }, 8000);
  }

  function setBtnState(btn, state, label) {
    btn.disabled = (state === "loading" || state === "claimed");
    btn.textContent = label;
    btn.dataset.state = state;
  }

  // Callable references
  const claimSignupBonus  = httpsCallable(functions, "vvClaimSignupBonus");
  const claimDepositBonus = httpsCallable(functions, "vvClaimDepositBonus");

  // Track current user
  let currentUser = null;
  onAuthStateChanged(auth, (user) => { currentUser = user; });

  // Logout
  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    await auth.signOut().catch(() => {});
    location.href = "login.html";
  });

  // Claim button handler
  document.querySelectorAll(".vvPromoClaimBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!currentUser) {
        showMsg("Please log in to claim this promotion.", true);
        return;
      }

      const promoType = btn.dataset.promo;

      // Contact-support promotions — open live chat
      if (promoType === "contact-support") {
        showMsg("To claim this promotion, please contact support via the live chat bubble. Have your Player ID ready.");
        try { window.Tawk_API?.maximize?.() || window.Tawk_API?.toggle?.(); } catch (_) {}
        return;
      }

      // Sign Up Bonus — $38.00, one-time only for new registrations
      if (promoType === "signup") {
        setBtnState(btn, "loading", "Claiming…");
        try {
          const result = await claimSignupBonus({});
          setBtnState(btn, "claimed", "✓ Claimed");
          showMsg((result.data?.message) || "$38.00 Sign Up Bonus has been credited to your wallet!");
        } catch (err) {
          setBtnState(btn, "idle", "Claim");
          const msg = err?.message || String(err);
          if (msg.toLowerCase().includes("already")) {
            showMsg("This bonus has already been claimed on your account.", true);
            setBtnState(btn, "claimed", "✓ Already Claimed");
          } else {
            showMsg("Could not claim bonus — " + msg, true);
          }
        }
        return;
      }

      // First Deposit Bonus — 100% match
      if (promoType === "deposit") {
        setBtnState(btn, "loading", "Claiming…");
        try {
          const result = await claimDepositBonus({});
          setBtnState(btn, "claimed", "✓ Claimed");
          showMsg((result.data?.message) || "First Deposit Bonus has been applied to your wallet!");
        } catch (err) {
          setBtnState(btn, "idle", "Claim");
          const msg = err?.message || String(err);
          if (msg.toLowerCase().includes("already")) {
            showMsg("This bonus has already been claimed on your account.", true);
            setBtnState(btn, "claimed", "✓ Already Claimed");
          } else {
            showMsg("Could not claim bonus — " + msg, true);
          }
        }
        return;
      }
    });
  });

})();
