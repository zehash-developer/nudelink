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


// Assumes these already exist in your file:
/// const RULES_URL  = "https://rules2.clearurls.xyz/data.minify.json";
/// const HASH_URL   = "https://rules2.clearurls.xyz/rules.minify.hash";
/// const STORAGE_KEY = "clearurls_rules_v1";
/// const fetchText, sha256Hex, saveRules defined as earlier

/** Load currently cached rules metadata if any. */
const loadCached = async () =>
  (await chrome.storage.local.get(STORAGE_KEY))?.[STORAGE_KEY] ?? null;

/**
 * Download ClearURLs rules if (and only if) the upstream hash differs.
 * 1) Read cached {hash}
 * 2) GET upstream hash
 * 3) If same → return cached rules (updated:false)
 * 4) Else GET rules, verify SHA-256 matches upstream hash
 * 5) Persist {rules, hash, ts} and return (updated:true)
 *
 * @returns {Promise<{rules: object|null, updated: boolean}>}
 * @throws {Error} on network/HTTP errors, hash mismatch, or JSON parse issues
 */
export const downloadAndCacheRules = async () => {
  // A) read what we have
  const cached = await loadCached();
  const cachedHash = cached?.hash ?? null;

  // B) fetch upstream hash only (small, fast)
  const upstreamHashRaw = await fetchText(HASH_URL);
  const upstreamHash = upstreamHashRaw.trim().toLowerCase();

  // C) if hashes match and we have rules, no need to fetch rules again
  if (cachedHash === upstreamHash) {
    return { rules: cached.rules, updated: false };
  }

  // D) hashes differ (or first run) → fetch rules text
  const rulesText = await fetchText(RULES_URL);

  // E) verify integrity
  const actualHash = await sha256Hex(rulesText);
  if (actualHash !== upstreamHash) {
    // Do not cache; something’s off (partial download/MITM)
    throw new Error("Rules hash mismatch after download — integrity check failed");
  }

  // F) parse JSON safely
  let rules;
  try {
    rules = JSON.parse(rulesText);
  } catch (e) {
    throw new Error(`Rules JSON parse error: ${e?.message || String(e)}`);
  }

  // G) persist new payload
  await saveRules({ rules, ts: Date.now(), hash: actualHash });
  console.info("[Nudelink] Rules updated and persisted (hash changed).");

  return { rules, updated: true };
};




/* =========================
   4) Scheduling + Backoff
   ========================= */

const scheduleDaily = () => chrome.alarms.create(DAILY_ALARM, { periodInMinutes: ONE_DAY_MIN });
const scheduleRetryIn = (mins) =>
  chrome.alarms.create(RETRY_ALARM, { when: Date.now() + mins * 60_000 });

const handleSuccess = async () => {
  await saveState({ backoffIndex: 0 });
  scheduleDaily(); // ensure we have a daily refresh running
};


const handleFailure = async () => {
  const state = await loadState();
  const i = Math.min(state.backoffIndex ?? 0, RETRY_DELAYS_MIN.length - 1);
  const delay = RETRY_DELAYS_MIN[i];
  console.warn(`[Nudelink] Fetch failed — retrying in ${delay} min`);
  await saveState({
    backoffIndex: Math.min(i + 1, RETRY_DELAYS_MIN.length - 1),
  });
  scheduleRetryIn(delay);
};

/**
 * Try to refresh rules *now* and set appropriate future alarms.
 * @returns {Promise<boolean>} true on success, false on failure
 */
export const ensureFreshRules = async () => {
  try {
    await downloadAndCacheRules();
    await handleSuccess();
    return true;
  } catch (e) {
    console.warn("[Nudelink] ensureFreshRules error:", e?.message || e);
    await handleFailure();
    return false;
  }
};

/* =========================
   5) Lifecycle Hooks
   ========================= */

// On first install or extension update: fetch immediately and set daily alarm.
chrome.runtime.onInstalled.addListener(() => {
  ensureFreshRules();
});

// Every time the browser starts up: fetch immediately (no fallback) and schedule accordingly.
chrome.runtime.onStartup.addListener(() => {
  ensureFreshRules();
});

// Alarms: either our daily refresh or a one-shot retry triggers a refresh attempt.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_ALARM || alarm.name === RETRY_ALARM) {
    ensureFreshRules();
  }
});


/* =========================
   6) Messages (manual refresh + debug)
   ========================= */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "NUDELINK_REFRESH_RULES": {
          const ok = await ensureFreshRules();
          sendResponse({ ok });
          break;
        }
        case "NUDELINK_DEBUG_STATE": {
          const payload = await loadRules(); // payload = { rules, ts, hash } | null
          const state = await loadState();
          sendResponse({
            ok: true,
            hasRules: Boolean(payload?.rules),
            state,
            lastUpdated: payload?.ts || null,
            hash: payload?.hash || null,
          });
          break;
        }
        default:
          // Unknown message: respond gracefully (helps avoid silent failures)
          if (msg && msg.type) {
            sendResponse({
              ok: false,
              error: `Unknown message type: ${msg.type}`,
            });
          }
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();
  // Return true to keep the channel open for async sendResponse.
  return true;
});