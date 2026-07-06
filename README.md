# Andrew's Markup — paste, annotate, copy

A single-page markup tool: paste a screenshot, annotate it, and copy the result back to the clipboard.

**Live:** https://markup.codeshiftagent.com/

## Features

- Paste (⌘V), drag & drop, or auto-paste an image to start
- Pen, highlighter, arrow, Skitch-style tapered arrow, text, box, and oval tools with keyboard shortcuts (P/H/A/S/T/R/O)
- **Text** with a Skitch-style contrast halo (white outline on dark colors, dark on light) so it reads on any background; multi-line via Shift+Enter
- **Click-to-grab** — with any tool active, clicking an object's stroke selects it: drag to move, Delete key or the red ✕ to remove; clicking empty space (even inside a box) draws as usual; undo/redo covers moves and deletes
- 8 colors, 5 stroke sizes (S–XXL)
- **Hand-drawn mode** — renders arrows, boxes & ovals with a sketchy, wobbly look; toggling restyles everything already drawn (in the gear menu)
- **Auto paste** — loads the clipboard image automatically when you open or return to the tab (in the gear menu)
- Undo/redo (⌘Z / ⇧⌘Z), start over, copy result (⇧⌘C)
- Settings persist in localStorage

## How it's built

- One self-contained HTML file: [public/index.html](public/index.html) — no build step, no dependencies.
- Served as static assets by a Cloudflare Worker named `markup` (see [wrangler.jsonc](wrangler.jsonc)).

## Deploying changes

From this folder:

```sh
npx wrangler deploy
```

That republishes `public/` to the `markup` worker, which is mapped to markup.codeshiftagent.com. Note: the Cloudflare edge cache can serve the old version for ~a minute after a deploy.

## Verifying changes

See [.claude/skills/verify/SKILL.md](.claude/skills/verify/SKILL.md) for the headless-Playwright recipe used to test the app end-to-end (synthetic paste, drawing via mouse events, screenshots).
