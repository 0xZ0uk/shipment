import type { Endpoint, PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { homePage, navigation } from './home'

type PageData = RequiredDataFromCollectionSlug<'pages'>

export type SeedPageResult = { status: 'created' | 'exists' | 'updated'; id: number }

/**
 * Creates (and publishes) the page `data` describes, as `req.user`. A page with the same slug
 * is left alone (`exists`) unless `overwrite` is set; overwriting keeps its previous content as
 * a version, so it can be restored from the admin.
 */
export const seedPage = async (
  req: PayloadRequest,
  data: PageData,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<SeedPageResult> => {
  const access = { req, user: req.user, overrideAccess: false } as const

  const {
    docs: [existing],
  } = await req.payload.find({
    ...access,
    collection: 'pages',
    where: { slug: { equals: data.slug } },
    limit: 1,
    pagination: false,
    depth: 0,
    select: {},
  })

  if (existing && !overwrite) return { status: 'exists', id: existing.id }

  const page = existing
    ? await req.payload.update({ ...access, collection: 'pages', id: existing.id, data, depth: 0 })
    : await req.payload.create({ ...access, collection: 'pages', data, depth: 0 })

  return { status: existing ? 'updated' : 'created', id: page.id }
}

/**
 * Gives the Header and Footer globals the landing page's section links, but only a global
 * that has no links yet. Returns the globals it filled.
 */
export const seedNavigation = async (req: PayloadRequest): Promise<Array<'footer' | 'header'>> => {
  const seeded: Array<'footer' | 'header'> = []
  for (const slug of ['header', 'footer'] as const) {
    const access = { req, user: req.user, overrideAccess: false } as const
    const current = await req.payload.findGlobal({ ...access, slug, depth: 0 })
    if (current.navItems?.length) continue
    await req.payload.updateGlobal({ ...access, slug, data: { navItems: navigation[slug] } })
    seeded.push(slug)
  }
  return seeded
}

/**
 * `POST /api/seed/home`: seeds the homepage (slug `home`, served at `/`) with the template's
 * landing page (`./home.ts`), and links to its sections in an empty header and footer.
 * Signed-in users only. Answers 409 if a homepage already exists; `?overwrite=true` replaces
 * it (the header and footer are still only filled when empty).
 */
export const seedHomeEndpoint: Endpoint = {
  path: '/seed/home',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ error: 'Sign in to seed the homepage.' }, { status: 401 })

    const overwrite = req.searchParams.get('overwrite') === 'true'
    const result = await seedPage(req, homePage, { overwrite })

    if (result.status === 'exists') {
      return Response.json(
        {
          error: 'A homepage already exists. Add ?overwrite=true to replace it.',
          id: result.id,
        },
        { status: 409 },
      )
    }

    const navigationSeeded = await seedNavigation(req)

    return Response.json(
      { ...result, navigation: navigationSeeded },
      { status: result.status === 'created' ? 201 : 200 },
    )
  },
}
