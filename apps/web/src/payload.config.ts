import { onpage } from '@shipment/onpage-plugin'
import { tanstackSession } from '@shipment/onpage-tanstack-start/session'
import { abTestingPlugin } from '@shipment/payload-plugin-ab'
import { assistantPlugin } from '@shipment/payload-plugin-assistant'
import { withMarkdownRichText } from '@shipment/payload-plugin-assistant/mcp'
import { createSqlSeoDataStore, seoAnalyzerPlugin } from '@shipment/payload-seo-analyzer'
import { mcpPlugin } from '@shipment/payload-plugin-mcp'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { seoPlugin } from '@payloadcms/plugin-seo'
import type { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { r2Storage } from '@payloadcms/storage-r2'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import {
  cloudflareEnv as cloudflare,
  edgeCache,
  isWorkersRuntime,
  waitUntil,
} from '#cloudflare-runtime'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { Tags } from './collections/Tags'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Authors } from './collections/Authors'
import { Categories } from './collections/Categories'
import { Sections } from './collections/Sections'
import { blocks } from './blocks'
import { referencesSection } from './blocks/GlobalSection/references'
import { createEmailAdapter } from './email'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { seedBlogEndpoint, seedHomeEndpoint } from './endpoints/seed'
import { defaultLexical } from './fields/defaultLexical'
import type { Page, Post } from './payload-types'
import { abMeasurementConfig } from './plugins/abMeasurement'
import { abStorage, isAbVariant } from './plugins/abTesting'
import { edgeCachePurge } from './plugins/edgeCachePurge'
import { assistantAuditSink, assistantConversations, assistantTestModel } from './plugins/assistant'
import { workersAssistantRateLimit } from './plugins/assistantRateLimit'
import { limitVersions } from './plugins/limitVersions'
import { oauthRateLimit } from './plugins/oauthRateLimit'
import { r2SeoCacheStore } from './plugins/seoCacheStore'
import { searchRateLimit } from './plugins/searchRateLimit'
import { workersSeoRateLimit } from './plugins/seoRateLimit'
import { siteSearch } from './plugins/siteSearch'
import { SocialsPlugin } from './plugins/socials'
import { siteSearchIndex } from './search/siteIndex'
import { pagePath } from './utilities/pagePath'
import { postPath } from './utilities/postPath'
import { siteName } from './utilities/siteName'
import { createEdgeCachePurger } from './utilities/edgeCache'
import { createWorkersLogger } from './utilities/workersLogger'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const cloudflareLogger = createWorkersLogger({ level: process.env.PAYLOAD_LOG_LEVEL || 'info' })

// Payload's secret also seals onpage's edit-mode cookies and preview links.
const secret = process.env.PAYLOAD_SECRET || cloudflare.PAYLOAD_SECRET || ''

const generateTitle: GenerateTitle<Page | Post> = ({ doc }) =>
  doc?.title ? `${doc.title} | ${siteName}` : siteName

