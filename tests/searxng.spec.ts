import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import {
  SearxngSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_PROVIDER_ID,
} from '../src/index.ts'
import * as searxngPlugin from '../src/index.ts'
import { mapSearxngResult, mapSearxngResponse } from '../src/provider.ts'

const options = { baseURL: 'http://127.0.0.1:8080' }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function searchPayload(): unknown {
  return {
    query: 'q',
    number_of_results: 1,
    results: [{ url: 'https://a.test', title: 'A', content: 'snip', engine: 'google', score: 1, publishedDate: '2026-02-02' }],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SearXNG response mapping', () => {
  it('maps url, title, snippet, and publishedAt', () => {
    const result = mapSearxngResponse({
      query: 'q',
      results: [
        { url: 'https://a.test', title: 'A', content: 'snip', publishedDate: '2026-02-02' },
        { url: 'https://b.test' },
      ],
    })
    expect(result).toEqual({
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'snip', publishedAt: '2026-02-02' },
        { url: 'https://b.test' },
      ],
      truncated: false,
    })
    expect(result.content).toBeUndefined()
  })

  it('omits null or empty optional source fields', () => {
    const result = mapSearxngResponse({
      results: [{ url: 'https://a.test', title: null, content: '', publishedDate: null }],
    })
    expect(result.sources).toEqual([{ url: 'https://a.test' }])
  })

  it('drops entries without a URL', () => {
    const result = mapSearxngResponse({
      results: [
        { title: 'no url' },
        { url: null },
        { url: '' },
        { url: 'https://a.test' },
      ],
    })
    expect(result.sources).toEqual([{ url: 'https://a.test' }])
  })

  it('yields no sources when results are absent', () => {
    expect(mapSearxngResponse({ query: 'q' }).sources).toEqual([])
    expect(mapSearxngResult({ title: 'no url' })).toBeUndefined()
  })
})

describe('SearxngSearchProvider availability', () => {
  it('is available with a parseable base URL', () => {
    expect(new SearxngSearchProvider(options).available()).toBe(true)
  })

  it('is unavailable when the base URL is unparseable', () => {
    expect(new SearxngSearchProvider({ baseURL: 'not a url' }).available()).toBe(false)
  })
})

describe('SearxngSearchProvider request mapping', () => {
  it('sends a GET /search request with q and format=json', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchPayload()))
    vi.stubGlobal('fetch', fetchMock)
    await new SearxngSearchProvider(options).search({ query: 'hello' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8080/search?q=hello&format=json')
    expect(init).toMatchObject({ redirect: 'error' })
    expect((init.headers as Record<string, string>)['accept']).toBe('application/json')
    expect((init.headers as Record<string, string>)['user-agent']).toBe('deepseek-harness/0.0.1')
  })

  it('percent-encodes the query and omits unset optional parameters', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchPayload()))
    vi.stubGlobal('fetch', fetchMock)
    await new SearxngSearchProvider(options).search({ query: 'a b & c' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8080/search?q=a+b+%26+c&format=json')
  })

  it('sends the optional parameters when configured', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchPayload()))
    vi.stubGlobal('fetch', fetchMock)
    await new SearxngSearchProvider({ ...options, language: 'en', categories: 'general', safesearch: 2, timeRange: 'week' })
      .search({ query: 'q' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8080/search?q=q&format=json&language=en&categories=general&safesearch=2&time_range=week')
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchPayload()))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await new SearxngSearchProvider(options).search({ query: 'q' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})

describe('SearxngSearchProvider error handling', () => {
  it('maps an HTTP error to WEB_PROVIDER_ERROR with the provider message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'JSON format not enabled' }, { status: 403 })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'JSON format not enabled' }))
  })

  it('keeps a status-line message when the JSON error body carries no detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 500 })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: 'SearXNG API error (HTTP 500)' }))
  })

  it('keeps a status-line message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: 'SearXNG API error (HTTP 429)' }))
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('maps a network failure to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an unparseable success body to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('surfaces an abort during error-body parse as WEB_ABORTED, not provider error', async () => {
    const body = { json: () => Promise.reject(new DOMException('aborted', 'AbortError')), ok: false, status: 500 }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('surfaces an abort during success-body parse as WEB_ABORTED', async () => {
    const body = { json: () => Promise.reject(new DOMException('aborted', 'AbortError')), ok: true, status: 200 }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })
})

describe('web-search-searxng plugin registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(searchPayload())))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
    const fiber = await ctx.plugin(searxngPlugin, {})
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({
      sources: [{ url: 'https://a.test', title: 'A', snippet: 'snip', publishedAt: '2026-02-02' }],
      truncated: false,
    })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('auto-selects as the only usable provider without a configured id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(searchPayload())))
    const ctx = new Context()
    await ctx.plugin(WebRuntime)
    await ctx.plugin(searxngPlugin, {})
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [{ url: 'https://a.test' }] })
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in searxngPlugin).toBe(false)
  })

  it('threads the search controls into the request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchPayload()))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
    const fiber = await ctx.plugin(searxngPlugin, { baseURL: 'http://configured.test:9999', language: 'en', categories: 'general', safesearch: 1, timeRange: 'day' })
    await ctx.web.search({ query: 'q' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://configured.test:9999/search?q=q&format=json&language=en&categories=general&safesearch=1&time_range=day')
    await fiber.dispose()
  })

  it('falls back to the env base URL when config omits it', async () => {
    const prev = process.env.SEARXNG_BASE_URL
    process.env.SEARXNG_BASE_URL = 'http://searxng.local:8888'
    try {
      const fetchMock = vi.fn(async () => jsonResponse(searchPayload()))
      vi.stubGlobal('fetch', fetchMock)
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
      const fiber = await ctx.plugin(searxngPlugin, {})
      await ctx.web.search({ query: 'q' })
      const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('http://searxng.local:8888/search?q=q&format=json')
      await fiber.dispose()
    } finally {
      if (prev === undefined) delete process.env.SEARXNG_BASE_URL
      else process.env.SEARXNG_BASE_URL = prev
    }
  })

  it('defaults to the local instance URL without config or env', async () => {
    const prev = process.env.SEARXNG_BASE_URL
    delete process.env.SEARXNG_BASE_URL
    try {
      const fetchMock = vi.fn(async () => jsonResponse(searchPayload()))
      vi.stubGlobal('fetch', fetchMock)
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
      const fiber = await ctx.plugin(searxngPlugin, {})
      await ctx.web.search({ query: 'q' })
      const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe(`${SEARXNG_DEFAULT_BASE_URL}/search?q=q&format=json`)
      await fiber.dispose()
    } finally {
      if (prev !== undefined) process.env.SEARXNG_BASE_URL = prev
    }
  })
})
