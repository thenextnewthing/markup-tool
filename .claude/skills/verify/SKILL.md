---
name: verify
description: How to verify changes to the markup tool (website + Chrome extension) end-to-end with headless Playwright.
---

# Verifying the markup tool

Two ready-made harnesses live in the repo — run them, don't rebuild them:

```sh
node scripts/verify/verify-site.js        # website (public/) — tools, crop, undo/redo, persistence
node scripts/verify/verify-extension.js   # extension — on-page drawing, scroll anchoring, capture
```

Both exit non-zero on failure and print PASS/FAIL per check. They write screenshots to the OS tmpdir — Read them and actually look. **Run `npm run sync` first if you edited `shared/`** (the harnesses load the synced copies).

## Environment

Playwright is available via `require('/Users/theandrew/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')` (browsers in `~/Library/Caches/ms-playwright`). If that npx hash is gone, find another: `for d in ~/.npm/_npx/*/node_modules/playwright; do echo $d; done`.

## Patterns (for writing new checks)

- **Website**: goto `file://…/public/index.html`; inject an image via synthetic paste (`DataTransfer` + `ClipboardEvent('paste')`); draw by clicking `.tool-btn[data-tool=…]` / `.size-btn[data-size=…]` then mouse down/move/up over `#overlay`; assert via `base.toDataURL()` equality for undo/redo round-trips (sketch seeds are per-shape, so same-session redraws are deterministic).
- **Extension**: `chromium.launchPersistentContext(tmpProfile, {channel:'chromium', headless:true, args:['--disable-extensions-except=…','--load-extension=…']})`. Automation can't click the toolbar action, so the harness copies `extension/` to a test build with `host_permissions: ["<all_urls>"]` and calls the background's `__injectForTest(tabId)` via `serviceWorker.evaluate`. Playwright locators pierce the shadow DOM automatically. The capture writes `data-capture-url` / `data-capture-dims` attributes on `#__markupHost` (attributes cross the isolated/main world boundary) — decode and pixel-sample rather than trusting a viewer page.
- While markup mode is active the overlay intentionally blocks clicks on page elements — focus page inputs via `page.evaluate(el.focus())`, not `page.click`.

## Gotchas

- After `npx wrangler deploy` / `npm run deploy`, the Cloudflare edge cache (`cf-cache-status: HIT`) can serve the old asset for ~a minute on markup.codeshiftagent.com. Poll until new content appears before declaring the deploy live.
- Toolbar settings persist (`handDrawn`, `autoPaste` in localStorage on the site; `chrome.storage.local` in the extension).
- `chrome.tabs.query` has no `url` values without the `tabs` permission — target `{active: true, lastFocusedWindow: true}` in tests.
