# Andrew's Markup — paste, annotate, copy

A single-page markup tool: paste text or an image, annotate it, and copy the result.

**Live:** https://markup.codeshiftagent.com/

## How it's built

- One self-contained HTML file: [public/index.html](public/index.html) — no build step, no dependencies.
- Served as static assets by a Cloudflare Worker named `markup` (see [wrangler.jsonc](wrangler.jsonc)).

## Deploying changes

From this folder:

```sh
npx wrangler deploy
```

That republishes `public/` to the `markup` worker, which is mapped to markup.codeshiftagent.com.
