# Automated agent-to-production setup

This repository is configured so either Codex or Claude Code can edit the same
codebase, publish a reviewed change to GitHub, and let Cloudflare deploy it.

## How this project works

1. The agent reads the root `CLAUDE.md`. Codex finds it through
   `.codex/config.toml`; Claude Code reads it natively.
2. The agent creates a focused branch, changes the code, runs `npm run build` and
   the relevant tests, then opens a pull request.
3. Cloudflare creates a preview for non-production branches.
4. Merging to `main` triggers the production build and deployment.
5. The agent verifies the public URL before reporting completion.

Cloudflare Workers Builds settings for this project:

- Repository: `thenextnewthing/markup-tool`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Worker name in `wrangler.jsonc`: `markup`

No deploy token belongs in GitHub. Cloudflare's GitHub App grants repository
access, while Cloudflare performs the deployment inside its own build system.

## Reusing this for another project

An agent can perform nearly all of this setup. Ask it to:

> Set up this GitHub project for agent-driven Cloudflare deployment like the
> markup-tool project. Use one root CLAUDE.md for Claude Code and Codex, add the
> Codex fallback config, make the build portable on Cloudflare Linux, connect
> Workers Builds to the repository, deploy main automatically, create previews
> for branches, and verify the live URL. Also add a project-specific copy of this
> deployment guide. Stop only if an account approval, password, 2FA, or CAPTCHA
> requires me.

For each new project, the agent should verify these items rather than copy values
blindly:

- The correct GitHub owner/repository and Cloudflare account.
- The production branch and Worker name.
- A deterministic build command and deploy command.
- The output/assets directory in `wrangler.jsonc`.
- Environment variables and secrets, added in Cloudflare settings rather than Git.
- A health check or visible marker that proves the public deployment is current.

## Recovery

If a deployment fails, open Cloudflare **Workers & Pages → the Worker → Builds**,
inspect the failed build log, fix the repository, and push another commit. If Git
access was revoked, reconnect it under **Settings → Build → Git repository**.
Rolling back a bad production release should be done from Cloudflare's deployment
history, followed by a corrective pull request so Git and production converge.
