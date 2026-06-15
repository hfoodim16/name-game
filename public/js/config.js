/* config.js — must load first.
 * On the web the app talks to its own origin. Inside a native (Capacitor)
 * shell there is no local server, so online play + data point at the
 * deployed server instead. Update NG_REMOTE if you change hosts. */
(function () {
  var NG_REMOTE = "https://name-game-oivo.onrender.com";
  var native = false;
  try {
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === "function") {
      native = window.Capacitor.isNativePlatform();
    }
    if (location.protocol === "capacitor:" || location.protocol === "file:") native = true;
  } catch (e) {}
  // "" = same origin (web); absolute URL = remote (native shell).
  window.NG_SERVER = native ? NG_REMOTE : "";
  window.NG_NATIVE = native;
})();
