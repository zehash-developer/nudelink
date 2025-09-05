import { BAD_PARAMS_LIST, REFERRAL_PARAMS_LIST } from "./trackingConstants.js";

/**
 * Strips known tracking and referral parameters from a URL.
 *
 * @param {string} input - The URL to clean.
 * @param {Object} [opts] - Optional settings.
 * @param {string[]} [opts.keepParams] - Query params to preserve (case-insensitive).
 * @param {string[]} [opts.extraBadParams] - Additional params to remove.
 * @param {boolean} [opts.removeReferral=true] - Also strip affiliate/referral params.
 * @returns {Object} Result object.
 * @returns {string} result.url - The cleaned URL.
 * @returns {boolean} result.changed - True if the URL was modified.
 * @returns {string|null} result.unwrappedFrom - Redirector source if unwrapped, else null.
 */
export const stripTracking = (input, opts = {}) => {
  const {
    keepParams = [], // preserve these (case-insensitive)
    extraBadParams = [], // additionally remove these
    removeReferral = true, // also strip affiliate-ish "ref" params
  } = opts;

  const keep = new Set(keepParams.map((p) => String(p).toLowerCase()));

  // Known tracking params (lowercased)
  const BAD_PARAMS = new Set(BAD_PARAMS_LIST);

  if (removeReferral) {
    REFERRAL_PARAMS_LIST.forEach((p) => BAD_PARAMS.add(p));
  }

  for (const p of extraBadParams) BAD_PARAMS.add(String(p).toLowerCase());

  const shouldRemove = (key) => {
    const k = key.toLowerCase();
    if (keep.has(k)) return false;
    if (k.startsWith("utm_")) return true; // catch unknown utm_*
    return BAD_PARAMS.has(k);
  };

  const unwrapKnownRedirectors = (urlStr) => {
    try {
      const u = new URL(urlStr);

      // Google redirector
      if (
        (u.hostname.endsWith("google.com") ||
          u.hostname.endsWith("google.com.au")) &&
        u.pathname === "/url"
      ) {
        const candidate = u.searchParams.get("url") || u.searchParams.get("q");
        if (candidate) return { url: candidate, from: "google" };
      }

      // Facebook redirector
      if (
        (u.hostname === "l.facebook.com" || u.pathname === "/l.php") &&
        u.searchParams.get("u")
      ) {
        return { url: u.searchParams.get("u"), from: "facebook" };
      }

      // Instagram variant
      if (u.hostname.endsWith("instagram.com") && u.searchParams.get("u")) {
        return { url: u.searchParams.get("u"), from: "instagram" };
      }

      return { url: urlStr, from: null };
    } catch {
      return { url: urlStr, from: null };
    }
  };

  // Ensure string
  let raw = String(input).trim();

  // Unwrap one hop (you can loop if you want multi-hop)
  const unwrapped = unwrapKnownRedirectors(raw);
  raw = unwrapped.url;

  // Parse
  let urlObj;
  try {
    urlObj = new URL(raw);
  } catch {
    return { url: input, changed: false, error: "Invalid URL" };
  }

  let changed = Boolean(unwrapped.from);

  // Query: remove bad params
  for (const key of Array.from(urlObj.searchParams.keys())) {
    if (shouldRemove(key)) {
      urlObj.searchParams.delete(key);
      changed = true;
    }
  }

  // Hash: if it looks like query (`#x=1&y=2`), strip there too
  if (urlObj.hash && urlObj.hash.includes("=")) {
    const hashParams = new URLSearchParams(urlObj.hash.replace(/^#\??/, ""));
    let hashChanged = false;
    for (const key of Array.from(hashParams.keys())) {
      if (shouldRemove(key)) {
        hashParams.delete(key);
        hashChanged = true;
      }
    }
    if (hashChanged) {
      const nextHash = hashParams.toString();
      urlObj.hash = nextHash ? "#" + nextHash : "";
      changed = true;
    }
  }

  // Normalize empty search and trailing punctuation
  const normalizedSearch = urlObj.searchParams.toString();
  urlObj.search = normalizedSearch ? "?" + normalizedSearch : "";
  let out = urlObj.toString().replace(/\?$/, "").replace(/#$/, "");

  return {
    url: out,
    changed,
    unwrappedFrom: unwrapped.from || null,
  };
};
