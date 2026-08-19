import { describe, expect, it } from 'vitest'
import { SearxngSearchProvider } from '../src/index.ts'

/**
 * Real-instance smoke for the SearXNG search provider. Self-skips without
 * `$SEARXNG_BASE_URL`, per the with-key e2e policy in docs/testing.md: a
 * SearXNG deployment is self-hosted, so a reachable instance must be named.
 */
const baseURL = process.env.SEARXNG_BASE_URL
const maybe = baseURL !== undefined && baseURL.length > 0 ? describe : describe.skip

maybe('SearxngSearchProvider real instance', () => {
  it('returns sources for a live query', async () => {
    const provider = new SearxngSearchProvider({ baseURL: baseURL! })
    const result = await provider.search({ query: 'What is DeepSeek Harness?', maxResults: 5 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) expect(source.url).toMatch(/^https?:\/\//)
  }, 30_000)
})
