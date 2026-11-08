import type { RequiredDataFromCollectionSlug } from 'payload'

import { bulletList, paragraph, richText } from '@/blocks/shared/lexical'

type Layout = RequiredDataFromCollectionSlug<'pages'>['layout']

const layout: Layout = [
  {
    blockType: 'hero',
    variant: 'centered',
    eyebrow: 'Payload 4 · TanStack Start · Cloudflare Workers',
    title: 'Ship a content-managed website on one Cloudflare Worker',
    description:
      'Shipment is a website template with Payload CMS, a library of page blocks, on-page editing, SEO tooling, A/B tests and an AI assistant. Content lives in D1, media in R2, and there are no servers to run.',
    links: [
      { link: { type: 'custom', url: '/admin', label: 'Open the admin', appearance: 'default' } },
      {
        link: { type: 'custom', url: '#features', label: 'See what is inside', appearance: 'outline' },
      },
    ],
    section: { background: 'default', spacing: 'lg' },
  },
  {
    blockType: 'logos',
    variant: 'row',
    title: 'Built on',
    items: [
      { name: 'Payload', url: 'https://payloadcms.com' },
      { name: 'TanStack Start', url: 'https://tanstack.com/start' },
      { name: 'Cloudflare Workers', url: 'https://workers.cloudflare.com' },
      { name: 'D1', url: 'https://developers.cloudflare.com/d1/' },
      { name: 'R2', url: 'https://developers.cloudflare.com/r2/' },
      { name: 'shadcn/ui', url: 'https://ui.shadcn.com' },
    ],
    section: { background: 'default', spacing: 'sm' },
  },
  {
    blockType: 'features',
    variant: 'grid',
    eyebrow: 'Features',
    title: 'Everything a marketing site needs, already wired up',
    description:
      'Start from a working site instead of a blank config. Every feature below ships enabled and runs on the same Worker as the pages.',
    items: [
      {
        icon: 'layout',
        title: 'Page blocks',
        description:
          'Heroes, features, pricing, FAQs, testimonials and more. Editors pick a block and a designed variant; nobody writes CSS.',
      },
      {
        icon: 'wand',
        title: 'Edit on page',
        description:
          'Click any text on the live page and change it. Edits autosave as drafts until you publish.',
      },
      {
        icon: 'search',
        title: 'SEO analyzer',
        description:
          'A score on every page, a site-wide dashboard, redirects, sitemaps and llms.txt, out of the box.',
      },
      {
        icon: 'target',
        title: 'A/B testing',
        description:
          'Clone a page into variants, split its traffic, and count impressions and conversions in Workers Analytics Engine.',
      },
      {
        icon: 'sparkles',
        title: 'AI assistant',
        description:
          'Ask for changes in plain language from the admin. Every edit waits for your approval on a side-by-side diff.',
      },
      {
        icon: 'code',
        title: 'MCP server',
        description:
          'Connect Claude, ChatGPT or your own scripts to your content over MCP, with OAuth or an API key.',
      },
    ],
    section: { background: 'muted', spacing: 'lg', anchor: 'features' },
  },
  {
    blockType: 'featureRows',
    variant: 'alternating',
    eyebrow: 'Built for editors',
    title: 'Your team edits the site, not the code',
    description:
      'Developers set up the blocks once. After that, marketing builds and changes pages on its own.',
    rows: [
      {
        eyebrow: 'Compose',
        title: 'Build pages from ready-made sections',
        richText: richText(
          paragraph(
            'Every section is a block with a few designed layouts. Pick one, fill in the content and it looks right in light and dark sections alike.',
          ),
          bulletList(
            'Eighteen blocks with designed variants',
            'Default, muted and dark section backgrounds',
            'Reusable sections shared across pages',
          ),
        ),
      },
      {
        eyebrow: 'Edit',
        title: 'Change copy right where it lives',
        richText: richText(
          paragraph(
            'Open "Edit on page" from the admin and type straight into the page. Visitors never download the editor.',
          ),
          bulletList('Drafts with autosave', 'Live preview in the admin', 'Publish when it is ready'),
        ),
      },
      {
        eyebrow: 'Grow',
        title: 'Measure what works',
        richText: richText(
          paragraph(
            'SEO scores point at what to fix on each page, and A/B tests tell you which version converts.',
          ),
          bulletList(
            'Per-page SEO checks and a site audit',
            'Traffic splits with sticky buckets',
            'Conversions counted server-side',
          ),
        ),
      },
    ],
    section: { background: 'default', spacing: 'lg' },
  },
  {
    blockType: 'stats',
    variant: 'row',
    eyebrow: 'By the numbers',
    title: 'The whole stack in one deploy',
    items: [
      { value: '18', label: 'Page blocks', description: 'Each with designed layout variants.' },
      {
        value: '1',
        label: 'Worker',
        description: 'The site, the admin and the API deploy together.',
      },
      { value: '0', label: 'Servers to patch', description: 'Cloudflare runs the infrastructure.' },
      {
        value: '6',
        label: 'In-house plugins',
        description: 'SEO, A/B tests, assistant, MCP, socials and on-page editing.',
      },
    ],
    section: { background: 'default', spacing: 'md' },
  },
  {
    blockType: 'steps',
    variant: 'cards',
    eyebrow: 'Get started',
    title: 'From clone to live in four steps',
    description: 'No setup calls and no infrastructure to provision by hand.',
    items: [
      {
        icon: 'code',
        title: 'Clone and install',
        description: 'Put a PAYLOAD_SECRET in your local env file and run pnpm install.',
      },
      {
        icon: 'layers',
        title: 'Build the database',
        description: 'pnpm web migrate creates the local D1 database from the committed migrations.',
      },
      {
        icon: 'wand',
        title: 'Make it yours',
        description: 'Run pnpm dev, create your first user and build your pages from blocks.',
      },
      {
        icon: 'rocket',
        title: 'Deploy',
        description: 'Create the D1 database and the R2 bucket, then run pnpm run deploy.',
      },
    ],
    section: { background: 'muted', spacing: 'lg', anchor: 'get-started' },
  },
  {
    blockType: 'pricing',
    variant: 'single',
    eyebrow: 'Pricing',
    title: 'Free and open source',
    description: 'The template is yours to keep. You only pay Cloudflare for hosting.',
    plans: [
      {
        name: 'Shipment',
        price: 'Free',
        description: 'The whole template, every block and every plugin.',
        features: [
          { feature: 'MIT licensed' },
          { feature: 'All page blocks and plugins included' },
          { feature: 'Deploys to your own Cloudflare account' },
          { feature: 'Content and media stay in your D1 and R2' },
        ],
        highlighted: true,
        link: { type: 'custom', url: '#get-started', label: 'Get started' },
      },
    ],
    footnote: 'The Worker is larger than the free plan allows, so hosting needs a paid Workers plan.',
    section: { background: 'default', spacing: 'lg', anchor: 'pricing' },
  },
  {
    blockType: 'faq',
    variant: 'split',
    eyebrow: 'FAQ',
    title: 'Questions, answered',
    description: 'Everything else is in the README, next to the code it describes.',
    items: [
      {
        question: 'Which version of Payload does it use?',
        answer: richText(
          paragraph(
            'Payload 4, currently in beta: its TanStack Start adapter is only available there. Payload, React and TypeScript are pinned once in the workspace catalog.',
          ),
        ),
      },
      {
        question: 'Can I deploy on the Workers free plan?',
        answer: richText(
          paragraph(
            'No. The Worker bundle is larger than the free plan’s script-size limit, so deploying needs a paid Workers plan.',
          ),
        ),
      },
      {
        question: 'Where is my content stored?',
        answer: richText(
          paragraph(
            'Documents live in Cloudflare D1 and uploads in R2. Blocks are stored as JSON, so adding a block adds no database tables.',
          ),
        ),
      },
      {
        question: 'Can I add my own blocks?',
        answer: richText(
          paragraph(
            'Yes. A block is one folder with its fields, variants, sample content and a React component. Copy the Rich text block and register yours in three files.',
          ),
        ),
      },
      {
        question: 'Are images resized?',
        answer: richText(
          paragraph(
            'Not on Workers, which cannot run sharp: images are served as uploaded, so upload them at the size you need.',
          ),
        ),
      },
      {
        question: 'Does the AI assistant cost anything?',
        answer: richText(
          paragraph(
            'It runs on OpenRouter with your own API key. Give the key a credit limit; each admin user also has a daily budget.',
          ),
        ),
      },
    ],
    section: { background: 'muted', spacing: 'lg', anchor: 'faq' },
  },
  {
    blockType: 'cta',
    variant: 'centered',
    title: 'Start shipping today',
    description:
      'Sign in to the admin, open this page and make it yours. Every word on it is editable.',
    links: [
      { link: { type: 'custom', url: '/admin', label: 'Open the admin', appearance: 'default' } },
      { link: { type: 'custom', url: '#faq', label: 'Read the FAQ', appearance: 'outline' } },
    ],
    section: { background: 'dark', spacing: 'lg' },
  },
]

