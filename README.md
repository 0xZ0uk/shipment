# Shipment

A Payload 4 + TanStack Start template on Cloudflare Workers (D1 + R2), and the in-house Payload plugins it uses, in one pnpm + Turborepo workspace.

| Path | Package | What it is |
| --- | --- | --- |
| [`apps/web`](apps/web) | `@shipment/web` | The template app: Payload admin + TanStack Start frontend, deployed as one Worker. See its [README](apps/web/README.md). |
| [`packages/payload-seo-analyzer`](packages/payload-seo-analyzer) | `@shipment/payload-seo-analyzer` | SEO analysis plugin (Payload 4 port of `@consilioweb/payload-seo-analyzer`). See its [README](packages/payload-seo-analyzer/README.md). |
| [`packages/payload-plugin-socials`](packages/payload-plugin-socials) | `@shipment/payload-plugin-socials` | Social publishing to Pinterest, Instagram, Facebook Pages and Google Business Profile (Payload 4 port of `payload-plugin-socials`). Registered in the app, but off until `SOCIALS_ENCRYPTION_KEY` is set (the app composes Pinterest only). See its [README](packages/payload-plugin-socials/README.md). |
| [`packages/payload-plugin-ab`](packages/payload-plugin-ab) | `@shipment/payload-plugin-ab` | A/B testing: page variants with traffic shares in the admin, and a framework-agnostic request resolver (Payload 4 port of `@focus-reactive/payload-plugin-ab`). Registered on Pages; `loadPage` routes visitors. See its [README](packages/payload-plugin-ab/README.md). |
| [`packages/payload-plugin-mcp`](packages/payload-plugin-mcp) | `@shipment/payload-plugin-mcp` | Our fork of `@payloadcms/plugin-mcp` (MCP server at `POST /api/mcp`) with an OAuth 2.1 server, so ChatGPT and claude.ai can connect. Pinned to one Payload version, not the catalog. It replaces upstream and keeps its plugin slug: never install both. Registered in the app (see its [README](apps/web/README.md#mcp)). See the plugin's [README](packages/payload-plugin-mcp/README.md). |
| [`packages/payload-plugin-assistant`](packages/payload-plugin-assistant) | `@shipment/payload-plugin-assistant` | Admin assistant: chat with the content through the MCP tools (TanStack AI + OpenRouter, a Durable Object per conversation). Registered in the app at `/admin/assistant` (see the app's [README](apps/web/README.md#assistant)). See its [README](packages/payload-plugin-assistant/README.md). |
| [`packages/onpage`](packages/onpage) | `@shipment/onpage-*` | On-page editing ("Edit on page"): five packages (`core`, `plugin`, `react`, `lexical`, `tanstack-start`), our fork of [payload-onpage](https://github.com/jellologic/payload-onpage). Registered in the app through `onpage()`. See its [README](packages/onpage/README.md). |

## Quick start

```sh
echo "PAYLOAD_SECRET=$(openssl rand -hex 32)" > apps/web/.env.development.local
pnpm install
pnpm web migrate
pnpm dev
```

`pnpm web migrate` builds the local D1 database from the committed migrations; run it again after pulling new ones. `pnpm dev` builds the plugins once, keeps them rebuilding on change (`tsup --watch`; the onpage packages have no watch mode, so rebuild them with `pnpm turbo run build --filter='./packages/onpage/*'`), and starts the app at `http://localhost:3000`.

## Commands

| Command | Runs |
| --- | --- |
| `pnpm dev` | Plugins in watch mode + the app's dev server |
| `pnpm build` | `build` in every package, plugins first |
| `pnpm typecheck` / `pnpm lint` | Across all packages |
| `pnpm test` | Package unit tests + the app's integration and e2e tests |
| `pnpm test:int` | The app's Local API integration tests |
| `pnpm web <script>` | Any app script, e.g. `pnpm web migrate:create`, `pnpm web run deploy` (`run` is needed: `deploy` is also a pnpm command), `pnpm web generate:importmap` |
| `pnpm --filter @shipment/payload-seo-analyzer <script>` | Any plugin script |

Turbo caches `build`, `typecheck` and `lint`; anything that depends on a plugin builds it first (`dependsOn: ["^build"]`).

## Workspace conventions

- **Shared versions live in the pnpm catalog** (`pnpm-workspace.yaml`): `payload`, every `@payloadcms/*` package, React and TypeScript. Packages reference them as `"catalog:"`. Upgrade Payload by editing the catalog once. Keeping them shared also guarantees one copy of `payload` and `@payloadcms/ui` at runtime; two copies break the admin's React contexts.
- **Plugins** go in `packages/<name>`, named `@shipment/<name>`, `"private": true`, built with tsup to `dist/`, and consumed by the app as `"workspace:*"`. Declare `payload` / `@payloadcms/ui` / `react` as peer dependencies and take the dev versions from the catalog.
- **onpage is the exception**: its five packages live in `packages/onpage/*` (named `@shipment/onpage-*`) and build with `tsc -b`, one output file per source, which keeps `'use client'` and the lazy editor chunk. Its tests, lint and typecheck run from `packages/onpage` (`@shipment/onpage`). Read its [README](packages/onpage/README.md) before changing it.
- **Plugin admin UI** follows [`packages/payload-seo-analyzer/src/ui/README.md`](packages/payload-seo-analyzer/src/ui/README.md): `@payloadcms/ui` components and Payload 4 tokens only.
- **Upstream code** imported with `git subtree` keeps its history. Pull upstream fixes with `git subtree pull --prefix=packages/<name> <repo-url> <branch>`.

## CI and code review

- **CI** (`.github/workflows/ci.yml`) runs on every PR and push to `master`.
  - The checks job runs lint, typecheck, the plugins' and onpage's unit tests, the app's integration tests and the production build. It also fails when the Payload schema changed without a migration, or when the import map or generated types are stale.
  - The e2e job migrates a fresh local D1 and runs the Playwright suite (frontend, admin and SEO views).
  - It needs no secrets.
- **Reviews:** [Pullfrog](https://docs.pullfrog.com) reviews PRs with DeepSeek V4.1 Flash on OpenCode Go (`.github/workflows/pullfrog.yml`). Its instructions and console setup are in [`.github/pullfrog/`](.github/pullfrog/README.md).
- Workflow actions are pinned to commit SHAs, and Dependabot bumps them.
