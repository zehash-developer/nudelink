
import { loadClearUrlsRules, applyClearUrls } from "./clearurls-apply.js";

/** DOM refs */
const urlField = document.getElementById("url");
const statusLabel = document.getElementById("status");
const removeReferralCheckbox = document.getElementById("opt-removeReferral");
const cleanHashCheckbox = document.getElementById("opt-cleanHash"); // optional feature
const refreshButton = document.getElementById("refresh");
const copyButton = document.getElementById("copy");
const updateRulesButton = document.getElementById("updateRules"); // optional button

/** Defaults for persisted options */
const DEFAULT_OPTS = Object.freeze({
  removeReferral: true,
  cleanHash: true, // if false, we strip the hash before applying ClearURLs rules
});

/** Tiny status helper */
const setStatus = (text, good = false) => {
  statusLabel.textContent = text;
  statusLabel.className = good ? "muted good" : "muted";
};

/** Load options from chrome.storage.sync */
const loadOptions = async () => {
  try {
    const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_OPTS));
    return { ...DEFAULT_OPTS, ...stored };
  } catch (e) {
    console.warn("[Nudelink] loadOptions failed:", e?.message || e);
    return { ...DEFAULT_OPTS };
  }
};

/** Save options patch */
const saveOptions = async (patch) => {
  try {
    await chrome.storage.sync.set(patch);
  } catch (e) {
    console.warn("[Nudelink] saveOptions failed:", e?.message || e);
  }
};

/** Read active tab URL (or empty string on failure) */
const getActiveTabUrl = async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab?.url || "";
  } catch (e) {
    console.error("[Nudelink] tabs.query failed:", e?.message || e);
    return "";
  }
};

/** Ask background.js to refresh rules on-demand */
const requestRulesUpdate = async () => {
  try {
    const res = await chrome.runtime.sendMessage({
      type: "NUDELINK_REFRESH_RULES",
    });
    return Boolean(res?.ok);
  } catch (e) {
    console.warn("[Nudelink] sendMessage failed:", e?.message || e);
    return false;
  }
};

/** Optional pre-processing: if cleanHash is off, strip hash before applying rules */
const maybeStripHash = (inputUrl, cleanHash) => {
  if (cleanHash) return inputUrl;
  try {
    const u = new URL(inputUrl);
    u.hash = "";
    return u.toString();
  } catch {
    return inputUrl;
  }
};

/** Main refresh: load rules → get tab URL → apply rules → render */
export const refreshPopup = async () => {
  setStatus("Loading rules…");

  // Load persisted options and reflect in UI
  const opts = await loadOptions();
  if (removeReferralCheckbox)
    removeReferralCheckbox.checked = !!opts.removeReferral;
  if (cleanHashCheckbox) cleanHashCheckbox.checked = !!opts.cleanHash;

  // Load cached rules (ClearURLs-only; if missing, we show a helpful message)
  const rules = await loadClearUrlsRules();
  if (!rules) {
    const original = await getActiveTabUrl();
    urlField.value = original || "";
    setStatus(
      updateRulesButton
        ? "Rules not loaded yet. Click ‘Update rules’, then Refresh."
        : "Rules not loaded yet. Please wait and reopen the popup."
    );
    return;
  }

  // Get the current tab URL
  const original = await getActiveTabUrl();
  if (!original) {
    urlField.value = "";
    setStatus("No active tab URL found.");
    return;
  }

  // Apply rules
  const prepped = maybeStripHash(original, opts.cleanHash);
  const result = applyClearUrls(prepped, rules, {
    allowReferral: !opts.removeReferral,
  });

  if (result.error) {
    urlField.value = original;
    setStatus(`Could not clean — ${result.error}`);
    return;
  }

  urlField.value = result.url;
  setStatus(result.changed ? "Cleaned ✓" : "Already clean ✨", true);
};

/** Copy handler */
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(urlField.value);
    setStatus("Copied to clipboard.", true);
  } catch (e) {
    alert(`Copy failed: ${e?.message || e}`);
  }
};

/** Wire events */
refreshButton?.addEventListener("click", () => {
  setStatus("Refreshing…");
  refreshPopup();
});

copyButton?.addEventListener("click", copyToClipboard);

removeReferralCheckbox?.addEventListener("change", async (e) => {
  await saveOptions({ removeReferral: !!e.target.checked });
  refreshPopup();
});

cleanHashCheckbox?.addEventListener("change", async (e) => {
  await saveOptions({ cleanHash: !!e.target.checked });
  refreshPopup();
});

updateRulesButton?.addEventListener("click", async () => {
  setStatus("Updating rules…");
  const ok = await requestRulesUpdate();
  setStatus(ok ? "Rules updated. Click Refresh." : "Update failed. Try again.");
});

/** Run once on popup open */
refreshPopup();
