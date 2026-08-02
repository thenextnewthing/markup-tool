# Andrew's Markup — paste, annotate, copy

A markup tool in two forms that share one editor codebase:

- **Website** — https://markup.codeshiftagent.com/ — paste a screenshot, annotate, copy the result.
- **Chrome extension** — draw with the same tools directly on any live web page, then capture the page from the top to just below your lowest annotation, straight to the clipboard.

## Features (both surfaces)

- Pen, highlighter, arrow, Skitch-style tapered arrow, text, box, and oval tools with keyboard shortcuts (P/H/A/S/T/R/O)
- **Text** with a Skitch-style contrast halo (white outline on dark colors, dark on light) so it reads on any background; multi-line via Shift+Enter
- **Click-to-grab** — with any tool active, clicking an object's stroke selects it: drag to move, Delete key or the red ✕ to remove; clicking empty space (even inside a box) draws as usual; undo/redo covers moves and deletes
- 8 colors, 5 stroke sizes (S–XXL, keys 1–5, L default)
- **Hand-drawn mode** — sketchy, bowed strokes with overshot corners; toggling restyles everything already drawn (in the gear menu)
- Undo/redo (⌘Z / ⇧⌘Z), start over, primary action on ⇧⌘C

### Website only
- **Crop (C)** — drag the area to keep, ✓/Enter applies, ✕/Escape cancels; undo restores the previous crop
- **Auto paste** — loads the clipboard image automatically when you open or return to the tab (gear menu)
- **Download the Chrome extension** from the gear menu (markup-extension.zip)

### Extension only
- Annotations anchor to the page: scroll and they stay on the section you drew them on; keep scrolling and drawing
- **Capture** — scroll-and-stitch screenshot from the page top to just below the lowest annotation (fixed/sticky headers are hidden after the first chunk so they don't repeat), PNG to clipboard
- Esc or ✕ exits markup mode; press the extension button again to toggle

## Installing the extension

1. Download `markup-extension.zip` from the site's gear menu (or grab the `extension/` folder from this repo — run `npm run sync` first).
2. Unzip it somewhere permanent.
3. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and pick the unzipped folder.
4. Pin "Andrew's Markup" and click it on any page to enter markup mode. Click it again (or press Esc / ✕) to leave.

Permissions: `activeTab` + `scripting` (runs only when you click the button) and `storage` (remembers the hand-drawn setting). No debugger, no background access to your browsing.

## How it's built

```
shared/     ← THE editor: markup-core.js (engine), toolbar.js (UI builder), toolbar.css
public/     ← website: index.html (shell) + app.js (image/crop/copy glue) + synced shared/
extension/  ← MV3 extension: manifest, background.js (inject + captureVisibleTab),
              content.js (shadow-DOM overlay on the live page) + synced shared/
scripts/    ← sync.mjs (copy shared/ into both), zip-extension.mjs (package the zip),
              verify/ (headless-browser test harnesses)
```

Edit **only** `shared/` for editor changes — `public/shared/` and `extension/shared/` are gitignored copies. `npm run sync` refreshes them (then hit ⟳ on the extension in `chrome://extensions`).

## Deploying the website

Pushing to `main` automatically builds and deploys the production Worker through
Cloudflare Workers Builds. Pull requests and other branches produce preview
versions without replacing production.

For a deliberate local deployment, run `npm run deploy`. This syncs the shared
editor, rebuilds the extension zip, and runs Wrangler.

The Cloudflare edge cache can serve the old version for ~a minute after a deploy.

## Verifying changes

Run `npm test` for both end-to-end suites, or run either script directly when
working on only one surface.

Both run headless Chromium via the repo's Playwright dependency (see
`.claude/skills/verify/SKILL.md` for the underlying patterns; the extension
harness loads a test build with host permissions added, since automation cannot
produce the activeTab click).
