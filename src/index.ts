/**
 * `dsh-web-search-searxng`: registers a SearXNG-backed `WebSearchProvider`
 * with `ctx.web`. A function/namespace plugin (NOT a default-export service): a search
 * provider does not own the `ctx.web` key — it registers INTO the seam's provider
 * registry, exactly as `@deepseek-ai/dsh-llm-deepseek` registers an adapter into
 * `ctx.llm`. The key is owned by `@deepseek-ai/dsh-web`.
 *
 * @module dsh-web-search-searxng
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { SEARXNG_DEFAULT_BASE_URL, SearxngSearchProvider } from './provider.ts'

export {
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_PROVIDER_ID,
  SearxngSearchProvider,
} from './provider.ts'
export type { SearxngSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-searxng'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** SearXNG instance endpoint base. Falls back to `$SEARXNG_BASE_URL`, then the local default. */
  baseURL?: string
  /** Instance search language sent as `language` (e.g. `en`). Omitted = the instance decides. */
  language?: string
  /** Comma-separated SearXNG categories sent as `categories` (e.g. `general`). Omitted = instance default. */
  categories?: string
  /** Safe search level sent as `safesearch`: `0` off, `1` moderate, `2` strict. Omitted = instance default. */
  safesearch?: 0 | 1 | 2
  /** Recency window sent as `time_range`: `day`, `week`, `month`, or `year`. Omitted = no window. */
  timeRange?: 'day' | 'week' | 'month' | 'year'
}

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  language: z.string(),
  categories: z.string(),
  safesearch: z.union([0, 1, 2] as const),
  timeRange: z.union(['day', 'week', 'month', 'year'] as const),
})

/** Register the SearXNG search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new SearxngSearchProvider({
    // Every environment layer may name this endpoint: the product trusts the
    // project it is launched in, and no credential is involved.
    baseURL: config.baseURL ?? launchEnvironmentOf(ctx).get('SEARXNG_BASE_URL')?.value ?? SEARXNG_DEFAULT_BASE_URL,
    ...config.language !== undefined ? { language: config.language } : {},
    ...config.categories !== undefined ? { categories: config.categories } : {},
    ...config.safesearch !== undefined ? { safesearch: config.safesearch } : {},
    ...config.timeRange !== undefined ? { timeRange: config.timeRange } : {},
  }))
}
