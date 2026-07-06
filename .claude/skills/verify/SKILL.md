---
name: verify
description: How to verify changes to the markup tool (public/index.html) end-to-end with headless Playwright — load the page, paste a synthetic image, draw shapes, screenshot.
---

# Verifying the markup tool

The whole app is one file, `public/index.html`, self-contained — it runs from `file://`, no server or build needed.

## Recipe

Playwright is available via `require('/Users/theandrew/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')` (browsers already in `~/Library/Caches/ms-playwright`). A working script: `verify-handdrawn.js` in the session scratchpad (recreate from the patterns below).

1. `chromium.launch()`, open `file:///Users/Shared/CCP - markup tool/public/index.html`.
2. **Load an image** — the app only activates after paste/drop. Synthetic paste works in Chromium:
   ```js
   await page.evaluate(async () => {
     const c = document.createElement('canvas'); c.width = 1000; c.height = 620;
     /* draw something */
     const blob = await new Promise(r => c.toBlob(r, 'image/png'));
     const dt = new DataTransfer();
     dt.items.add(new File([blob], 's.png', { type: 'image/png' }));
     window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
   });
   await page.waitForSelector('#canvasWrap', { state: 'visible' });
   ```
3. **Draw** — click `.tool-btn[data-tool="pen|highlighter|arrow|rect|oval"]`, then mouse down/move/up over `#overlay` (move in several steps so pen strokes collect points). Sizes: `.size-btn[data-size="S|M|L|XL|XXL"]`.
4. **Capture** — `page.locator('#canvasWrap').screenshot(...)`, then Read the PNG and actually look at it. Collect `pageerror`/console errors throughout.
5. Deterministic-render checks (undo/redo, toggles) can compare screenshot md5 hashes.

## Gotchas

- Toolbar toggles persist in localStorage (`autoPaste`, `handDrawn`) — reload keeps state within the browser context.
- After `npx wrangler deploy`, the Cloudflare edge cache (`cf-cache-status: HIT`) can serve the old asset for ~a minute on both markup.codeshiftagent.com and markup.heatcheck.workers.dev. Poll until the new content appears before declaring the deploy live.
