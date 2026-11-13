import type { Endpoint, PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { hasRole } from '@/access/roles'

import { blogAuthors, blogCategories, blogPosts } from './blog'
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

export type SeedBlogResult = Record<'authors' | 'categories' | 'posts', number>

/**
 * Creates the example authors, categories and (published) posts of `./blog.ts`, as `req.user`.
 * Anything whose slug already exists is left alone, so it can run on a site with content.
 * Returns how many of each it created.
 */
export const seedBlog = async (req: PayloadRequest): Promise<SeedBlogResult> => {
  const access = { req, user: req.user, overrideAccess: false } as const
  const created: SeedBlogResult = { authors: 0, categories: 0, posts: 0 }

  const idsBySlug = async (collection: 'authors' | 'categories' | 'posts', slugs: string[]) => {
    const { docs } = await req.payload.find({
      ...access,
      collection,
      depth: 0,
      pagination: false,
      select: { slug: true },
      where: { slug: { in: slugs } },
    })
    return new Map(docs.map((doc) => [doc.slug, doc.id]))
  }

  const authors = await idsBySlug('authors', blogAuthors.map((a) => a.slug!))
  for (const data of blogAuthors) {
    if (authors.has(data.slug!)) continue
    const doc = await req.payload.create({ ...access, collection: 'authors', data, depth: 0 })
    authors.set(doc.slug, doc.id)
    created.authors++
  }

  const categories = await idsBySlug('categories', blogCategories.map((c) => c.slug!))
  for (const data of blogCategories) {
    if (categories.has(data.slug!)) continue
    const doc = await req.payload.create({ ...access, collection: 'categories', data, depth: 0 })
    categories.set(doc.slug, doc.id)
    created.categories++
  }

  const posts = await idsBySlug('posts', blogPosts.map((p) => p.slug!))
  // Oldest first, so a list sorted by creation agrees with `publishedAt`.
  for (const { authors: authorSlugs, categories: categorySlugs, ...data } of [...blogPosts].reverse()) {
    if (posts.has(data.slug!)) continue
    await req.payload.create({
      ...access,
      collection: 'posts',
      data: {
        ...data,
        authors: authorSlugs.flatMap((slug) => authors.get(slug) ?? []),
        categories: categorySlugs.flatMap((slug) => categories.get(slug) ?? []),
      },
      depth: 0,
    })
    created.posts++
  }

  return created
}

/**
 * `POST /api/seed/blog`: the example authors, categories and posts (`seedBlog`). Admins only.
 * Safe to repeat: existing slugs are skipped.
 */
export const seedBlogEndpoint: Endpoint = {
  path: '/seed/blog',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ error: 'Sign in to seed the blog.' }, { status: 401 })
    if (!hasRole(req.user, 'admin')) return Response.json({ error: 'Admins only.' }, { status: 403 })
    const created = await seedBlog(req)
    return Response.json({ created }, { status: 200 })
  },
}

/**
 * `POST /api/seed/home`: seeds the homepage (slug `home`, served at `/`) with the template's
 * landing page (`./home.ts`), links to its sections in an empty header and footer, and the
 * example blog posts (`seedBlog`, which skips what exists).
 * Admins only. Answers 409 if a homepage already exists; `?overwrite=true` replaces
 * it (the header and footer are still only filled when empty).
 */
export const seedHomeEndpoint: Endpoint = {
  path: '/seed/home',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ error: 'Sign in to seed the homepage.' }, { status: 401 })
    if (!hasRole(req.user, 'admin')) return Response.json({ error: 'Admins only.' }, { status: 403 })

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
    const blog = await seedBlog(req)

    return Response.json(
      { ...result, blog, navigation: navigationSeeded },
      { status: result.status === 'created' ? 201 : 200 },
    )
  },
}
