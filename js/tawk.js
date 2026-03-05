/**
 * Velvet Vault — Tawk.to Live Chat Loader
 *
 * Replace TAWK_PROPERTY_ID and TAWK_WIDGET_ID with your actual
 * Tawk.to Property ID and Widget ID from:
 * https://dashboard.tawk.to/#/account/property
 *
 * To disable: set window.VV_TAWK_DISABLED = true before this script loads.
 */
(function () {
  "use strict";

  if (window.VV_TAWK_DISABLED) return;

  // ── Configuration ──────────────────────────────────────────
  // Replace these values with your Tawk.to credentials
  var TAWK_PROPERTY_ID = window.VV_TAWK_PROPERTY_ID || "TAWK_PROPERTY_ID";
  var TAWK_WIDGET_ID   = window.VV_TAWK_WIDGET_ID   || "default";

  // Skip if placeholder IDs are still set
  if (
    TAWK_PROPERTY_ID === "TAWK_PROPERTY_ID" ||
    !TAWK_PROPERTY_ID ||
    TAWK_PROPERTY_ID.length < 8
  ) {
    return;
  }

  // ── Tawk.to embed ──────────────────────────────────────────
  var Tawk_API = window.Tawk_API || {};
  var Tawk_LoadStart = new Date();
  window.Tawk_API = Tawk_API;
  window.Tawk_LoadStart = Tawk_LoadStart;

  // Style the widget to match Velvet Vault's dark theme
  Tawk_API.onLoad = function () {
    if (typeof Tawk_API.setAttributes === "function") {
      Tawk_API.setAttributes({
        name: "Guest",
        email: ""
      }, function (error) {});
    }
  };

  // Inject the Tawk.to script
  var s1 = document.createElement("script");
  var s0 = document.getElementsByTagName("script")[0];
  s1.async = true;
  s1.src = "https://embed.tawk.to/" + TAWK_PROPERTY_ID + "/" + TAWK_WIDGET_ID;
  s1.charset = "UTF-8";
  s1.setAttribute("crossorigin", "*");
  s0.parentNode.insertBefore(s1, s0);
})();
