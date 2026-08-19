/**
 * `SearxngSearchProvider`: a `WebSearchProvider` backed by a SearXNG instance's JSON API
 * (`GET /search` with `format=json`). SearXNG is a self-hosted metasearch engine, so the
 * endpoint is a deployment concern and the provider carries no credential plane. The
 * instance's upstream engines return snippets but no generated answer, so `content` is
 * omitted; entries without a URL are dropped. Provider-specific controls (language,
 * categories, safe search, time range) are deployment config, not seam or model arguments.
 * @module dsh-searxng-search/provider
 */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
import type { SearxngResponse, SearxngResult } from './types.ts';
/** Stable id this provider registers under. */
export declare const SEARXNG_PROVIDER_ID = "searxng";
/**
 * Default endpoint: the SearXNG container's standard local port. SearXNG is a
 * self-hosted metasearch engine; point this at the deployment's instance
 * (`$SEARXNG_BASE_URL` or config `baseURL`).
 */
export declare const SEARXNG_DEFAULT_BASE_URL = "http://127.0.0.1:8080";
/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface SearxngSearchProviderOptions {
    /** Instance endpoint base; `/search` is appended. */
    baseURL: string;
    /** Instance search language sent as `language` (e.g. `en`). Omitted = the instance decides. */
    language?: string;
    /** Comma-separated SearXNG categories sent as `categories` (e.g. `general`). Omitted = instance default. */
    categories?: string;
    /** Safe search level sent as SearXNG's `safesearch`: `0` off, `1` moderate, `2` strict. */
    safesearch?: 0 | 1 | 2;
    /** Recency window sent as SearXNG's `time_range`. Omitted = no window. */
    timeRange?: 'day' | 'week' | 'month' | 'year';
}
/**
 * Map one SearXNG result to a normalized source, or `undefined` when it has no URL —
 * the only field every source must carry. `title`/`snippet`/`publishedAt` are omitted
 * when absent or blank rather than filled with invented values.
 *
 * @param result - one entry of SearXNG's `results[]`.
 * @returns the normalized source, or `undefined` when the entry has no URL.
 */
export declare function mapSearxngResult(result: SearxngResult): WebSearchSource | undefined;
/**
 * Map a SearXNG response envelope to a normalized search result. SearXNG returns no
 * generated answer, so `content` is omitted. SearXNG has no result-count control on the
 * wire, so the web service owns the final `maxResults` truncation and this provider
 * reports `truncated: false`.
 *
 * @param response - the parsed `GET /search` response body.
 * @returns the normalized result; URL-less entries are dropped.
 */
export declare function mapSearxngResponse(response: SearxngResponse): WebSearchResult;
/** The SearXNG-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export declare class SearxngSearchProvider implements WebSearchProvider {
    private readonly options;
    readonly id = "searxng";
    constructor(options: SearxngSearchProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
