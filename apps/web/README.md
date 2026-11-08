# Shipment

A Payload 4 + TanStack Start template that runs as a single Cloudflare Worker, with **D1** for the database and **R2** for media.

> [!IMPORTANT]
> Payload's TanStack Start adapter is only available in the Payload 4 beta. The Worker bundle is larger than the free plan's script-size limit, so deploying needs a paid Workers plan.

## Quick Start

### Development

The app lives in `apps/web` of the Shipment monorepo (see the [root README](../../README.md)).

1. `echo "PAYLOAD_SECRET=$(openssl rand -hex 32)" > apps/web/.env.development.local`
2. `pnpm install && pnpm web migrate && pnpm dev` from the repo root
3. Open `http://localhost:3000/admin` and create your first user.

`pnpm dev` at the root builds the workspace plugins, keeps them rebuilding on change, and runs TanStack's Node dev server. Wrangler's `getPlatformProxy` provides a local D1 database (stored in `.wrangler/state`). It gets its schema from the committed migrations, like production: run `pnpm migrate` after pulling new migrations or creating one. Payload's dev schema push is off (`push: false`) because it rebuilds tables with `DROP TABLE`, which on D1 cascade-deletes their child rows. Media uploads go to the local `media/` directory.

### Environment variables

[Varlock](https://varlock.dev) loads and validates env vars against [`.env.schema`](./.env.schema), which lists every variable and whether it's sensitive. `APP_ENV` picks the environment (`development` by default, `production` for deploys). Keep values in gitignored `.env.[APP_ENV].local` files, or pass them in the process environment. `pnpm exec varlock load` shows what resolves. The Node scripts run under `varlock run`, the Worker build uses `varlockCloudflareVitePlugin`, and deploys use `varlock-wrangler`. After changing the schema, run `pnpm cf-typegen` to update `env.d.ts` and `cloudflare-env.d.ts`.

### Preview in the Workers runtime

`pnpm preview` builds the Worker and serves it from workerd at `http://localhost:4173`, with the same runtime and storage path as production. It uses a local D1 database and a local R2 bucket (no remote resources). Run `pnpm migrate` first so the local database has the schema.

## Deployment

Create the Cloudflare resources once:

```bash
pnpm wrangler login
pnpm wrangler d1 create shipment
pnpm wrangler r2 bucket create shipment-media
```

Put the production secret in `.env.production.local` (`PAYLOAD_SECRET=...`), or set `PAYLOAD_SECRET` in your CI environment. If you're migrating an existing Worker, reuse its current value; a new value logs every user out.

> [!IMPORTANT]
> [`wrangler.jsonc`](./wrangler.jsonc) ships with the `database_id` of the template's own D1 database, which your account can't reach. **Replace it with the `database_id` printed by `d1 create`** before you run `pnpm run deploy`, or the migrations and the deploy fail.

Then add the bucket's lifecycle rule. It expires the SEO analyzer's cache objects under `seo-analyzer/cache/` after 7 days, so keys left behind by an old config or locale don't pile up. Cache entries live 15 minutes anyway; if a key that's still in use expires (an invalidation marker on a site with no edits for a week), the next request just rebuilds.

```bash
pnpm r2:lifecycle
```

If you rename the Worker, database or bucket, update the names in `wrangler.jsonc` (and in the `r2:lifecycle` script) too, then run `pnpm cf-typegen`. The assistant's `ASSISTANT_SELF` service binding names the Worker itself (`"service": "shipment"`), so it must follow a rename. The `ratelimits` bindings in `wrangler.jsonc` use account-wide `namespace_id`s: give each Worker on the account its own ids, or they share counters. Workers Rate Limiting is approximate (counts sync between machines eventually), so a burst can get past the limit.

Wrangler stores the local D1 database under `.wrangler/state` by `database_id`, so changing the id gives `pnpm dev` a new, empty local database. To keep your local data, change the id before you start developing. Otherwise, copy the old `.sqlite` file in `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` to the new file name.

Whenever the Payload schema changes, create a migration, apply it to your local database and commit it:

```bash
pnpm migrate:create
pnpm migrate
```

Read the generated SQL before committing. When a change rebuilds a table (`CREATE TABLE __new_x … DROP TABLE x`), D1 ignores the `PRAGMA foreign_keys=OFF` around it, so dropping `x` deletes or nulls every row that references it. Copy those rows aside first and put them back afterwards; `20261105_163314_page_blocks.ts` shows how. Test the migration on a local database that has content, not an empty one.

Then deploy:

```bash
pnpm run deploy
```

The Worker's entry is [`src/server.ts`](./src/server.ts): TanStack Start's `fetch` plus a `scheduled` handler. A Cron Trigger (`triggers.crons` in `wrangler.jsonc`, every 5 minutes) runs the due Payload jobs through it. Today that's the SEO analyzer's `seo` queue, which finishes dashboard audits too big for one request. To run a tick locally against `pnpm preview`, open `/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`.

The assistant's two Durable Object classes (`AssistantConversation`, `AssistantConversationIndex`, re-exported from `src/server.ts`) are declared in the `exports` field of `wrangler.jsonc`, Wrangler's declarative replacement for the `migrations` array. The first `pnpm run deploy` creates their namespaces (SQLite storage); there's nothing to create by hand. Keep in mind:

- Durable Object classes are created and deleted only by `wrangler deploy`. `wrangler versions upload` refuses a config with `exports` entries, so gradual deployments and preview (version) URLs aren't available for this Worker.
- Rollbacks can't cross a lifecycle change (adding, renaming or deleting a class).
- Once deployed with `exports`, the Worker can't go back to `migrations`. Removing a class means marking it `"state": "deleted"`, which deletes all of its data.
- An object's storage type (SQLite) is fixed once its namespace exists.

`pnpm run deploy` (not `pnpm deploy`, which is pnpm's own command) applies migrations to the remote D1 database, runs `PRAGMA optimize`, builds the Worker with `APP_ENV=production` and deploys it with `varlock-wrangler`. Non-sensitive values become Worker vars and sensitive ones become secrets. `varlock-wrangler deploy` replaces the Worker's vars and secrets with the schema's, so define any new ones in `.env.schema` rather than the dashboard. The build fails if `PAYLOAD_SECRET` doesn't resolve for production. If you add a named Wrangler environment, set `CLOUDFLARE_ENV` so the migration commands use the same bindings.

### Deploying to staging

Deploy-only behaviour (the assistant's Durable Objects, the `ASSISTANT_SELF` service binding, Workers Rate Limiting) can't be tried on a preview URL: `wrangler versions upload` refuses a config with Durable Object `exports`. Use the `staging` Wrangler environment instead: a second Worker, `shipment-staging` on `workers.dev`, with its own D1 databases, R2 bucket, Durable Object namespaces, rate-limit counters (`namespace_id` 1101–1105) and Analytics Engine datasets (`shipment_ab_staging`, `shipment_assistant_audit_staging`). Production's resources are never referenced by it. Its `ASSISTANT_SELF` binding points at `shipment-staging`, so the assistant's tool calls stay on staging.

Create the resources once, in the account that holds production, and put the printed `database_id`s in `env.staging.d1_databases` in `wrangler.jsonc`:

```bash
export CLOUDFLARE_ACCOUNT_ID=<account id>   # `wrangler whoami`; needed when the login sees several accounts
pnpm wrangler d1 create shipment-staging
pnpm wrangler d1 create shipment-seo-staging
pnpm wrangler r2 bucket create shipment-media-staging
pnpm r2:lifecycle:staging
```

Staging has its own `APP_ENV`, so varlock reads its values from `.env.staging.local` (gitignored), not production's:

```bash
echo "PAYLOAD_SECRET=$(openssl rand -hex 32)" > .env.staging.local
echo "OPENROUTER_API_KEY=..." >> .env.staging.local   # optional: the assistant and SEO AI features
```

Keep that `PAYLOAD_SECRET` for later deploys (a new one logs everyone out and invalidates API keys). Never set `ASSISTANT_TEST_MODEL` there; `APP_ENV=staging` ignores it anyway. Then deploy:

```bash
pnpm run deploy:staging
```

It runs `migrate:staging` and `seo-store:migrate:staging` (the Payload CLI and the SEO store against the staging D1s, through `CLOUDFLARE_ENV=staging`), `PRAGMA optimize`, then builds with `APP_ENV=staging CLOUDFLARE_ENV=staging` and deploys with `varlock-wrangler deploy`. The Cloudflare Vite plugin writes the staging environment, flattened, into `dist/server/wrangler.json`, which `wrangler deploy` picks up, so the deploy step takes no `--env`. The first deploy creates the Durable Object namespaces. Open `/admin` on the printed URL to create the first user. Staging runs no scheduled jobs: `env.staging` sets `triggers.crons` to `[]` (an environment inherits `triggers`), and the deploy clears the Worker's schedule (#116). To try a scheduled job there, put the cron back for that deploy, or open `/cdn-cgi/handler/scheduled` against `pnpm preview` locally.

To remove staging, delete the Worker (which deletes its Durable Objects) and the resources: `pnpm wrangler delete --name shipment-staging`, `pnpm wrangler d1 delete shipment-staging`, `pnpm wrangler d1 delete shipment-seo-staging`, then empty and delete the bucket (`pnpm wrangler r2 bucket delete shipment-media-staging`).

## Staying under D1's 10 GB limit

A D1 database is capped at 10 GB. Most Payload sites never get close, as long as heavy or ever-growing data stays out of D1. This template is set up for that:

- **Media lives in R2.** `@payloadcms/storage-r2` stores the files, and D1 only keeps their metadata. The R2 adapter is enabled only in the Workers runtime; `pnpm dev` writes to local disk instead.
- **Versions are capped at 20 per document.** The `limitVersions` plugin (`src/plugins/limitVersions.ts`) applies the cap to every versioned collection (`maxPerDoc`) and global (`max`) that doesn't set its own. Payload's default is 100.
- **Finished jobs are deleted.** `jobs.deleteJobOnComplete` is on, so completed jobs and their logs don't pile up.
- **Logs go to Workers Logs**, not the database (`observability` is enabled in `wrangler.jsonc`).

When you add features that produce append-only data, keep it out of the main D1 database:

| Data                                     | Where it should go                         |
| ---------------------------------------- | ------------------------------------------ |
| Analytics, page views, events            | Workers Analytics Engine                   |
| Form submissions                         | A separate D1 database, or R2 for archives |
| Audit/activity logs, exports, large JSON | R2 (or Workers Logs for operational logs)  |

Short-lived, event-shaped audit trails can go to Analytics Engine too (the assistant's write log does, see [Assistant](#assistant)); its data is kept 3 months, so archive to R2 what must last longer.

## Useful commands

Run these inside `apps/web`, or from the repo root as `pnpm web <command>` (e.g. `pnpm web migrate:create`).

| Command                   | Purpose                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                | Node dev server with local D1 and local-disk media                                                                    |
| `pnpm build`              | Build the Worker and static assets                                                                                    |
| `pnpm preview`            | Build and run in local workerd (local D1 + R2)                                                                        |
| `pnpm run deploy`         | Migrate remote D1, build and deploy                                                                                   |
| `pnpm run deploy:staging` | The same for the staging Worker (see Deploying to staging)                                                            |
| `pnpm r2:lifecycle`       | Add the R2 rule that expires stale SEO cache objects                                                                  |
| `pnpm generate:types`     | Regenerate Cloudflare (`cloudflare-env.d.ts`) and Payload types                                                       |
| `pnpm migrate:create`     | Create a migration in `src/db/migrations`                                                                             |
| `pnpm migrate`            | Apply migrations to the local D1 database                                                                             |
| `pnpm migrate:remote`     | Apply migrations to the remote D1 database                                                                            |
| `pnpm test:int`           | Run Local API integration tests                                                                                       |
| `pnpm test:e2e`           | Run Playwright against `pnpm dev` (`E2E_PORT`, default 3000; `E2E_BASE_URL` for a server you started on the local D1) |
| `pnpm lint`               | Run ESLint                                                                                                            |

## How it works

### Runtime bindings

`src/payload.config.ts` imports its Cloudflare bindings from `#cloudflare-runtime`, which resolves to one of two modules:

- `src/runtime/cloudflare.ts` for builds and `pnpm preview`. It reads the bindings from `cloudflare:workers`.
- `src/runtime/node.ts` for `pnpm dev`, tests and the Payload CLI. It gets the bindings from Wrangler's `getPlatformProxy`. `migrate:remote` sets `PAYLOAD_MIGRATE_REMOTE=true`, which points D1 at the remote database. That's why D1 is marked `"remote": true` in `wrangler.jsonc`; dev and preview opt out of remote bindings, so they stay local.

`vite.config.ts` only adds `@cloudflare/vite-plugin` (through `varlockCloudflareVitePlugin`) for builds and `pnpm preview`. A small build-only plugin bundles the packages Payload normally leaves external, because workerd has no Node module loader.

### Collections

See the [Collections](https://payloadcms.com/docs/configuration/collections) docs for details on how to extend this functionality.

- **Users (Authentication):** auth-enabled collection with access to the admin panel. See the [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) docs.
- **Pages:** the website's pages, ported from Payload's `website` template. Each page has a hero (`src/heros`), a `layout` of blocks (`src/blocks`: Call to Action, Content, Media) and an SEO tab from `@payloadcms/plugin-seo`, analyzed by the workspace plugin `@shipment/payload-seo-analyzer` (score sidebar, `/admin/seo` dashboard, redirects, sitemap/robots under `/api/seo-plugin`). Pages have drafts with autosave, a preview button and live preview.
- **Posts / Authors / Categories:** the blog. Posts have a title, excerpt, cover, rich-text `content`, `publishedAt`, authors and categories, the same SEO tab as Pages, drafts with autosave, live preview, on-page editing and a Socials tab. Authors (public bylines, not admin users) and categories are plain collections that anyone can read. `POST /api/seed/blog` (also run by `POST /api/seed/home`) adds example authors, categories and posts, skipping slugs that exist.
- **Header / Footer (globals):** up to six navigation links each, pointing at a page or a custom URL.
- **Media:** upload-enabled collection, stored in R2 in production. Cropping and focal points are disabled because they need `sharp`, which Workers can't run. The optional `caption` is rendered under media blocks.
- **Folders / Tags:** used to organise media.

### Frontend

Pages render at `/$slug` (`src/app/_frontend/$slug.tsx`). The page with the slug `home` renders at `/`, and `/home` redirects there. Until a `home` page exists, `/` shows a static placeholder (`src/collections/Pages/homeStatic.ts`). Both routes load data through the `loadPage` server function in `src/app/_frontend/pages.functions.ts`, which queries the Local API with the visitor's access, so anonymous visitors only see published pages. `head()` turns each page's SEO fields into the title, description and Open Graph tags.

**Blog.** Posts render at `/blog/$slug` (`src/app/_frontend/blog.$slug.tsx`, loaded by `loadPost` in `blog.functions.ts`, with the same draft, preview-link and on-page handling as pages). The archive is `/blog` and `/blog/page/<n>`, each category's at `/blog/category/<slug>` (and `/page/<n>`), nine posts a page, newest first; `/page/1` redirects to the bare path, and pages past the last are 404s. `/blog/rss.xml` is an RSS 2.0 feed of the latest 20 posts, linked from every page's `<head>`. Post pages emit `BlogPosting` and `BreadcrumbList` JSON-LD (`src/utilities/postJsonLd.ts`). The **Latest posts** block (`src/blocks/PostsArchive`) lists the newest posts (optionally of one category) on any page: `loadPage` queries them for each such block, so they're never stale page JSON. Blog URLs come from `src/utilities/postPath.ts`. The SEO analyzer covers posts (`collectionRoutes: { posts: 'blog' }`: sitemap, `llms.txt`, the sidebar), and site search indexes them. Header and footer links to `/blog` are added by editors.

The `_frontend` layout route loads the Header and Footer globals once per full page load (`src/app/_frontend/layout.functions.ts`); client-side navigation reuses them. When a page has a high-impact hero, the header switches to its dark theme so it stays readable over the image. Pages that don't exist render the 404 inside the layout, with the header and footer.

Drafts render only for logged-in users who add `?draft=true`, which is the URL the admin's Preview and Live Preview use. In live preview, `LivePreviewListener` reloads the route data each time the document saves. Every request is server-rendered from D1, so publishing needs no revalidation step.

**Edge caching (Workers Cache, prepared but not enabled yet).** Responses are private unless they opt in: `src/server.ts` gives every response without a `Cache-Control` header `private, no-cache` (the admin, the REST API, `/api/users/me`, server functions, 404s, redirects), because Workers Cache keys by URL alone and would otherwise store a 200 for two hours and serve it to everyone. Only a full HTML document of a published page, when `SITE_URL` is set (the cache key has no hostname, so cached HTML must not contain URLs built from the request's host), for a request with no on-page mode, preview link, `?draft=true`, A/B experiment or cookie set, opts in (`isPublicPageView` in `src/utilities/cacheControl.ts`): browsers revalidate every time, the edge keeps it 5 minutes and serves it stale for up to a day while re-rendering, and it's tagged `page:<path>` and `layout`. Publishing purges those tags from inside the Worker (`src/plugins/edgeCachePurge.ts`): a page's path on publish, unpublish and delete; `layout` (every page) when the header, the footer, a file, a reusable section, or a page's title, slug or visibility changes; a page's path when its A/B manifest or a redirect from it changes. The blog opts in the same way: post pages are tagged with their path, `layout` and their authors' and categories' tags (`author:<id>`, `category:<id>`); the archives, the feed (when `SITE_URL` is set) and pages with a Latest posts block carry `posts`. A change to a post's published version purges its path and `posts`; a change to an author or a category purges `posts` and its own tag. Turning the cache on (`"cache": { "enabled": true }` in `wrangler.jsonc`) is a separate step, after on-page editing and preview links get their own URL (#162).

A/B tests (`@shipment/payload-plugin-ab`, registered in `src/payload.config.ts`): the **Variants** panel in a page's sidebar clones it into variants (`<slug>--<hash>`, created as drafts) and sets each one's share of traffic. Once a variant is published, `loadPage` assigns each visitor of the original's URL a bucket (sticky, by the `payload_ab_bucket_<path>` cookie) and renders that bucket's page there. Drafts, live preview, on-page editing and preview links always show the page asked for. Pages with an experiment are sent `Cache-Control: private, no-store`; other pages are unaffected. The manifest of which pages run experiments is read through the Workers Cache API (`src/plugins/abTesting.ts`): its entries are per data centre, so a change can take up to 30 seconds to reach visitors served elsewhere. Variants get no "Edit on page"; edit them in the panel's drawer. Visitors only reach a variant through the original's URL: a published variant asked for at its own URL answers with a 302 to the original's (editors in draft, preview or on-page mode can still open it there). Every page emits a `<link rel="canonical">`, and it, `og:url` and the JSON-LD URLs use the requested slug, so a served variant (or one an editor opens) points at the original. The SEO analyzer's `excludeDocs` option leaves variants out of `sitemap.xml` and its extensions, `llms.txt`, IndexNow and the whole-site scans; the sidebar still scores a variant you open.

A/B measurement (`src/plugins/abMeasurement.ts`) writes to Workers Analytics Engine (`AB_ANALYTICS`, dataset `shipment_ab` in `wrangler.jsonc`; no personal data). `loadPage` counts an **impression** once per visitor, experiment run and bucket (an HttpOnly `payload_ab_seen_<path>` cookie holding `<bucket>:<run>` marks the visitor as counted, so server-function re-runs on client navigation don't add more; the run's start comes from the manifest entry, so this costs no extra read), and a click on a **call-to-action** block's link posts a **conversion** to `/api/_ab/convert`, which reads the bucket from the visitor's cookies and counts once per visitor, run and bucket too. That endpoint is unauthenticated, so it's rate-limited per client IP (`AB_RATE_LIMIT_CONVERT` in `wrangler.jsonc`, 20 a minute; over that it answers 429 and records nothing). An experiment's run ends when its page has no published variant left; publishing one again starts a new run, counted from then. The Variants panel shows impressions, conversions and rate per bucket since the experiment started, read through the Analytics Engine SQL API: set `AB_ANALYTICS_ACCOUNT_ID` and `AB_ANALYTICS_API_TOKEN` (a token with only "Account Analytics: Read"); without them the panel says measurement isn't configured. Analytics Engine keeps 90 days of data, so an experiment older than that only counts its last 90 days. Local dev stores nothing (no real dataset).

**GA4 (optional, next to Analytics Engine).** Set `GA_MEASUREMENT_ID` (a `G-XXXXXXXXXX` id from Google Analytics > Admin > Data streams; it's public, not a secret: set it in `.env.production`, like `SITE_URL`) and public pages show a cookie banner; gtag.js (`async`, from `https://www.googletagmanager.com/gtag/js?id=…`) loads only once the visitor accepts (see **Cookie consent** below; the page's `<head>` only carries the inline `gtag` stub, `gtagScripts` in `src/utilities/googleAnalytics.ts`); a page that runs an experiment also renders the plugin's `<ExperimentTracker>`, which tags GA4 events with the experiment, the visitor's bucket and their visitor id. Unset, nothing GA-related renders or loads: no script tag, no inline snippet, no request. `loadPage` returns the id as `gaMeasurementId`, and `null` for every draft (live preview, on-page editing, preview links) and for 404s and redirects, so those never load it; the admin isn't a frontend route and never does. Create these **event-scoped custom dimensions** in GA4 (Admin > Custom definitions) to report on them; the parameter names are what the tracker sets:

| Dimension name | Event parameter                                                |
| -------------- | -------------------------------------------------------------- |
| A/B experiment | `fr_ab_experiment` (the page's path, e.g. `/pricing`)          |
| A/B variant    | `fr_ab_variant` (the bucket: `original` or the variant's slug) |
| A/B visitor ID | `fr_ab_visitor_id`                                             |

The tracker reads the experiment (`exp_<path>`) and visitor id (`ab_visitor_id`) cookies the A/B resolver already sets; they aren't HttpOnly, and nothing is added to the page for it beyond the experiment's path. The bucket and visitor id go to GA4 as `fr_ab_*` parameters, so mention them in your privacy policy (the banner can link to it). On a full page load the first page view carries the dimensions (`GoogleAnalyticsConfig` sends GA4's `config` after the tracker's `set`, and gtag runs its queue in order); on client-side navigation the tracker sets them again when an experiment page mounts, and they apply to the events GA4 sends after that. GA4 and Analytics Engine **don't count the same thing**: GA4 counts events, users and sessions (every page view, filtered by its own consent, ad-blockers and sampling), while Analytics Engine counts one impression per visitor, experiment run and bucket, and one conversion per visitor, run and bucket, server-side and unaffected by blockers. Expect GA4 numbers to be larger for views and smaller for users, and don't compare the two directly.

**Cookie consent (GA4, Basic mode).** With `GA_MEASUREMENT_ID` set, published pages show a banner (`src/components/CookieConsent`) with equally weighted **Accept** and **Reject** buttons, fixed over the bottom of the page (no layout shift, no focus trap; Escape hides it for the current page load without choosing). Nothing requests googletagmanager.com until the visitor accepts: then `GoogleAnalyticsConfig` adds gtag.js and sends `config`, and the plugin's `<ExperimentTracker>` mounts. Reject loads nothing. There's no banner without the id, on drafts, live preview, on-page editing, preview links or 404s (`loadPage` returns no `gaMeasurementId` for them). A **Cookie settings** button in the footer (only when the page may load GA) reopens the banner. Withdrawing consent after accepting sets `window['ga-disable-<id>']`, which stops gtag.js sending anything more on that page, and expires GA's `_ga*`/`_gid` cookies; the next page load doesn't load gtag.js at all. The banner's text (title, description, button labels, the settings link, an optional privacy policy link) is edited in the **Footer** global under "Cookie consent"; empty fields fall back to defaults (`src/components/CookieConsent/copy.ts`).

The choice is stored in a first-party cookie, `cookie_consent=granted|denied` (`Path=/`, `SameSite=Lax`, `Secure` on https, 180 days, not HttpOnly; `src/utilities/cookieConsent.ts`). It is read **only in the browser**, in an effect after hydration: no loader, server function or `<head>` builder reads it, so the server's HTML is byte-identical with or without it and published pages stay cacheable at the edge, where cookies aren't part of the cache key (`tests/int/cookieConsent.int.spec.tsx` checks both). The banner text lives in the Footer global, which already purges the `layout` cache tag when it changes.

Not behind the banner: the A/B **bucket** cookies (`payload_ab_bucket_*`, `exp_*`) are strictly necessary, since they decide which content the visitor is shown and keep it consistent between visits; and the **Analytics Engine** measurement is first-party (server-side, written to your own Cloudflare account, no personal data, nothing sent to a third party). Its only browser state is the plugin's own first-party markers (`payload_ab_seen_*`, `payload_ab_cv_*`, HttpOnly, holding `<bucket>:<run>`) that stop a visitor being counted twice. Check these against your own legal requirements; the visitor id cookie (`ab_visitor_id`) is only sent anywhere by `<ExperimentTracker>`, which runs after consent.

The frontend uses Tailwind CSS 4 (`src/app/_frontend/styles.css`, `tailwind.config.mjs`) with the website template's shadcn/ui tokens. Tailwind only processes that stylesheet, and only frontend routes load it, so admin styles are unaffected. Images are responsive through Cloudflare Images (next section).

### Languages

The site has one locale (`en`) until `LOCALES` lists more (`.env.schema`): `LOCALES=en,pt` adds Portuguese, the first code being the default. Then:

- **URLs.** The default locale stays unprefixed (`/about`, `/blog/hello`); the others get their code (`/pt/about`, `/pt/blog/hello`, `/pt/blog/rss.xml`). Slugs are shared: `/pt/about` is the Portuguese version of `/about`. `/xx/…`, `/en/…` (the default's own code) and `/pt/admin` are 404s. The route tree has no locale segment: a router rewrite (`src/i18n/routing.ts`) routes `/pt/about` as `/about?locale=pt` and puts the prefix back on every link the router builds, so `<Link>`s, redirects and the header's search stay in the visitor's locale. CMS links to a custom path (`/#faq`) get the prefix too. URLs are built with `localizePath` (`src/i18n/locales.ts`) on top of `pagePath` / `postPath`, never by hand.
- **What's translated.** Page and post titles, page layouts (every block's text), post excerpts and bodies, reusable sections, the SEO tab, header and footer link labels and the cookie banner's copy. Slugs, media files, dates and relationships aren't. A page's `layout` is localized as a whole: each locale has its own block list. Until a locale has one, the site shows the default locale's; the admin's "Copy to locale" (document menu) copies it over, and the on-page editor saves a copy on the first edit. Payload keeps each document's draft/published status per locale.
- **Editing.** The admin's locale menu switches the locale you edit; "Publish" publishes that locale. Live preview, the preview button and "Edit on page" open the page in the locale being edited (`/pt/about?draft=true`), and on-page edits save to it.
- **Missing translations.** A page or post that isn't published in a locale shows the default locale's content at its prefixed URL (Payload's field fallback) instead of a 404, marked as a fallback view: canonical to the default-locale URL, `noindex`, no hreflang, and `lang` of the default locale on the content. "Translated" means published in that locale (`translatedLocales` in `src/i18n/server.ts`).
- **SEO.** `<html lang>`, the canonical and `og:url` follow the locale; translated pages list every translation as `<link rel="alternate" hreflang>` plus `x-default` (the default-locale URL), and `og:locale` / `og:locale:alternate`. `sitemap.xml` lists each page and post once per locale it is published in, with `xhtml:link` alternates (the SEO analyzer's `localization` option). JSON-LD URLs carry the prefix and `inLanguage`. `llms.txt` stays the default locale's.
- **Blog.** The archives and the feed exist in every locale and list the default locale's published posts, each in the visitor's locale where translated. `/pt/blog/rss.xml` has `<language>pt</language>` and prefixed links.
- **Search.** The index (SEO_D1) keeps a row per document and locale it is published in (the default locale's rows have `locale = ''`, so enabling a locale needs no reindex of existing rows); the palette and `/search` query the visitor's locale. Run `pnpm search:reindex` once after enabling a locale on a site with translated content.
- **Edge cache.** Every locale's view of a page is tagged with the unprefixed path (`page:/about` on `/pt/about`), so publishing any locale purges them all (the others' hreflang changes too). The locale is in the URL, so it's in the cache key.
- **Redirects** are written for the default locale's paths. `/pt/<from>` first takes a redirect of its own, then `<from>`'s, with the prefix added to a site-relative target (`/old → /new` sends `/pt/old` to `/pt/new`).
- **A/B tests** stay per page: a variant is localized like its page, and the bucket cookie applies in every locale.
- **The language menu** (`src/components/LocaleSwitcher`) in the header links to the current page in each locale.

With one locale none of this renders: no prefix routes, hreflang, `og:locale` or menu, and the same HTML as before localization. The database schema is the same either way (the `_locales` tables exist for everyone; `20261108_121955_localized_content` moved the content into the `en` rows), so changing `LOCALES` needs no migration. It is compiled into the build (the browser routes with it): rebuild after changing it. Changing the default locale of a site that has content isn't supported, since everything written so far belongs to the old default. `pnpm test:e2e:locales` runs the second-locale specs against a dev server with `LOCALES=en,pt`; that server rewrites `src/payload-types.ts` with `pt` in it, so don't commit that.

### Images

Workers can't run sharp, so the Media collection stores originals only and the resizing happens on request, through the [Cloudflare Images binding](https://developers.cloudflare.com/images/optimization/binding/) (`IMAGES` in `wrangler.jsonc`, exposed as `images` by `#cloudflare-runtime`). It works on `workers.dev`, unlike `/cdn-cgi/image/` URLs, which need a zone.

- **`ImageMedia`** (`src/components/Media/ImageMedia`, used by `BlockMedia`) renders `<picture>` with an AVIF and a WebP `<source>`, each with a `srcset` of the widths in `IMAGE_WIDTHS` (`src/utilities/responsiveImage.ts`: 320, 640, 960, 1280, 1920, 2560) up to the image's own width, and the original as the `<img>` (it keeps `width`/`height`, so no layout shift, and `priority`/`loading`). `sizes` defaults to the viewport width capped at the 2xl container; pass `size` to `Media` when an image is narrower. SVG, GIF and videos get the original only.
- **`/img/<R2 key>?w=<width>&f=<avif|webp>&v=<updatedAt>`** (`src/app/img.$.ts`, `src/utilities/serveResizedImage.ts`) reads the original straight from R2 (the key is `<objectKey>/<filename>`, as the storage adapter writes it; no D1 query), resizes it (never upscaling) and re-encodes it. Other widths, formats or parameters are a 400, so the number of variants per image is bounded. Non-images are a 415, and SVG/GIF redirect to the original. When the transform fails (a corrupt file, or the Free plan's monthly limit), it redirects to the original, uncached.
- **Caching.** Variant URLs and media file URLs that carry the `?<updatedAt>` tag (`getMediaUrl`) answer `Cache-Control: public, max-age=31536000, immutable`: replacing a file changes `updatedAt`, so the URL changes too. Untagged media file URLs get `public, max-age=300, stale-while-revalidate=86400`, because re-uploading can keep the filename. Payload's R2 handler sends no `Cache-Control` of its own; a request middleware in `src/start.ts` adds it (`src/utilities/mediaCacheControl.ts`), only for `media` (public read) and only on 200/304 responses without `Set-Cookie`. With Workers Cache enabled, those responses are served without running the Worker.
- **Local dev.** `pnpm dev` (Node) keeps uploads in `media/`, not R2, so pages render the original `<img>` without `srcset` (`responsiveImagesEnabled()` is off under `vite dev` and vitest), and `/img/*` redirects to the original. `pnpm preview` runs Wrangler's offline Images binding (width, height, rotate and format only), which is enough to try the route locally; it isn't billed.
- **Cost.** Images bills **unique transformations**: each source image and parameter set counts once per calendar month, however many times it's served, and the output format doesn't count (AVIF and WebP of one width are one transformation). Every plan includes **5,000 unique transformations a month**; beyond that, the Free plan returns error 9422 for new ones (variants already cached keep working, and the route falls back to the original) and isn't charged, while paid plans pay **$0.50 per 1,000**. With six widths, a page's images cost at most six transformations each per month, fewer for images narrower than 2560 px, so 5,000 covers roughly 800 distinct images a month. See [Images pricing](https://developers.cloudflare.com/images/pricing/).

### MCP

[`@shipment/payload-plugin-mcp`](../../packages/payload-plugin-mcp) (our fork of [`@payloadcms/plugin-mcp`](https://payloadcms.com/docs/beta/plugins/mcp), with an OAuth server) serves an MCP server at `POST /api/mcp` (Streamable HTTP), so AI clients can read and edit content. Every collection gets the built-in tools (`findDocuments`, `createDocuments`, `updateDocument`, `deleteDocuments`, and so on), except that `users` can't be created or deleted over MCP. Tools run with the caller's Payload access control. A request without credentials gets a 401 whose `WWW-Authenticate` header points OAuth clients at the discovery document.

#### ChatGPT and claude.ai (OAuth)

These clients only connect over OAuth. The site is its own OAuth 2.1 authorization server (`oauth: true` in `src/payload.config.ts`): discovery at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` (served by `src/app/[.]well-known.$.ts`), dynamic client registration, PKCE, and a consent page.

- **claude.ai** (a plan with custom connectors): **Settings → Connectors → Add custom connector**, any name, URL `https://<site>/api/mcp`, leave the advanced OAuth fields empty, **Add**, then **Connect**. The Claude desktop and mobile apps use the account's connectors.
- **ChatGPT** (web, a plan with developer mode; the menu names change from time to time): **Settings → Apps & Connectors → Advanced settings**, turn on **Developer mode**. Back in **Apps & Connectors**, **Create** an app: any name, **MCP server URL** `https://<site>/api/mcp`, **Authentication: OAuth**.

The client opens the site in a browser: sign in to the admin (if you aren't), check the client and the address it returns to, and click **Allow**. The client then acts as you, with your permissions. Every user may connect a client; set `oauth.canConnect` to restrict that. See and revoke connections in the admin panel under **AI connections** (each user sees their own; `oauth.canManageAllConnections` can see everyone's). Deleting a connection revokes it at once; removing the connector in ChatGPT or claude.ai doesn't, so delete it in the panel too. Deleting a user revokes their connections, and a connection nobody uses expires after 30 days. Tokens are stored as hashes; access tokens last an hour, refresh tokens rotate. The details are in the [plugin's README](../../packages/payload-plugin-mcp/README.md#oauth).

A connected client can't create users or change anyone's email, password or API key, so revoking the connection really ends its access. Client registration is public: the plugin keeps at most 1,000 never-used registrations, each for an hour, and `OAUTH_RATE_LIMIT_REGISTER` (wrangler.jsonc, 10 per minute per IP) throttles it.

These clients connect from their own servers, so OAuth needs the site on a public HTTPS URL (staging or production, or a tunnel to `localhost`).

#### Claude Code and scripts (API key)

1. In the admin panel, open your user, check **Enable API Key**, and save. Keys are encrypted with `PAYLOAD_SECRET`, so changing the secret invalidates them.
2. Add the server to your client with the header `Authorization: users API-Key <key>`. For Claude Code:

   ```bash
   claude mcp add --transport http payload http://localhost:3000/api/mcp --header "Authorization: users API-Key <key>"
   ```

   Clients that only support stdio can use `npx -y mcp-remote <url> --header "Authorization: users API-Key <key>"`.

In development you can skip auth with `http://localhost:3000/api/mcp?overrideAccess=true`; the endpoint rejects that parameter in production. Configure descriptions, tools, prompts and resources in the `mcpPlugin` call in `src/payload.config.ts`.

### Assistant

[`@shipment/payload-plugin-assistant`](../../packages/payload-plugin-assistant) adds a chat at `/admin/assistant` ("Assistant › Chat" in the admin sidebar) that reads and edits content through the MCP tools above, **as the signed-in admin user**: Payload's access control applies to every call. It runs on [OpenRouter](https://openrouter.ai). Registered in `src/payload.config.ts`, after `mcpPlugin`.

**The key.** Create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) and set it as `OPENROUTER_API_KEY` (`.env.development.local` for `pnpm dev`, `.env.production.local` or CI for deploys; it's `@sensitive`, so `varlock-wrangler deploy` uploads it as a Worker secret). The SEO analyzer's AI features use the same key. **Give the key a credit limit in OpenRouter**: that is the real cap on spend. The per-user daily budget and the rate limit below come on top of it. Without a key, the view and the endpoints still exist and say the assistant isn't configured; nothing else changes (the schema, the import map and CI don't need it).

**Models.** The allowlist is one model, DeepSeek V4.1 Flash (`deepseek/deepseek-v4.1-flash`), which is also the default. It handles tool calls well and is cheap: a turn is usually 2–4 model calls of about 10,000 prompt tokens each (mostly the tool definitions, which OpenRouter caches between calls). When the plugin was built, such turns measured around $0.0002–$0.001. Check [the model's page](https://openrouter.ai/deepseek/deepseek-v4.1-flash) for current prices. To offer more models, add `{ id, label }` entries to `models` (any OpenRouter model that supports tool calling and `data_collection: deny`; the picker appears with two or more). Requests are routed with `require_parameters` and `data_collection: deny`, so drafts never reach providers that log or train on prompts.

**Approvals.** Reads (find, count, schemas) run without asking. Every write (create, update, delete, duplicate, restore) pauses on a card that shows the change field by field against the current document. Nothing is written until you approve; a rejection, with an optional reason, goes back to the model. The assistant saves drafts and only publishes when asked to in so many words.

**From an edit view.** Pages, reusable sections, media, folders, tags, users, the header and the footer (what `mcpPlugin` exposes) have an "Ask the assistant" button next to the document controls. It opens the chat in a drawer, on a new conversation about the saved document: the assistant is told which document it is and reads it with its tools; unsaved edits are not sent. In any conversation, `@` in the message box searches documents by title and adds them as chips; the assistant is told which ones you mean and reads them itself. When an approved change touches the document that is open, the form reloads with it. If you have unsaved edits you are asked first: reload (and lose them) or keep editing, in which case a banner warns that saving will overwrite the assistant's change. Pages autosave, so on a page the edits are usually saved already.

**Rich text as Markdown.** Pages and reusable sections (through their blocks) and Media's caption are registered with `withMarkdownRichText` in `mcpPlugin`: `findDocuments` returns their rich text as Markdown, and the assistant changes a rich text field with `setRichTextFromMarkdown` (a data path such as `layout.2.richText` plus the whole new Markdown, saved as a draft). Its approval card shows the field's text before and after. This applies to external MCP clients too. The app's editors keep paragraphs, headings (the levels each block allows), bold, italic and links to URLs; they have no list feature, so Markdown lists are kept as plain text (the tool says so). Underline, alignment, internal links to pages and new-tab links can't be expressed in Markdown: when a field holds them the tool refuses until the editor agrees to lose them. A new collection with rich text should get `withMarkdownRichText` too (`tests/int/assistantRichText.int.spec.ts` fails otherwise).

**Conversations live in Durable Objects, not D1.** One `AssistantConversation` per conversation keeps its transcript, runs, pending approvals and stream log in its own SQLite, and runs the chat turn itself, so a reply survives a closed tab and a reload rejoins it. One `AssistantConversationIndex` per user lists their conversations. Conversations idle for 30 days are deleted. The conversation object calls this Worker's own `/api/mcp` through the `ASSISTANT_SELF` service binding with the user's session cookie. `pnpm dev` can't run Durable Objects that the Worker defines itself, so the Node dev server keeps conversations in memory (lost on restart; `src/plugins/assistant.ts`). Use `pnpm preview` to exercise the real objects. Wrangler's proxy also warns on every Node start that the two classes aren't exported; that warning is harmless.

**Daily budget.** Each admin user may spend $5 of OpenRouter cost per UTC day (`budget` in `src/payload.config.ts`), counted from the cost OpenRouter reports for every model call and stored in the user's index Durable Object. Once it is used up, a message or an approval gets "You have used today's assistant budget" until midnight UTC; rejecting a pending change still works (the assistant gets one short closing reply). A reply already running finishes, so the last one may go a little over. The chat header shows what is left today and what the open conversation has cost, and the list shows each conversation's cost. The key's credit limit in OpenRouter still caps the whole account.

**Hidden fields.** The model never sees users' email, API key, sessions or auth state (password hash, reset and verification tokens, lockout): the plugin removes them from every tool result, from what conversations store and from the current values on approval cards, for every auth collection. Add other fields with the plugin's `redact` option (`{ slug: ['field', 'group.field'] }`; arrays and blocks rows are walked).

**Audit log.** Every write the assistant applies (user, tool, collection, document id, conversation, model; no content) is one data point in the `shipment_assistant_audit` Analytics Engine dataset (`ASSISTANT_AUDIT` in `wrangler.jsonc`; `shipment_assistant_audit_staging` on staging). Reads, rejected changes and failed writes aren't logged. The conversation Durable Object writes them on Workers (the `AssistantConversation` subclass in `src/server.ts`), the plugin's `audit` option under `pnpm dev`. Query it with the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/): `SELECT timestamp, blob1 AS user, blob2 AS tool, blob3 AS collection, blob4 AS document, blob5 AS conversation FROM shipment_assistant_audit ORDER BY timestamp DESC`. Analytics Engine keeps data for 3 months.

**Rate limit.** `ASSISTANT_RATE_LIMIT` (`wrangler.jsonc`, `namespace_id` 1005) allows 20 chat turns per minute per admin user, where a turn is a message or an approval answer. It's wired to the plugin's `rateLimit` hook in `src/plugins/assistantRateLimit.ts`. Without the binding there's no limit.

**Tests.** `tests/e2e/assistant.e2e.spec.ts` sends a message, approves and rejects an update to a draft page, rewrites a paragraph of a Rich text block from Markdown, asks from a page's edit view (approve, the form shows the change, saving keeps it) and from a tag with unsaved edits (asked first, keep editing, then reload). It needs no key: `playwright.config.ts` starts the dev server with `ASSISTANT_TEST_MODEL=1`, which turns on the plugin's scripted test model. Only requests to `localhost` use it, and `APP_ENV=production` or `staging` ignores the flag, so a deployed Worker always uses OpenRouter.

### Email

Payload sends forgot-password emails, and the SEO analyzer's alerts digest sends to `SEO_ALERT_EMAIL`, through `payload.sendEmail`. [`src/email.ts`](./src/email.ts) picks the transport from what is configured:

1. **Cloudflare Email Service**, when `wrangler.jsonc` declares a `send_email` binding named `EMAIL`. No API key. It can send to any address once the sender's domain is onboarded to Email Sending, which needs the [Workers Paid plan](https://developers.cloudflare.com/email-service/platform/pricing/) (3,000 emails a month included, then $0.35 per 1,000). On the Free plan, or before onboarding, it only reaches [verified destination addresses](https://developers.cloudflare.com/email-service/platform/limits/#verified-destination-addresses) in the account.
2. **[Resend](https://resend.com)**, when `RESEND_API_KEY` is set and there is no `EMAIL` binding. It uses the stock `@payloadcms/email-resend` adapter, which calls Resend's HTTP API with `fetch`.
3. **Neither:** Payload's console adapter logs each email, reset links included, and sends nothing. That's the default, so local dev and CI need no setup. The SEO digest counts its email channel as not delivered in this mode.

Both transports send from `EMAIL_FROM_ADDRESS`, which must be an address on the domain you onboarded or verified. The sender name is `EMAIL_FROM_NAME`, or the site name if that's unset. If a transport is configured but `EMAIL_FROM_ADDRESS` isn't, the Worker still starts, but every send fails with an error that names the variable. The address isn't a secret and is usually the same in every environment, so you can set it once as the default in `.env.schema`. Otherwise set it in each `.env.[APP_ENV].local`. If you leave it out of development while declaring the binding, `pnpm dev` fails sends instead of logging them.

**Cloudflare Email Service setup.** The binding isn't declared by default. The deploy has to work on any plan and before a domain is onboarded, and Email Sending has neither guarantee. Do these steps per Worker (production, then `env.staging`):

1. Onboard the sending domain (it has to use Cloudflare DNS): in the dashboard, open **Compute > Email Service > Email Sending > Onboard Domain**, or run `pnpm wrangler email sending enable example.com`. Onboarding adds SPF, DKIM and DMARC records on the `cf-bounce` subdomain.
2. Add `"send_email": [{ "name": "EMAIL" }]` to `wrangler.jsonc`, both at the top level and in `env.staging`, because environments don't inherit bindings. Then run `pnpm cf-typegen`.
3. Set `EMAIL_FROM_ADDRESS`, for example `no-reply@example.com`, on the onboarded domain.
4. Deploy (`pnpm run deploy`, or `pnpm run deploy:staging`). Then use **Forgot password?** on `/admin/login` with a real account and check that the email arrives and its link resets the password. If something fails, the error code shows up in the Worker's logs. `E_SENDER_DOMAIN_NOT_AVAILABLE` or `E_SENDER_NOT_VERIFIED` means the domain isn't onboarded or the address is on a different domain. `E_RECIPIENT_NOT_ALLOWED` means the account can't send to arbitrary recipients yet.

Under `pnpm dev`, Wrangler's proxy simulates a declared binding: it logs the email and doesn't send it.

**Resend setup.** Verify the domain in Resend, then create an API key with sending access to it. Set `RESEND_API_KEY` (it's `@sensitive`, so it's uploaded as a Worker secret) and `EMAIL_FROM_ADDRESS` in `.env.production.local` and `.env.staging.local`, or in CI. Leave the `EMAIL` binding out: when the binding is declared, it wins over Resend.

The Cloudflare adapter maps Payload's Nodemailer-style message (`from`, `to`, `cc`, `bcc`, `replyTo`, `subject`, `html`, `text`) to the binding's `send()`. Attachments aren't supported yet and throw. `tests/int/email.int.spec.ts` covers both transports with a fake binding and a stubbed `fetch`. `tests/int/api.int.spec.ts` checks that the app falls back to the console adapter.

### Current limitations

- No cropping or focal points on Workers (no `sharp`); resizing goes through Cloudflare Images (see [Images](#images)).
- Payload is patched (`patches/` at the repo root) to hash passwords with 100,000 PBKDF2 iterations instead of 600,000, because deployed Workers reject anything higher. Without the patch, every admin login fails as "incorrect password" on a deployed Worker, even though it works in `pnpm dev` and `pnpm preview`. A hash made by unpatched Payload only verifies under Node. To fix one, set that password again through the Local API in a `pnpm web payload run` script with `PAYLOAD_MIGRATE_REMOTE=true`, which writes a new 100k hash to the remote database.
- GraphQL on Workers isn't guaranteed to work yet; the REST and Local APIs are.

## Questions

If you have any issues or questions, reach out on [Discord](https://discord.com/invite/payload) or start a [GitHub discussion](https://github.com/payloadcms/payload/discussions).
