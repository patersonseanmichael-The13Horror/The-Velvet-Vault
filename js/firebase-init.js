// js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

let auth = null;
let app = null;
let initError = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
} catch (error) {
  initError = error;
  console.error("[VelvetVault] Firebase init failed:", error);
}

window.vvApp = app;
window.vvAuth = auth;
window.vvFirebaseInitError = initError;
