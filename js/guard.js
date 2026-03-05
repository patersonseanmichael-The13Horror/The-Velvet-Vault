import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const auth = window.vvAuth;
const LOGIN_PATH = "login.html";
let guardResolved = false;

function goToLogin() {
  if (!location.pathname.endsWith(LOGIN_PATH)) {
    location.replace(LOGIN_PATH);
  }
}

// Determine if this page should be protected (opt-in via meta tag)
const isProtected = (() => {
  const meta = document.querySelector('meta[name="vv-protected"]');
  return meta && String(meta.content || "").toLowerCase() === "true";
})();

if (!auth) {
  // Firebase auth unavailable — allow page to continue (no redirect possible)
  guardResolved = true;
} else if (!isProtected) {
  // Auth exists but page is not protected; just bind logout if present
  guardResolved = true;
} else {
  (async () => {
    try {
      if (typeof auth.authStateReady === "function") {
        await auth.authStateReady();
      }
      guardResolved = true;
      if (!auth.currentUser || !auth.currentUser.emailVerified) {
        goToLogin();
      }
    } catch {
      goToLogin();
    }
  })();

  setTimeout(() => {
    if (!guardResolved) {
      goToLogin();
    }
  }, 3000);

  onAuthStateChanged(auth, (user) => {
    guardResolved = true;
    if (!user || !user.emailVerified) {
      goToLogin();
    }
  });
}

function bindLogoutButton() {
  const buttons = document.querySelectorAll("#logoutBtn, #btnLogout, #adminLogoutBtn");
  for (const logoutBtn of buttons) {
    if (!logoutBtn || logoutBtn.dataset.vvLogoutBound === "1") continue;
    logoutBtn.dataset.vvLogoutBound = "1";

    logoutBtn.addEventListener("click", async () => {
      if (auth) {
        try {
          await signOut(auth);
        } catch (error) {
          // Sign out error is non-critical; redirect anyway
        }
      }
      goToLogin();
    });
  }
}

bindLogoutButton();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindLogoutButton, { once: true });
}