/**
 * The template's own landing page, built from the page blocks (`src/blocks`). Seeded at `/` by
 * `POST /api/seed/home` (see `./index.ts`). No uploads: blocks show a placeholder without media.
 */
export const homePage: RequiredDataFromCollectionSlug<'pages'> = {
  slug: 'home',
  title: 'Home',
  _status: 'published',
  meta: {
    title: 'Shipment: Payload websites on Cloudflare Workers',
    description:
      'A website template with Payload CMS, page blocks, on-page editing, SEO tools, A/B tests and an AI assistant, deployed as one Cloudflare Worker.',
  },
  layout,
}

type NavItems = { link: { type: 'custom'; url: string; label: string } }[]

const anchors: NavItems = [
  { link: { type: 'custom', url: '/#features', label: 'Features' } },
  { link: { type: 'custom', url: '/#get-started', label: 'Get started' } },
  { link: { type: 'custom', url: '/#pricing', label: 'Pricing' } },
  { link: { type: 'custom', url: '/#faq', label: 'FAQ' } },
]

/** Header and footer links to the landing page's sections, seeded only where none exist. */
export const navigation = {
  header: anchors,
  footer: [...anchors, { link: { type: 'custom', url: '/admin', label: 'Admin' } }],
} satisfies Record<'footer' | 'header', NavItems>
