# Nudelink

**Nudelink** is a Chrome extension that cleans URLs by removing tracking, referral, and affiliate parameters.  
It helps you share cleaner links and protect your privacy.

## Features

- Removes common tracking parameters (e.g., `utm_source`, `gclid`, `fbclid`)
- Optionally strips referral/affiliate parameters (e.g., `ref`, `affid`)
- Cleans tracking data from hash fragments
- Unwraps known redirector URLs (Google, Facebook, Instagram)
- One-click copy of the cleaned URL

## Usage

1. Click the Nudelink icon in your browser toolbar.
2. The popup shows the cleaned URL from your active tab.
3. Use the **Copy** button to copy the cleaned link.
4. Adjust options to control referral and hash cleaning.

## Development

- All source files are in the project root.
- Main files:
  - `manifest.json` — Chrome extension manifest
  - `popup.html` — Popup UI
  - `popup.js` — Popup logic
  - `popup.css` — Popup styles
  - `striptracking.js` — URL cleaning logic
  - `trackingConstants.js` — List of tracking/referral parameters

## Installation (Development)

1. Clone this repo.
2. Go to `chrome://extensions` in Chrome.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the project folder.

## License

MIT