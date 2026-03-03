import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-functions.js";

const auth = window.vvAuth;
const app = window.vvApp;
const fx = app ? getFunctions(app) : null;
const resolveUidLoginEmail = fx ? httpsCallable(fx, "vvResolveUidLoginEmail") : null;
const upsertUserProfile = fx ? httpsCallable(fx, "vvUpsertUserProfile") : null;

const signupNameEl = document.getElementById("signupName");
const signupEmailEl = document.getElementById("signupEmail");
const signupPhoneEl = document.getElementById("signupPhone");
const signupDobEl = document.getElementById("signupDob");
const signupPasswordEl = document.getElementById("signupPassword");
const signupPasswordConfirmEl = document.getElementById("signupPasswordConfirm");
const signupBtn = document.getElementById("signupBtn");

const loginIdentifierEl = document.getElementById("loginIdentifier");
const loginPasswordEl = document.getElementById("loginPassword");
const signinBtn = document.getElementById("signinBtn");
const resendBtn = document.getElementById("resendBtn");

const msgEl = document.getElementById("message");
const uidPanelEl = document.getElementById("uidPanel");
const uidValueEl = document.getElementById("uidValue");
const copyUidBtn = document.getElementById("copyUidBtn");

function say(text) {
  if (msgEl) msgEl.textContent = text;
}

function showUid(uid) {
  if (!uidPanelEl || !uidValueEl) return;
  uidValueEl.textContent = uid || "—";
  uidPanelEl.hidden = !uid;
}

function readValue(el) {
  return (el?.value || "").trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function ensureUserProfile({ email, displayName, phone, dob }) {
  if (!upsertUserProfile) return;
  await upsertUserProfile({
    email,
    displayName,
    phone,
    dob
  });
}

async function resolveLoginEmail(identifier) {
  if (isEmail(identifier)) return identifier;
  if (!resolveUidLoginEmail) {
    throw new Error("UID login is unavailable right now.");
  }
  const result = await resolveUidLoginEmail({ uid: identifier });
  const email = String(result?.data?.email || "").trim();
  if (!email) {
    throw new Error("Unable to resolve User ID.");
  }
  return email;
}

if (!auth) {
  say("Auth is unavailable. Check Firebase configuration and network access.");
}

signupBtn?.addEventListener("click", async () => {
  if (!auth) return;
  const displayName = readValue(signupNameEl);
  const email = readValue(signupEmailEl);
  const phone = readValue(signupPhoneEl);
  const dob = readValue(signupDobEl);
  const password = signupPasswordEl?.value || "";
  const passwordConfirm = signupPasswordConfirmEl?.value || "";

  if (!displayName || !email || !phone || !dob || !password || !passwordConfirm) {
    say("Complete every signup field to receive your User ID.");
    return;
  }
  if (!isEmail(email)) {
    say("Enter a valid email address.");
    return;
  }
  if (password !== passwordConfirm) {
    say("Password confirmation does not match.");
    return;
  }
  if (password.length < 6) {
    say("Password must be at least 6 characters.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await ensureUserProfile({
      email,
      displayName,
      phone,
      dob
    });
    await sendEmailVerification(cred.user);
    showUid(cred.user.uid);
    if (loginIdentifierEl) loginIdentifierEl.value = cred.user.uid;
    say("Account created. Your User ID is ready above. Verify your email, then log in.");
  } catch (error) {
    say(error?.message || String(error));
  }
});

signinBtn?.addEventListener("click", async () => {
  if (!auth) return;

  const identifier = readValue(loginIdentifierEl);
  const password = loginPasswordEl?.value || "";
  if (!identifier || !password) {
    say("Enter your User ID or email and password.");
    return;
  }

  try {
    const email = await resolveLoginEmail(identifier);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile({
      email,
      displayName: cred.user.displayName || "",
      phone: cred.user.phoneNumber || "",
      dob: ""
    });
    if (!cred.user.emailVerified) {
      showUid(cred.user.uid);
      say("Verify your email first. Use Resend Verification if needed.");
      return;
    }
    location.href = "members.html";
  } catch (error) {
    say(error?.message || String(error));
  }
});

resendBtn?.addEventListener("click", async () => {
  if (!auth) return;
  try {
    const user = auth.currentUser;
    if (!user) {
      say("Sign in first, then resend verification.");
      return;
    }
    await sendEmailVerification(user);
    showUid(user.uid);
    say("Verification email sent.");
  } catch (error) {
    say(error?.message || String(error));
  }
});

copyUidBtn?.addEventListener("click", async () => {
  const uid = uidValueEl?.textContent?.trim();
  if (!uid || uid === "—") return;
  try {
    await navigator.clipboard.writeText(uid);
    say("User ID copied.");
  } catch {
    say("Copy failed. Select and copy the User ID manually.");
  }
});

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user?.uid) {
      showUid(user.uid);
    }
    if (user && user.emailVerified) {
      location.href = "members.html";
    }
  });
}

window.vvLogout = async () => {
  if (auth) await signOut(auth);
};
