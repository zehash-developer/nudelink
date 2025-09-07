// clearurls-apply.js
// Minimal interpreter for ClearURLs rules. Focuses on:
// - provider matching via urlPattern
// - exceptions
// - redirections (capture group 1 -> real URL)
// - parameter removal (rules + referralMarketing)

const STORAGE_KEY = "clearurls_rules_v1";

/**
 * Load cached ClearURLs rules from persistent storage.
 * @returns {Promise<object|null>} rules JSON or null if not present
 */
export async function loadClearUrlsRules() {
  try {
    const entry = await chrome.storage.local.get(STORAGE_KEY);
    const payload = entry?.[STORAGE_KEY];
    return payload && payload.rules ? payload.rules : null;
  } catch (e) {
    console.warn("[Nudelink] Failed to load cached rules:", e?.message || e);
    return null;
  }
} 

/** Safely compile a regex or return null on error. */
function safeRegExp(source, flags = "i") {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** Normalize a URL: remove empty ?/# */
function normalizeUrl(u) {
  u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : "";
  return u.toString().replace(/\?$/, "").replace(/#$/, "");
}

/**
 * Apply ClearURLs rules to an input URL string.
 *
 * @param {string} inputUrl - The URL to clean
 * @param {object} rulesJson - ClearURLs rules JSON
 * @param {{allowReferral?: boolean}} [options]
 * @returns {{url:string, changed:boolean, error?:string}}
 */
export function applyClearUrls(
  inputUrl,
  rulesJson,
  { allowReferral = false } = {}
) {
  if (!rulesJson || typeof rulesJson !== "object" || !rulesJson.providers) {
    return { url: inputUrl, changed: false, error: "Rules not available" };
  }

  // Parse early so we have a canonical string to match against
  let workingUrl;
  try {
    workingUrl = new URL(String(inputUrl).trim());
  } catch {
    return { url: inputUrl, changed: false, error: "Invalid URL" };
  }

  const providers = Object.values(rulesJson.providers);
  let wasChanged = false;
  const urlStr = workingUrl.toString();

  // 1) Redirections: unwrap to the target URL (capture group 1)
  for (const provider of providers) {
    const urlRe = safeRegExp(provider.urlPattern, "i");
    if (!urlRe || !urlRe.test(urlStr)) continue;

    // skip if any exception matches
    if (Array.isArray(provider.exceptions)) {
      const isExcepted = provider.exceptions.some((ex) => {
        const re = safeRegExp(ex, "i");
        return re ? re.test(urlStr) : false;
      });
      if (isExcepted) continue;
    }

    if (Array.isArray(provider.redirections)) {
      for (const redir of provider.redirections) {
        const re = safeRegExp(redir, "i");
        if (!re) continue;
        const m = re.exec(urlStr);
        const target = m?.[1];
        if (target) {
          let next = target;
          try {
            next = decodeURIComponent(target);
          } catch {
            /* keep raw */
          }
          try {
            workingUrl = new URL(next);
            wasChanged = true;
          } catch {
            // ignore bad targets
          }
        }
      }
    }
  }

  // 2) Parameter removal: rules + referralMarketing
  for (const provider of providers) {
    const urlRe = safeRegExp(provider.urlPattern, "i");
    if (!urlRe || !urlRe.test(workingUrl.toString())) continue;

    // exceptions
    if (Array.isArray(provider.exceptions)) {
      const isExcepted = provider.exceptions.some((ex) => {
        const re = safeRegExp(ex, "i");
        return re ? re.test(workingUrl.toString()) : false;
      });
      if (isExcepted) continue;
    }

    // Build removal lists:
    const asList = (x) => (Array.isArray(x) ? x : []);
    const rawEntries = [
      ...asList(provider.rules),
      ...(!allowReferral ? asList(provider.referralMarketing) : []),
    ];

    const nameSet = new Set();
    const regexList = [];

    for (const entry of rawEntries) {
      const s = String(entry);
      // Treat as plain name if no regex metachars
      if (
        !/[.*+?^${}()|[\]\\]/.test(s) &&
        !s.includes("=") &&
        !s.includes("[") &&
        !s.includes("\\b")
      ) {
        nameSet.add(s.toLowerCase());
      } else {
        const re = safeRegExp(s, "i");
        if (re) regexList.push(re);
      }
    }

    // query string
    for (const key of [...workingUrl.searchParams.keys()]) {
      const lower = key.toLowerCase();

      // exact name match
      let remove = nameSet.has(lower);

      // regex matches (try both "key" and "key=" to satisfy different rule styles)
      if (!remove) {
        remove = regexList.some((re) => re.test(lower) || re.test(`${lower}=`));
      }

      if (remove) {
        workingUrl.searchParams.delete(key);
        wasChanged = true;
      }
    }

    // rawRules: full-URL regex replacements
    if (Array.isArray(provider.rawRules)) {
      for (const raw of provider.rawRules) {
        const re = safeRegExp(raw, "ig");
        if (!re) continue;
        const before = workingUrl.toString();
        const after = before.replace(re, "");
        if (after !== before) {
          try {
            workingUrl = new URL(after);
            wasChanged = true;
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  // 3) Normalize and return
  const finalString = normalizeUrl(workingUrl);
  return { url: finalString, changed: wasChanged };
}
