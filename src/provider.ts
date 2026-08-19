/**
 * `SearxngSearchProvider`: a `WebSearchProvider` backed by a SearXNG instance's JSON API
 * (`GET /search` with `format=json`). SearXNG is a self-hosted metasearch engine, so the
 * endpoint is a deployment concern and the provider carries no credential plane. The
 * instance's upstream engines return snippets but no generated answer, so `content` is
 * omitted; entries without a URL are dropped. Provider-specific controls (language,
 * categories, safe search, time range) are deployment config, not seam or model arguments.
 * @module dsh-web-search-searxng/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { SearxngError, SearxngResponse, SearxngResult } from './types.ts'

/** Stable id this provider registers under. */
export const SEARXNG_PROVIDER_ID = 'searxng'

/**
 * Default endpoint: the SearXNG container's standard local port. SearXNG is a
 * self-hosted metasearch engine; point this at the deployment's instance
 * (`$SEARXNG_BASE_URL` or config `baseURL`).
 */
export const SEARXNG_DEFAULT_BASE_URL = 'http://127.0.0.1:8080'

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface SearxngSearchProviderOptions {
  /** Instance endpoint base; `/search` is appended. */
  baseURL: string
  /** Instance search language sent as `language` (e.g. `en`). Omitted = the instance decides. */
  language?: string
  /** Comma-separated SearXNG categories sent as `categories` (e.g. `general`). Omitted = instance default. */
  categories?: string
  /** Safe search level sent as SearXNG's `safesearch`: `0` off, `1` moderate, `2` strict. */
  safesearch?: 0 | 1 | 2
  /** Recency window sent as SearXNG's `time_range`. Omitted = no window. */
  timeRange?: 'day' | 'week' | 'month' | 'year'
}

/**
 * Map one SearXNG result to a normalized source, or `undefined` when it has no URL —
 * the only field every source must carry. `title`/`snippet`/`publishedAt` are omitted
 * when absent or blank rather than filled with invented values.
 *
 * @param result - one entry of SearXNG's `results[]`.
 * @returns the normalized source, or `undefined` when the entry has no URL.
 */
export function mapSearxngResult(result: SearxngResult): WebSearchSource | undefined {
  if (result.url == null || result.url.length === 0) return undefined
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    ...result.content != null && result.content.length > 0 ? { snippet: result.content } : {},
    ...result.publishedDate != null && result.publishedDate.length > 0 ? { publishedAt: result.publishedDate } : {},
  }
}

/**
 * Map a SearXNG response envelope to a normalized search result. SearXNG returns no
 * generated answer, so `content` is omitted. SearXNG has no result-count control on the
 * wire, so the web service owns the final `maxResults` truncation and this provider
 * reports `truncated: false`.
 *
 * @param response - the parsed `GET /search` response body.
 * @returns the normalized result; URL-less entries are dropped.
 */
export function mapSearxngResponse(response: SearxngResponse): WebSearchResult {
  const sources = (response.results ?? [])
    .map(mapSearxngResult)
    .filter((source): source is WebSearchSource => source !== undefined)
  return { sources, truncated: false }
}

/** The SearXNG-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class SearxngSearchProvider implements WebSearchProvider {
  readonly id = SEARXNG_PROVIDER_ID

  constructor(private readonly options: SearxngSearchProviderOptions) {}

  available(): boolean {
    // No credential plane: a parseable instance URL is the whole local check.
    return URL.canParse(this.options.baseURL)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const params = new URLSearchParams({ q: request.query, format: 'json' })
    if (this.options.language !== undefined) params.set('language', this.options.language)
    if (this.options.categories !== undefined) params.set('categories', this.options.categories)
    if (this.options.safesearch !== undefined) params.set('safesearch', String(this.options.safesearch))
    if (this.options.timeRange !== undefined) params.set('time_range', this.options.timeRange)

    let response: Response
    try {
      response = await fetch(`${this.options.baseURL}/search?${params.toString()}`, {
        redirect: 'error',
        headers: {
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`SearXNG search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `SearXNG API error (HTTP ${status})`
      try {
        const parsed = await response.json() as SearxngError
        if (parsed.error !== undefined && parsed.error.length > 0) message = parsed.error
      } catch (error: unknown) {
        // An abort fired mid-body must surface as WEB_ABORTED, not be swallowed
        // into a generic HTTP-error message — cancellation is not a provider
        // error (the seam's cancellation contract).
        if (isAbortError(error)) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: error })
        // Otherwise: the HTTP status is already captured in `message`; a
        // non-JSON error body (normal for the limiter's 403 page) can only
        // cost a richer provider message, never the real error.
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as SearxngResponse
      return mapSearxngResponse(payload)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`SearXNG returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
