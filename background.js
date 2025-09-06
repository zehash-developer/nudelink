export const RULES_URL = "https://rules2.clearurls.xyz/data.minify.json";
export const HASH_URL = "https://rules2.clearurls.xyz/rules.minify.hash";
export const STORAGE_KEY = "clearurls_rules_v1"; // where the rules JSON + metadata live
export const STATE_KEY = "nudelink_refresh_state_v1"; // tracks retry/backoff state
export const DAILY_ALARM = "nudelink_alarm_daily"; // periodic daily refresh
export const RETRY_ALARM = "nudelink_alarm_retry"; // one-shot retry alarm

// Progressive retry delays (minutes) when we fail to fetch (e.g., offline)
const RETRY_DELAYS_MIN = [1, 5, 15, 30, 60]; // 1m → 1h
const ONE_DAY_MIN = 60 * 24;


/* =========================
   2) Small Utilities
   ========================= */

/**
 * Compute SHA-256 hex digest of a text string.
 * @param {string} text
 * @returns {Promise<string>} hex-encoded sha256
 */
export const sha256Hex = async (text) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Fetch plain text with cache disabled; throws on non-2xx.
 * @param {string} url
 * @returns {Promise<string>}
 */
export const fetchText = async (url) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
};

// Storage helpers (rules + state)
const saveRules = async (payload) => chrome.storage.local.set({ [STORAGE_KEY]: payload });
const loadRules = async () => (await chrome.storage.local.get(STORAGE_KEY))?.[STORAGE_KEY] ?? null;

const saveState = async (s) => chrome.storage.local.set({ [STATE_KEY]: s });
const loadState = async () => (await chrome.storage.local.get(STATE_KEY))?.[STATE_KEY] ?? { backoffIndex: 0 };


/* =========================
   3) Core: download + verify + persist
   ========================= */

/**
 * Download ClearURLs rules and verify integrity before saving.
 * @returns {Promise<object>} parsed rules JSON
 * @throws {Error} on network/HTTP errors, hash mismatch, or JSON parse errors
 */
export const downloadAndCacheRules = async () => {
  // A) fetch rules + expected hash
  const [rulesText, expectedHashRaw] = await Promise.all([
    fetchText(RULES_URL),
    fetchText(HASH_URL),
  ]);
  const expectedHash = expectedHashRaw.trim().toLowerCase();

  // B) verify integrity
  const actualHash = await sha256Hex(rulesText);
  if (actualHash !== expectedHash) {
    throw new Error("Rules hash mismatch (integrity check failed)");
  }

  // C) parse JSON safely
  let rules;
  try {
    rules = JSON.parse(rulesText);
  } catch (e) {
    throw new Error(`Rules JSON parse error: ${e?.message || String(e)}`);
  }

  // D) persist with metadata
  await saveRules({ rules, ts: Date.now(), hash: actualHash });
  console.info("[Nudelink] Rules updated and persisted.");
  return rules;
};