const generateURL: GenerateURL<Page | Post> = ({ collectionConfig, collectionSlug, doc, req }) => {
  if (!doc?.slug) return req.origin ?? ''
  const posts = (collectionSlug ?? collectionConfig?.slug) === 'posts'
  return `${req.origin}${posts ? postPath(doc.slug) : pagePath(doc.slug)}`
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  // Page blocks (src/blocks), defined once and listed by slug in each blocks field.
  blocks,
  collections: [Pages, Posts, Authors, Categories, Sections, Users, Media, Folders, Tags],
  editor: defaultLexical,
  // Forgot-password emails, the SEO alerts digest (SEO_ALERT_EMAIL) and anything else that calls
  // `payload.sendEmail`. Cloudflare Email Service when the `EMAIL` send_email binding is declared,
  // else Resend when RESEND_API_KEY is set, else Payload's console adapter (logs, sends nothing).
  // See src/email.ts and README, "Email".
  email: createEmailAdapter({
    binding: (cloudflare as { EMAIL?: SendEmail }).EMAIL,
    resendApiKey: process.env.RESEND_API_KEY || cloudflare.RESEND_API_KEY || undefined,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || cloudflare.EMAIL_FROM_ADDRESS || undefined,
    fromName: process.env.EMAIL_FROM_NAME || cloudflare.EMAIL_FROM_NAME || siteName,
  }),
  // POST /api/seed/home: the template's landing page as the homepage, plus example blog posts;
  // POST /api/seed/blog: the blog posts alone (src/endpoints/seed).
  endpoints: [seedHomeEndpoint, seedBlogEndpoint],
  globals: [Header, Footer],
  secret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Blocks are stored as one JSON column per blocks field instead of a table per block and
  // array (two with versions). A block library would otherwise add 100+ tables to D1, all
  // read on every page load.
  db: sqliteD1Adapter({
    binding: cloudflare.D1,
    blocksAsJSON: true,
    migrationDir: path.resolve(dirname, 'db/migrations'),
    // No dev schema push: the local D1 is built from the committed migrations (`pnpm migrate`),
    // like production. Drizzle's push rebuilds changed tables with DROP TABLE, and D1 ignores
    // PRAGMA foreign_keys=OFF, so a push cascade-deletes child rows (locales, rels, versions'
    // parents) and can leave the database half-migrated.
    push: false,
  }),
  // Default is already true; kept explicit because finished jobs (and their logs) would
  // otherwise accumulate in D1.
  jobs: {
    deleteJobOnComplete: true,
  },
  logger: isWorkersRuntime ? cloudflareLogger : undefined,
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  // D1 only stores file metadata. Uploads go to R2 on Workers; the Node dev server writes
  // them to the local `media/` directory instead.
  storage: [
    r2Storage({
      bucket: cloudflare.R2,
      collections: {
        media: true,
      },
      enabled: isWorkersRuntime,
    }),
  ],
  plugins: [
    // Serves MCP at POST /api/mcp (packages/payload-plugin-mcp, our fork of @payloadcms/plugin-mcp).
    // Callers authenticate with a user API key (Claude Code, scripts), the admin's session (the
    // assistant below) or an OAuth access token (`oauth`: ChatGPT and claude.ai, which only connect
    // over OAuth; users approve them on a consent page and revoke them under "AI connections").
    // Without credentials it answers 401 with the OAuth challenge. The discovery documents are also
    // served at the site root by src/app/[.]well-known.$.ts. See README, "MCP".
    // `withMarkdownRichText` (every collection with rich text: Pages and Sections through their
    // blocks, Media's caption): findDocuments shows rich text as Markdown, and
    // setRichTextFromMarkdown writes it, for the assistant and external MCP clients alike.
    mcpPlugin({
      collections: {
        folders: {
          description: 'Folders that organise media in the admin panel.',
        },
        pages: withMarkdownRichText('pages', {
          description:
            'Website pages, served at /<slug> (the page with slug "home" is served at /). Built from layout blocks (sections) and SEO meta. Saved as drafts until published. Pages with `_abVariantOf` set are A/B test variants of that page (slug `<original>--<hash>`), shown to a share of its visitors; they are created, weighted and removed in the admin\'s Variants panel, and `_abVariantOf` / `_abPassPercentage` cannot be written here.',
        }),
        posts: withMarkdownRichText('posts', {
          description:
            'Blog posts, served at /blog/<slug> and listed at /blog, /blog/category/<slug> and /blog/rss.xml. `content` is the body (rich text), `excerpt` the summary for the archive and the feed, `authors` and `categories` relationships to those collections. Saved as drafts until published.',
        }),
        authors: {
          description: 'Public bylines for blog posts (name, avatar, short bio). Not admin users.',
        },
        categories: {
          description: 'Blog post categories, each with an archive at /blog/category/<slug>.',
        },
        sections: withMarkdownRichText('sections'),
        media: withMarkdownRichText('media', {
          description:
            'Uploaded files (images, documents) with alt text, stored in R2. Call getUploadInstructions before uploading.',
        }),
        tags: {
          description: 'Tags used to label and filter media.',
        },
        users: {
          description: 'Admin panel users.',
          // Account creation and removal stay in the admin panel.
          tools: { create: false, delete: false },
        },
      },
      globals: {
        footer: {
          description: 'Links shown in the website footer (up to 6).',
        },
        header: {
          description: 'Links shown in the website header navigation (up to 6).',
        },
      },
      mcp: {
        serverOptions: { serverInfo: { name: 'Shipment' } },
      },
      // The consent page and `resource_name` use the server name above. Every user may connect a
      // client (there are no roles); set `canConnect` to restrict it. Registration is public: the
      // plugin caps pending clients, and this limits it per IP (src/plugins/oauthRateLimit.ts).
      oauth: { rateLimit: oauthRateLimit(cloudflare.OAUTH_RATE_LIMIT_REGISTER) },
    }),
    // Admin assistant (packages/payload-plugin-assistant): /admin/assistant chats with the content
    // through the MCP tools above, as the signed-in user, on OpenRouter (`OPENROUTER_API_KEY`,
    // shared with the SEO analyzer; without it the view says "not configured"). Every write waits
    // for the user's approval on a diff card. Conversations live in Durable Objects, never D1
    // (wrangler.jsonc); the Node dev server keeps them in memory. See the README, "Assistant".
    assistantPlugin({
      models: [{ id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' }],
      apiKey: process.env.OPENROUTER_API_KEY || cloudflare.OPENROUTER_API_KEY || undefined,
      conversations: assistantConversations(cloudflare),
      // Per admin user, shared across isolates. The credit limit on the key is the account-wide cap.
      rateLimit: workersAssistantRateLimit(cloudflare),
      // $5 of OpenRouter cost per admin user per UTC day (counted in the user's index Durable
      // Object); past it, turns get 402 `budget_exceeded` until midnight UTC.
      budget: { dailyCostUsd: 5 },
      // Users' email, API key, sessions and auth state are hidden from the model by default (every
      // auth collection); add other fields here as `{ slug: ['field', 'group.field'] }`.
      // Applied writes go to Analytics Engine (ASSISTANT_AUDIT); see src/plugins/assistant.ts.
      audit: assistantAuditSink(cloudflare),
      // Tests only (Playwright): a scripted model on localhost, never on a deployed Worker.
      testModel: assistantTestModel({
        ASSISTANT_TEST_MODEL: process.env.ASSISTANT_TEST_MODEL || cloudflare.ASSISTANT_TEST_MODEL,
        APP_ENV: process.env.APP_ENV || cloudflare.APP_ENV,
      }),
    }),
    // Fields are added to Pages and Posts by hand (the SEO tab), so no `collections` here.
    seoPlugin({
      generateTitle,
      generateURL,
    }),
    // Content analysis on top of the plugin-seo fields: a score sidebar on Pages, a
    // site-wide dashboard at /admin/seo, redirects, and sitemap/robots endpoints under
    // /api/seo-plugin. Time-series features (404 logs, score history, performance imports)
    // store their rows in the separate SEO_D1 database (`dataStore`), pruned daily, and
    // the external link checker scans in budgeted steps; all four passed on a deployed
    // Worker. AI features call OpenRouter (`OPENROUTER_API_KEY`, capped by the key's credit
    // limit in OpenRouter). The alerts digest sends nothing until SEO_ALERT_WEBHOOK_URL or
    // SEO_ALERT_EMAIL is set (email also needs a transport: `email` above). GSC stays off
    // until a Google OAuth client exists (it also needs a main-D1 migration for `seo-gsc-auth`). Whole-site scans (link graph, keywords,
    // cannibalization…) and IndexNow stay off until the real site exists (GitHub issues #27 and #28).
    seoAnalyzerPlugin({
      collections: ['pages', 'posts'],
      collectionRoutes: { pages: '', posts: 'blog' },
      // A/B variants (`_abVariantOf`) are reached through their original's URL, never their
      // own: leave them out of the sitemaps, llms.txt, IndexNow and the whole-site scans. The
      // sidebar still scores a variant an editor opens. Not `noindex` on the variant: its meta
      // is what a visitor bucketed into it gets at the original's URL.
      excludeDocs: isAbVariant,
      excludeDocsFields: ['_abVariantOf'],
      siteName,
      siteUrl: process.env.SITE_URL || cloudflare.SITE_URL || undefined,
      uploadsCollection: 'media',
      // Workers isolates don't share memory and cancel un-awaited work: the dashboard audit
      // (and the caches the admin polls) persist in R2 and build through `waitUntil`.
      // `waitUntil` is undefined under the Node dev server, which keeps promises alive.
      cacheStore: r2SeoCacheStore(cloudflare.R2),
      waitUntil,
      // Rate limits shared across isolates (Workers Rate Limiting bindings).
      rateLimit: workersSeoRateLimit(cloudflare),
      // Score history, Search Console imports, rank history and 404 logs go to a second D1
      // database, never the main one (AGENTS.md). The plugin creates and migrates its tables
      // there, registers no collections for them, and prunes them daily (retention job).
      dataStore: createSqlSeoDataStore(cloudflare.SEO_D1),
      // Background work as Payload jobs, run by the Cron Trigger (`scheduled` in src/server.ts).
      // With the features below, that's continuing a dashboard audit that paused between steps
      // (plus the retention purge of SEO_D1 once a time-series feature is on).
      jobs: true,
      features: {
        aiFeatures: true,
        alerts: true,
        cannibalization: false,
        duplicateContent: false,
        externalLinks: true,
        gscApi: false,
        indexNow: false,
        keywords: false,
        linkGraph: false,
        performance: true,
        schemaBuilder: true,
        scoreHistory: true,
        seoLogs: true,
        warmCache: false,
      },
    }),
    // A/B testing (packages/payload-plugin-ab): the Variants panel on Pages clones a page into
    // variants and sets each one's share of traffic; `loadPage` routes visitors between them.
    // The manifest (which variants a page has) lives in the hidden `ab-manifest` collection,
    // one row per page path, read through the Cache API (src/plugins/abTesting.ts). Its keys
    // are the paths visitors request, so they come from `pagePath` (`home` → `/`).
    abTestingPlugin({
      storage: abStorage,
      collections: {
        pages: {
          generatePath: ({ doc }) =>
            typeof doc.slug === 'string' && doc.slug ? pagePath(doc.slug) : null,
          // Promoting a variant ("Promote" in the Variants panel) copies its content onto the
          // original's draft; the original keeps its own publish date, "Hide from search engines"
          // setting and cornerstone flag.
          promoteSkipFields: ['publishedAt', 'noindex', 'isCornerstone'],
        },
      },
      // Measurement (src/plugins/abMeasurement.ts): `loadPage` counts impressions and CTA
      // clicks post conversions to `/api/_ab/convert`, both into Workers Analytics Engine;
      // the Variants panel reads results per bucket through its SQL API, once
      // AB_ANALYTICS_ACCOUNT_ID and AB_ANALYTICS_API_TOKEN are set.
      measurement: abMeasurementConfig(cloudflare),
    }),
    // On-page editing (packages/onpage): "Edit on page" in the admin opens the page with an
    // editor, and edits autosave as drafts through Payload's REST API. Pages and Posts: Header and
    // Footer have no drafts, so every keystroke would publish. Comments and saved sections
    // (`comments`, `patterns`) stay off; each adds a collection to the main D1.
    onpage({
      collections: {
        pages: {
          url: ({ doc }) => (typeof doc.slug === 'string' ? pagePath(doc.slug) : null),
          // A/B variants are edited in the Variants panel's drawer, and visitors reach them
          // through the original's URL, so they get no "Edit on page".
          hideEditWhen: '_abVariantOf',
        },
        posts: {
          url: ({ doc }) => (typeof doc.slug === 'string' ? postPath(doc.slug) : null),
        },
      },
      session: tanstackSession({ secret }),
    }),
    // Social publishing (packages/payload-plugin-socials): a Socials tab on Pages and Posts and a
    // composer at /admin/socials, Pinterest only. Disabled until SOCIALS_ENCRYPTION_KEY is set;
    // the schema is the same either way. The Cron Trigger runs its queue (src/server.ts).
    SocialsPlugin,
    // Purges Workers Cache when page HTML changes: pages, posts (and their authors and
    // categories), header, footer, media, sections, redirects and the A/B manifest
    // (src/plugins/edgeCachePurge.ts). After the plugins whose collections it hooks
    // (seo-redirects, ab-manifest). Does nothing under Node (no Workers Cache).
    edgeCachePurge(createEdgeCachePurger({ cache: edgeCache, waitUntil })),
    // Site search (src/plugins/siteSearch.ts): an FTS5 index in SEO_D1 (never the main D1),
    // synced from published pages in the background, queried at `GET /api/search` by the
    // header's palette and `/search`. Same exclusions as the sitemap: drafts, noindex and
    // A/B variants.
    siteSearch({
      collections: {
        pages: {
          path: (doc) => (typeof doc.slug === 'string' && doc.slug ? pagePath(doc.slug) : null),
          exclude: isAbVariant,
        },
        // Title, meta description and the body (`content`); bylines aren't indexed, so author and
        // category changes need no resync.
        posts: {
          path: (doc) => (typeof doc.slug === 'string' && doc.slug ? postPath(doc.slug) : null),
        },
      },
      index: siteSearchIndex,
      // A reusable section's text is indexed with every page that shows it.
      referencedBy: { sections: referencesSection },
      waitUntil,
      rateLimit: searchRateLimit(cloudflare.SEARCH_RATE_LIMIT),
    }),
    // Last, so the cap also covers collections the plugins above add.
    limitVersions({ max: 20 }),
  ],
})
