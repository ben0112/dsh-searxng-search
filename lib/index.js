/**
 * `dsh-searxng-search`: registers a SearXNG-backed `WebSearchProvider`
 * with `ctx.web`. A function/namespace plugin (NOT a default-export service): a search
 * provider does not own the `ctx.web` key — it registers INTO the seam's provider
 * registry, exactly as `@deepseek-ai/dsh-llm-deepseek` registers an adapter into
 * `ctx.llm`. The key is owned by `@deepseek-ai/dsh-web`.
 *
 * @module dsh-searxng-search
 */
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import z from '@deepseek-ai/schemastery';
import { SEARXNG_DEFAULT_BASE_URL, SearxngSearchProvider } from "./provider.js";
export { SEARXNG_DEFAULT_BASE_URL, SEARXNG_PROVIDER_ID, SearxngSearchProvider, } from "./provider.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-searxng';
/** The web seam this provider registers into. */
export const inject = ['web'];
export const Config = z.object({
    baseURL: z.string(),
    language: z.string(),
    categories: z.string(),
    safesearch: z.union([0, 1, 2]),
    timeRange: z.union(['day', 'week', 'month', 'year']),
});
/** Register the SearXNG search provider with `ctx.web`. */
export function apply(ctx, config) {
    ctx.web.registerSearchProvider(new SearxngSearchProvider({
        // Every environment layer may name this endpoint: the product trusts the
        // project it is launched in, and no credential is involved.
        baseURL: config.baseURL ?? launchEnvironmentOf(ctx).get('SEARXNG_BASE_URL')?.value ?? SEARXNG_DEFAULT_BASE_URL,
        ...config.language !== undefined ? { language: config.language } : {},
        ...config.categories !== undefined ? { categories: config.categories } : {},
        ...config.safesearch !== undefined ? { safesearch: config.safesearch } : {},
        ...config.timeRange !== undefined ? { timeRange: config.timeRange } : {},
    }));
}
