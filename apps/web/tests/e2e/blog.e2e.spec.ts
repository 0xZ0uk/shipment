import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

// The blog (#156): `POST /api/seed/blog` posts on the archive, a post page with its JSON-LD,
// category archives with pagination, the RSS feed, and the Latest posts block on a page. The
// dev server runs with SITE_URL (playwright.config.ts), so published views opt in to the edge
// cache and their tags can be checked.

const stamp = Date.now()
const categorySlug = `e2e-blog-${stamp}`
const pageSlug = `e2e-blog-page-${stamp}`
// One more than a page (BLOG_PAGE_SIZE is 9), so the category archive has a second page.
const POST_COUNT = 10

test.describe('Blog', () => {
  let context: BrowserContext
  let api: APIRequestContext
  let categoryId: number | undefined
  let pageId: number | undefined
  const postIds: number[] = []

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    context = await browser.newContext()
    api = context.request
    await login({ page: await context.newPage(), user: testUser })

    // The example authors, categories and posts (skips what an earlier run created).
    const seeded = await api.post('/api/seed/blog')
    expect(seeded.ok(), await seeded.text()).toBe(true)

    const category = await api.post('/api/categories', {
      data: { title: `E2E ${stamp}`, slug: categorySlug, description: 'Posts made by the e2e spec.' },
    })
    expect(category.ok(), await category.text()).toBe(true)
    categoryId = (await category.json()).doc.id

    for (let i = 1; i <= POST_COUNT; i++) {
      const created = await api.post('/api/posts', {
        data: {
          title: `E2E post ${i} ${stamp}`,
          slug: `e2e-post-${i}-${stamp}`,
          excerpt: `Excerpt ${i}`,
          // Older than the seeded posts, newest first: post 1 leads the category archive.
          publishedAt: new Date(Date.UTC(2020, 0, 1) - i * 86_400_000).toISOString(),
          categories: [categoryId],
          _status: 'published',
        },
      })
      expect(created.ok(), await created.text()).toBe(true)
      postIds.push((await created.json()).doc.id)
    }

    const page = await api.post('/api/pages', {
      data: {
        title: `Blog block ${stamp}`,
        slug: pageSlug,
        _status: 'published',
        layout: [
          {
            blockType: 'postsArchive',
            variant: 'grid',
            title: 'From the e2e category',
            count: 3,
            category: categoryId,
          },
        ],
      },
    })
    expect(page.ok(), await page.text()).toBe(true)
    pageId = (await page.json()).doc.id
  })

  test.afterAll(async () => {
    if (pageId !== undefined) await api.delete(`/api/pages/${pageId}`)
    for (const id of postIds) await api.delete(`/api/posts/${id}`)
    if (categoryId !== undefined) await api.delete(`/api/categories/${categoryId}`)
    await context.close()
    await cleanupTestUser()
  })

  test('the archive lists the seeded posts and paginates', async ({ page }) => {
    const response = await page.goto('/blog')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect(response?.headers()['cache-tag']?.split(',')).toEqual(
      expect.arrayContaining(['page:/blog', 'layout', 'posts']),
    )
    await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Welcome to the blog' })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/blog$/,
    )
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
      'href',
      '/blog/rss.xml',
    )

    // At least 13 posts: a second page, reached through "Older posts".
    await page.getByRole('link', { name: 'Older posts' }).click()
    await expect(page).toHaveURL(/\/blog\/page\/2$/)
    await expect(page.getByText(/^Page 2 of \d+$/)).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/blog\/page\/2$/)

    // Page 1 has one URL; past the last page is a 404.
    await page.goto('/blog/page/1')
    await expect(page).toHaveURL(/\/blog$/)
    expect((await page.goto('/blog/page/999'))?.status()).toBe(404)
    expect((await page.goto('/blog/page/01'))?.status()).toBe(404)
  })

  test('a post renders its title, body, author and BlogPosting JSON-LD', async ({ page }) => {
    const response = await page.goto('/blog/welcome-to-the-blog')
    expect(response?.status()).toBe(200)
    const tags = response?.headers()['cache-tag']?.split(',') ?? []
    expect(tags).toEqual(expect.arrayContaining(['page:/blog/welcome-to-the-blog', 'layout']))
    expect(tags.some((tag) => tag.startsWith('author:'))).toBe(true)
    expect(tags.some((tag) => tag.startsWith('category:'))).toBe(true)

    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to the blog' })).toBeVisible()
    await expect(page.getByText('This blog runs on the same Worker')).toBeVisible()
    await expect(page.locator('[data-post-author]').first()).toHaveText('Sam Builder')
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')

    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '{}')))
    const posting = jsonLd.find((node) => node['@type'] === 'BlogPosting')
    expect(posting).toMatchObject({
      author: [{ '@type': 'Person', name: 'Sam Builder' }],
      headline: 'Welcome to the blog',
      mainEntityOfPage: { '@id': expect.stringMatching(/\/blog\/welcome-to-the-blog$/) },
    })

    // Its category links to the category's archive.
    await page.getByRole('link', { name: 'News', exact: true }).click()
    await expect(page).toHaveURL(/\/blog\/category\/news$/)
    await expect(page.getByRole('heading', { level: 1, name: 'News' })).toBeVisible()
  })

  test('unknown posts and categories are 404s', async ({ page }) => {
    expect((await page.goto(`/blog/no-such-post-${stamp}`))?.status()).toBe(404)
    expect((await page.goto(`/blog/category/no-such-category-${stamp}`))?.status()).toBe(404)
  })

  test('a category archive lists its posts only, newest first, on pages', async ({ page }) => {
    const response = await page.goto(`/blog/category/${categorySlug}`)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-tag']?.split(',')).toEqual(
      expect.arrayContaining(['posts', `category:${categoryId}`]),
    )
    await expect(page.getByRole('heading', { level: 1, name: `E2E ${stamp}` })).toBeVisible()
    const titles = page.locator('[data-post-card] h2')
    await expect(titles).toHaveCount(9)
    await expect(titles.first()).toHaveText(`E2E post 1 ${stamp}`)
    await expect(page.getByRole('link', { name: 'Welcome to the blog' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Older posts' }).click()
    await expect(page).toHaveURL(new RegExp(`/blog/category/${categorySlug}/page/2$`))
    await expect(titles).toHaveCount(1)
    await expect(titles.first()).toHaveText(`E2E post ${POST_COUNT} ${stamp}`)
    expect((await page.goto(`/blog/category/${categorySlug}/page/3`))?.status()).toBe(404)
  })

  test('the feed is RSS with the latest posts', async ({ request }) => {
    const response = await request.get('/blog/rss.xml')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/rss+xml')
    expect(response.headers()['cache-tag']?.split(',')).toContain('posts')
    const xml = await response.text()
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/)
    expect(xml).toContain('<title>Welcome to the blog</title>')
    expect(xml).toMatch(/<link>https?:\/\/[^<]+\/blog\/welcome-to-the-blog<\/link>/)
  })

  test('the Latest posts block lists a category\'s newest posts on a page', async ({ page }) => {
    const response = await page.goto(`/${pageSlug}`)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-tag']?.split(',')).toEqual(
      expect.arrayContaining([`page:/${pageSlug}`, 'posts']),
    )
    const block = page.locator('[data-block="postsArchive"]')
    await expect(block.getByRole('heading', { name: 'From the e2e category' })).toBeVisible()
    await expect(block.locator('[data-post-card]')).toHaveCount(3)
    await block.getByRole('link', { name: `E2E post 1 ${stamp}` }).click()
    await expect(page).toHaveURL(new RegExp(`/blog/e2e-post-1-${stamp}$`))
    await expect(
      page.getByRole('heading', { level: 1, name: `E2E post 1 ${stamp}` }),
    ).toBeVisible()
  })
})
