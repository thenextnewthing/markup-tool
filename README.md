# Andrew's Markup

A paste / annotate / copy tool in two forms that share one editor:

- **Website** — paste a screenshot, annotate it, then copy the result or download it as a PNG.
- **Chrome extension** — draw with the same tools on any live web page, then capture from the top of the page to just below your lowest annotation, straight to the clipboard.

This repository is the source for both. The editor lives once in `shared/` and is copied into the website and the extension.

## Features (both surfaces)

- Pen, highlighter, arrow, Skitch-style tapered arrow, text, box, and oval tools with keyboard shortcuts (P/H/A/S/T/R/O)
- **Text** with a Skitch-style contrast halo (white outline on dark colors, dark on light) so it reads on any background; Enter starts a new line, and clicking elsewhere or pressing Escape finishes the text
- **Click-to-grab** — with any tool active, clicking an object's stroke selects it: drag to move, Delete key or the red ✕ to remove; clicking empty space (even inside a box) draws as usual; undo/redo covers moves and deletes
- 8 colors, 5 stroke sizes (S–XXL, keys 1–5, L default)
- **Hand-drawn mode** — sketchy, bowed strokes with overshot corners; toggling restyles everything already drawn (in the gear menu)
- Undo/redo (⌘Z / ⇧⌘Z), start over, primary action on ⇧⌘C

### Website only

- **Crop (C)** — drag the area to keep, ✓/Enter applies, ✕/Escape cancels; undo restores the previous crop
- **Download** — save the annotated image as a PNG (`markup.png`) from the toolbar or ⇧⌘S
- **Auto paste** — loads the clipboard image automatically when you open or return to the tab (gear menu)

### Extension only

- Annotations anchor to the page: scroll and they stay on the section you drew them on; keep scrolling and drawing
- **Capture** — scroll-and-stitch screenshot from the page top to just below the lowest annotation (fixed/sticky headers are hidden after the first chunk so they don't repeat), PNG to clipboard
- Esc or ✕ exits markup mode; press the extension button again (or the suggested shortcut ⌥⇧M) to toggle

## Run the website locally

The website is static files in `public/`. There is no local-dev or Wrangler preview script; after a sync you can open the page in a browser.

```sh
npm ci
npm run sync
```

Then open `public/index.html` in a browser. `npm run sync` is required after clone and after any edit to `shared/`, because `public/shared/` is a generated copy and is not in git.

## Load the Chrome extension

1. From this repo, run `npm ci` and `npm run sync` so `extension/shared/` is populated.
2. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and pick the `extension/` folder in this repo.
3. Pin "Andrew's Markup" and click it on any page to enter markup mode. Click it again (or press Esc / ✕) to leave.

After you change `shared/`, run `npm run sync` again and hit ⟳ on the extension in `chrome://extensions`.

Permissions: `activeTab` + `scripting` (runs only when you click the button) and `storage` (remembers the hand-drawn setting). No debugger, no background access to your browsing.

## How it's built

```
shared/     ← THE editor: markup-core.js (engine), toolbar.js (UI builder), toolbar.css
public/     ← website: index.html (shell) + app.js (image/crop/copy glue) + synced shared/
extension/  ← MV3 extension: manifest, background.js (inject + captureVisibleTab),
              content.js (shadow-DOM overlay on the live page) + synced shared/
scripts/    ← sync.mjs (copy shared/ into both), zip-extension.mjs (package a zip),
              verify/ (headless-browser test harnesses)
```

Edit **only** `shared/` for editor changes. `public/shared/` and `extension/shared/` are gitignored copies. `npm run sync` refreshes them.

`npm run build` (same as `npm run zip`) syncs the editor and packages `extension/` into `public/markup-extension.zip`. That zip is also gitignored; the website gear menu can serve it after a build.

## Deploying the website

The site is a Cloudflare Worker that serves the static files in `public/`. Pushing to `main` automatically builds and deploys the production Worker through Cloudflare Workers Builds. Pull requests and other branches produce preview versions without replacing production.

For a deliberate deploy from your machine, run `npm run deploy`. That builds the extension zip and runs Wrangler. The Cloudflare edge cache can serve the previous version for about a minute after a deploy.

## Tests

```sh
npm test
```

That syncs `shared/`, then runs both end-to-end suites (`scripts/verify/verify-site.js` and `scripts/verify/verify-extension.js`). Run either script directly when you are working on only one surface.

Both use headless Chromium via the repo's Playwright dependency. They write screenshots to the OS temporary directory. The extension harness loads a test build with host permissions added, because automation cannot produce the `activeTab` click.
