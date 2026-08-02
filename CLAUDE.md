# Markup Tool agent instructions

This is the single canonical instruction file for both Claude Code and Codex.
Do not create an `AGENTS.md`; Codex is configured in `.codex/config.toml` to use
this file when `AGENTS.md` is absent.

## Project structure

- `shared/` is the canonical editor implementation.
- `public/` contains the website shell and generated copies from `shared/`.
- `extension/` contains the Chrome extension and generated copies from `shared/`.
- Never edit `public/shared/` or `extension/shared/` directly. Run `npm run sync`.

## Required workflow

1. Install dependencies with `npm ci` when needed.
2. Make the smallest focused change that satisfies the request.
3. Run `npm run build` after any editor, website, extension, or packaging change.
4. Run `npm test` for behavior changes. The suites write screenshots to the OS
   temporary directory; inspect relevant screenshots when visual behavior changes.
5. Do not commit generated `public/shared/`, `extension/shared/`, or
   `public/markup-extension.zip`; the Cloudflare build regenerates them.

## Deployment

- `main` is production and is automatically deployed by Cloudflare Workers Builds.
- Other branches and pull requests are previews and must not replace production.
- Prefer a focused branch and pull request. Merge only after checks pass.
- Never add Cloudflare or GitHub tokens to the repository.

See `docs/AUTOMATED-DEPLOYMENT.md` for the setup and recovery procedure.
