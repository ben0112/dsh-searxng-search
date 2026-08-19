/**
 * `dsh-searxng-search`: registers a SearXNG-backed `WebSearchProvider`
 * with `ctx.web`. A function/namespace plugin (NOT a default-export service): a search
 * provider does not own the `ctx.web` key — it registers INTO the seam's provider
 * registry, exactly as `@deepseek-ai/dsh-llm-deepseek` registers an adapter into
 * `ctx.llm`. The key is owned by `@deepseek-ai/dsh-web`.
 *
 * @module dsh-searxng-search
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { SEARXNG_DEFAULT_BASE_URL, SEARXNG_PROVIDER_ID, SearxngSearchProvider, } from './provider.ts';
export type { SearxngSearchProviderOptions } from './provider.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-searxng";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
    /** SearXNG instance endpoint base. Falls back to `$SEARXNG_BASE_URL`, then the local default. */
    baseURL?: string;
    /** Instance search language sent as `language` (e.g. `en`). Omitted = the instance decides. */
    language?: string;
    /** Comma-separated SearXNG categories sent as `categories` (e.g. `general`). Omitted = instance default. */
    categories?: string;
    /** Safe search level sent as `safesearch`: `0` off, `1` moderate, `2` strict. Omitted = instance default. */
    safesearch?: 0 | 1 | 2;
    /** Recency window sent as `time_range`: `day`, `week`, `month`, or `year`. Omitted = no window. */
    timeRange?: 'day' | 'week' | 'month' | 'year';
}
export declare const Config: z<Config>;
/** Register the SearXNG search provider with `ctx.web`. */
export declare function apply(ctx: Context, config: Config): void;
