import { stripTracking } from "./striptracking.js";

// DOM element references
const urlField = document.getElementById("url");
const statusLabel = document.getElementById("status");
const removeReferralCheckbox = document.getElementById("opt-removeReferral");
const cleanHashCheckbox = document.getElementById("opt-cleanHash");
const refreshButton = document.getElementById("refresh");
const copyButton = document.getElementById("copy");

// Default extension options
const DEFAULT_OPTIONS = { removeReferral: true, cleanHash: true };

/**
 * Loads extension options from Chrome storage, falling back to defaults.
 * @returns {Promise<Object>} Options object
 */
const loadOptions = async () => {
  const storedOptions = await chrome.storage.sync.get(
    Object.keys(DEFAULT_OPTIONS)
  );
  return { ...DEFAULT_OPTIONS, ...storedOptions };
};

/**
 * Saves extension options to Chrome storage.
 * @param {Object} options - Options to save
 */
const saveOptions = async (options) => {
  await chrome.storage.sync.set(options);
};

/**
 * Gets the URL of the currently active browser tab.
 * @returns {Promise<string>} Active tab URL or empty string
 */
const getActiveTabUrl = async () => {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return activeTab?.url || "";
};

/**
 * Cleans the provided URL using stripTracking and user options.
 * If cleanHash is disabled, removes hash before processing.
 * @param {string} url - The URL to clean
 * @param {Object} options - Cleaning options
 * @returns {Object} Result from stripTracking
 */
const getCleanedUrl = (url, options) => {
  let inputUrl = url;
  if (!options.cleanHash) {
    try {
      const urlObj = new URL(url);
      urlObj.hash = "";
      inputUrl = urlObj.toString();
    } catch {
      // Ignore invalid URLs
    }
  }
  return stripTracking(inputUrl, { removeReferral: options.removeReferral });
};

/**
 * Updates the popup UI with the cleaned URL and status message.
 * @param {string} cleanedUrl - The cleaned URL
 * @param {string} originalUrl - The original URL
 * @param {boolean} wasChanged - Whether the URL was modified
 * @param {string|null} redirectorSource - Redirector source if unwrapped
 * @param {string|null} error - Error message if any
 */
const updatePopupUI = (
  cleanedUrl,
  originalUrl,
  wasChanged,
  redirectorSource,
  error
) => {
  if (error) {
    urlField.value = originalUrl || "";
    statusLabel.textContent = "Invalid URL";
    statusLabel.className = "muted";
    return;
  }
  urlField.value = cleanedUrl;
  statusLabel.textContent = [
    redirectorSource ? `Unwrapped from ${redirectorSource}` : null,
    wasChanged ? "Cleaned ✓" : "Already clean ✨",
  ]
    .filter(Boolean)
    .join(" · ");
  statusLabel.className = "muted good";
};

/**
 * Refreshes the popup: loads options, gets tab URL, cleans it, and updates UI.
 */
const refreshPopup = async () => {
  const options = await loadOptions();
  removeReferralCheckbox.checked = !!options.removeReferral;
  cleanHashCheckbox.checked = !!options.cleanHash;

  const originalUrl = await getActiveTabUrl();
  const {
    url: cleanedUrl,
    changed,
    unwrappedFrom,
    error,
  } = getCleanedUrl(originalUrl, options);

  updatePopupUI(cleanedUrl, originalUrl, changed, unwrappedFrom, error);
};

/**
 * Copies the cleaned URL to the clipboard and updates status.
 */
const copyCleanedUrl = async () => {
  await navigator.clipboard.writeText(urlField.value);
  statusLabel.textContent = "Copied to clipboard.";
  statusLabel.className = "muted good";
};

/**
 * Handles option changes, saves them, and refreshes the popup.
 * @param {Event} event - Change event
 * @param {string} optionKey - Option key to update
 */
const handleOptionChange = async (event, optionKey) => {
  await saveOptions({ [optionKey]: event.target.checked });
  refreshPopup();
};

// Event listeners for UI actions
refreshButton.addEventListener("click", refreshPopup);
copyButton.addEventListener("click", copyCleanedUrl);
removeReferralCheckbox.addEventListener("change", (e) =>
  handleOptionChange(e, "removeReferral")
);
cleanHashCheckbox.addEventListener("change", (e) =>
  handleOptionChange(e, "cleanHash")
);

// Initialize popup on load
refreshPopup();
