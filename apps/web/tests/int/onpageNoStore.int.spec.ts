import { describe, expect, it } from 'vitest'

import { withOnPageNoStore } from '@/utilities/onpageNoStore'

const req = (path: string) => new Request(`https://example.com${path}`)
const res = (headers: Record<string, string> = {}) =>
  new Response('<html>published</html>', { headers, status: 200 })

describe('withOnPageNoStore', () => {
  it('makes a marked URL private even when the handler opted in to public caching', async () => {
    const out = withOnPageNoStore(
      req('/about?_onpage=1'),
      res({ 'Cache-Control': 'public, max-age=60', 'Cache-Tag': 'page:/about' }),
    )
    expect(out.headers.get('Cache-Control')).toBe('private, no-store')
    expect(out.headers.get('Cache-Tag')).toBe('page:/about')
    expect(await out.text()).toBe('<html>published</html>')
  })

  it('makes a marked URL with other parameters private', () => {
    const out = withOnPageNoStore(req('/?draft=true&_onpage=1'), res())
    expect(out.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('leaves unmarked URLs alone', () => {
    const response = res({ 'Cache-Control': 'public, max-age=60' })
    expect(withOnPageNoStore(req('/about'), response)).toBe(response)
    expect(withOnPageNoStore(req('/about?onpage=1'), response)).toBe(response)
  })

  it('keeps the status', () => {
    const out = withOnPageNoStore(req('/x?_onpage=1'), new Response(null, { status: 404 }))
    expect(out.status).toBe(404)
  })
})
