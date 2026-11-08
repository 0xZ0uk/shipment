/**
 * The product mockups an editor can pick in a block's "Illustration" field. Server and client
 * safe (no React): the field builder reads the options, `./Illustration` the slots.
 *
 * Adding one: build it in `./<Name>/` (see `./README.md`), add it here and in the loaders in
 * `./Illustration.tsx`, then run `pnpm web generate:types` and `pnpm web migrate:create`.
 */
export const illustrations = {
  pageBuilder: { label: 'Page builder (wide, animated)', slot: 'wide' },
  blockLibrary: { label: 'Block library', slot: 'card' },
  onPage: { label: 'Edit on page (animated)', slot: 'card' },
  seoAb: { label: 'SEO score and A/B test', slot: 'card' },
} as const satisfies Record<string, { label: string; slot: IllustrationSlot }>

/** `wide`: a 1024×540 stage for a hero; `card`: a 480×360 (4:3) stage on its own ground. */
export type IllustrationSlot = 'card' | 'wide'

export type IllustrationName = keyof typeof illustrations

export const illustrationNames = Object.keys(illustrations) as IllustrationName[]
