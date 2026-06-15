/* config.js — must load first (after supabase client).
 * - NG_SERVER: where online play + the database live ("" = same origin on web,
 *   the deployed URL inside a native shell).
 * - NG_DB: the Supabase client for accounts (or null if not configured). */
(function () {
  var NG_REMOTE = "https://name-game-oivo.onrender.com";

  // Supabase (accounts / cloud progress). The anon key is public by design.
  var SUPABASE_URL = "https://ddrsxmscyuefbkrfdzoj.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkcnN4bXNjeXVlZmJrcmZkem9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDMxODAsImV4cCI6MjA5NzA3OTE4MH0.QB7xxiJzntSSft_-HHpZ0YwQVNO4Au1eUE560f9j53Y";

  var native = false;
  try {
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === "function") {
      native = window.Capacitor.isNativePlatform();
    }
    if (location.protocol === "capacitor:" || location.protocol === "file:") native = true;
  } catch (e) {}

  window.NG_SERVER = native ? NG_REMOTE : "";
  window.NG_NATIVE = native;

  window.NG_DB = null;
  try {
    if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
      window.NG_DB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
  } catch (e) {}
})();
