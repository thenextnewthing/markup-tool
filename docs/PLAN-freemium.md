# Plan: Freemium metering (25 free captures/month) + open-sourcing this repo

*Status: planned, not yet implemented. Drafted 2026-07-11.*

## Goal

Monetize the Chrome extension as freemium while making this repo public:

- **Metered unit:** each **Capture** in the extension. Drawing/browsing stay unlimited. The website stays fully free.
- **Free tier:** 25 captures per calendar month (resets monthly).
- **Paid:** monthly subscription → unlimited captures. Price set in the ExtensionPay dashboard, not in code.
- **Open source:** repo public under **MIT**. Anyone can fork and build a fully free version by flipping one config flag.
- **No secrets in the repo:** payments run through [ExtensionPay](https://extensionpay.com) — Stripe is connected inside their dashboard; the only identifier in code is a public extension-id string.

## Design

### ExtensionPay integration
- Vendor `extension/extpay.js` (from github.com/Glench/ExtPay, MIT, bundled — no remote code).
- New `extension/config.js`:
  ```js
  self.MK_CONFIG = {
    paywall: false,              // flip to true once the ExtensionPay account exists
    extpayId: 'andrews-markup',  // must match the id registered on extensionpay.com
    freeCapturesPerMonth: 25,
  };
  ```
  **Forks:** set `paywall: false` (the current default) for a completely free build.
- `background.js`: `importScripts('config.js', 'extpay.js')`; when paywall on → `ExtPay(id).startBackground()`. New messages:
  - `mk-gate` → paid users always allowed; otherwise compare this month's count (`chrome.storage.local` key `mkUsage = {month: 'YYYY-MM', count}`) against the limit. On network failure checking paid status: use last cached status, else **fail open** (never block on an outage).
  - `mk-count` → increment after a successful unpaid capture.
  - `mk-pay` → `extpay.openPaymentPage()` (subscribe, or manage subscription when already paid).
- `manifest.json`: add the extensionpay.com content script (their post-payment callback), include `config.js` in the injection list, bump to 1.2.0.

### Metering UX (content.js)
- Capture checks the gate first; blocked → toast **"You've used all 25 free captures this month"** with an **Upgrade** button.
- Success toast appends "— N free left this month" when N ≤ 5.
- Gear menu gains a **Usage & subscription** item showing "X of 25 free captures used this month" (or "Subscribed — unlimited"), click opens the payment/manage page. Requires a small `menuActions` addition to `shared/toolbar.js`.

### Open-sourcing
- `LICENSE`: MIT.
- README: "Free vs Pro" section, "Build your own free version" instructions, and a note that no payment secrets live here.
- Make the repo public (`gh repo edit --visibility public`) after a history scan for secrets (none expected: `.wrangler/` was gitignored from the first commit).

## Verification

Extend `scripts/verify/verify-extension.js` (paywall forced on in the test build; fake extpay id exercises fail-open):
1. Fresh profile → capture succeeds, count becomes 1.
2. Seed count=25 for the current month → capture blocked, Upgrade toast shown.
3. Seed cached-paid state → unlimited despite count 25.
4. Seed count=25 for LAST month → capture succeeds (monthly reset).
5. Shipped default (`paywall: false`) → existing harness passes unchanged.
Plus rerun `verify-site.js`, and a real checkout round-trip once ExtensionPay is registered.

## Andrew's manual steps

1. Sign up at extensionpay.com (free) → New extension with id **andrews-markup** → connect Stripe → add a monthly plan at the chosen price.
2. Flip `paywall: true` in `extension/config.js` → `npm run deploy` → upload the new zip to the Chrome Web Store listing.
3. Approve making the repo public.
