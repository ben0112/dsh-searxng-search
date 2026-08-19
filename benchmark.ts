/**
 * Benchmark comparing the DeepSeek search provider (`deepseek-official`) with a
 * SearXNG-backed provider over the same query set.
 *
 * Both providers run through the real `ctx.web` seam. The DeepSeek key is taken
 * from `$DEEPSEEK_API_KEY` or, when unset, from the harness's
 * `$DSH_HOME/.credentials.yaml` document.
 *
 * Run:
 *   pnpm run benchmark
 *   SEARXNG_BASE_URL=https://searxng.example.com pnpm run benchmark
 *   BENCH_ITERATIONS=3 SEARXNG_BASE_URL=... pnpm run benchmark
 *
 * @module benchmark
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as deepseekPlugin from '@deepseek-ai/dsh-web-search-deepseek'
import { DEEPSEEK_PROVIDER_ID } from '@deepseek-ai/dsh-web-search-deepseek'
import * as searxngPlugin from './src/index.ts'
import { SEARXNG_PROVIDER_ID } from './src/index.ts'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'

/**
 * Make the DeepSeek key visible to the provider: prefer `$DEEPSEEK_API_KEY`,
 * otherwise read the harness credentials document at `$DSH_HOME/.credentials.yaml`
 * (the file the web Models page writes).
 */
function bootstrapDeepSeekKey(): void {
  if (process.env.DEEPSEEK_API_KEY !== undefined && process.env.DEEPSEEK_API_KEY.length > 0) return
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  try {
    const text = readFileSync(join(home, '.credentials.yaml'), 'utf8')
    for (const line of text.split('\n')) {
      const match = /^DEEPSEEK_API_KEY\s*:\s*(.+)\s*$/.exec(line)
      if (match !== null) {
        process.env.DEEPSEEK_API_KEY = match[1]!.replace(/^['"]|['"]$/g, '')
        return
      }
    }
  } catch {
    // No credentials document: the provider will surface WEB_PROVIDER_CREDENTIAL_MISSING.
  }
}

/** Query set covering product/tech, current events, and factual topics. */
const QUERIES = [
  'DeepSeek Harness plugin architecture',
  'SearXNG self-hosted search engine setup guide',
  'best open source LLM models 2026',
  'quantum computing breakthrough 2026 news',
  'TypeScript performance best practices',
  'Apple Vision Pro 2 release date',
]

/** Result bound applied by the seam (matches `dsh-tool-web`'s default). */
const MAX_RESULTS = 8

/** Repetitions per query/provider; 1 keeps the DeepSeek model-turn cost low. */
const ITERATIONS = Math.max(1, Number(process.env.BENCH_ITERATIONS ?? 1))

/** SearXNG instance under test; defaults to the provider default endpoint. */
const SEARXNG_BASE_URL = process.env.SEARXNG_BASE_URL?.trim() || 'http://127.0.0.1:8080'

interface MeasuredSearch {
  query: string
  iteration: number
  ok: boolean
  errorCode?: string
  latencyMs: number
  sources: WebSearchSource[]
  hasContent: boolean
}

interface ProviderStats {
  label: string
  providerId: string
  runs: MeasuredSearch[]
  errorRuns: number
}

function describeSources(sources: readonly WebSearchSource[]): string {
  const withTitle = sources.filter(s => s.title !== undefined && s.title.length > 0).length
  const withSnippet = sources.filter(s => s.snippet !== undefined && s.snippet.length > 0).length
  const withDate = sources.filter(s => s.publishedAt !== undefined && s.publishedAt.length > 0).length
  const domains = new Set(sources.map((s) => {
    try { return new URL(s.url).hostname } catch { return '(unparseable)' }
  }))
  return `sources=${sources.length} title=${withTitle}/${sources.length} snippet=${withSnippet}/${sources.length} date=${withDate}/${sources.length} domains=${domains.size}`
}

/** Run one provider against every query and collect measurements. */
async function runProvider(label: string, providerId: string, mount: (ctx: Context) => Promise<void>): Promise<ProviderStats> {
  const ctx = new Context()
  await ctx.plugin(WebRuntime, { searchProvider: providerId })
  await mount(ctx)
  const stats: ProviderStats = { label, providerId, runs: [], errorRuns: 0 }
  for (const query of QUERIES) {
    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      const started = performance.now()
      try {
        const result = await ctx.web.search({ query, maxResults: MAX_RESULTS })
        stats.runs.push({
          query, iteration, ok: true, latencyMs: performance.now() - started,
          sources: [...result.sources], hasContent: result.content !== undefined,
        })
      } catch (error) {
        stats.runs.push({
          query, iteration, ok: false,
          errorCode: (error as { code?: string }).code ?? String(error),
          latencyMs: performance.now() - started, sources: [], hasContent: false,
        })
        stats.errorRuns += 1
      }
    }
  }
  return stats
}

function fmtMs(ms: number): string {
  return `${ms.toFixed(0)}ms`
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i]?.length ?? 0)))
  const line = `| ${headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join(' | ')} |`
  const sep = `|-${widths.map(w => '-'.repeat(w)).join('-|-')}-|`
  console.log(line)
  console.log(sep)
  for (const row of rows) console.log(`| ${row.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' | ')} |`)
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

async function main(): Promise<void> {
  bootstrapDeepSeekKey()
  console.log(`web search benchmark — queries=${QUERIES.length} iterations=${ITERATIONS} maxResults=${MAX_RESULTS} searxng=${SEARXNG_BASE_URL}`)
  console.log('')

  const searxng = await runProvider('searxng', SEARXNG_PROVIDER_ID, async (ctx) => {
    await ctx.plugin(searxngPlugin, { baseURL: SEARXNG_BASE_URL })
  })

  let deepseek: ProviderStats | undefined
  try {
    deepseek = await runProvider('deepseek-official', DEEPSEEK_PROVIDER_ID, async (ctx) => {
      // The provider resolves $DEEPSEEK_API_KEY per search through the launch
      // environment; the benchmark bootstrap above makes it visible.
      await ctx.plugin(deepseekPlugin, {})
    })
  } catch (error) {
    console.log(`deepseek-official setup failed: ${String(error)}`)
  }

  // Per-query latency and source-quality comparison.
  const headers = ['query', ...(deepseek === undefined ? [] : ['deepseek ms', 'deepseek sources']), 'searxng ms', 'searxng sources']
  const rows: string[][] = QUERIES.map((query) => {
    const pick = (s: ProviderStats | undefined) => {
      if (s === undefined) return undefined
      const runs = s.runs.filter(r => r.query === query && r.ok)
      if (runs.length === 0) return undefined
      return {
        latencyMs: avg(runs.map(r => r.latencyMs)),
        count: avg(runs.map(r => r.sources.length)),
      }
    }
    const d = pick(deepseek)
    const x = pick(searxng)
    const row: string[] = [query]
    if (deepseek !== undefined) row.push(d === undefined ? 'error' : fmtMs(d.latencyMs), d === undefined ? '-' : String(d.count))
    row.push(x === undefined ? 'error' : fmtMs(x.latencyMs), x === undefined ? '-' : String(x.count))
    return row
  })
  printTable(headers, rows)
  console.log('')

  // Per-query source field coverage and top hits for a spot check.
  for (const query of QUERIES) {
    console.log(`\n# ${query}`)
    for (const stats of [deepseek, searxng]) {
      if (stats === undefined) continue
      const ok = stats.runs.filter(r => r.query === query && r.ok)
      const first = ok[0]
      if (first === undefined) {
        console.log(`  ${stats.label}: error (${stats.runs.find(r => r.query === query)?.errorCode ?? 'unknown'})`)
        continue
      }
      console.log(`  ${stats.label}: ${fmtMs(first.latencyMs)} | ${describeSources(first.sources)}${first.hasContent ? ' | has-answer' : ''}`)
      for (const source of first.sources.slice(0, 3)) {
        console.log(`    - ${source.title ?? '(no title)'} | ${source.url}`)
      }
    }
  }

  // Aggregate totals.
  console.log('\n# Aggregate')
  const aggRows: string[][] = []
  for (const stats of [deepseek, searxng]) {
    if (stats === undefined) continue
    const ok = stats.runs.filter(r => r.ok)
    const latencies = ok.map(r => r.latencyMs)
    const counts = ok.map(r => r.sources.length)
    const allSources = ok.flatMap(r => r.sources)
    aggRows.push([
      stats.label,
      String(stats.runs.length),
      String(ok.length),
      stats.errorRuns > 0 ? String(stats.errorRuns) : '0',
      fmtMs(avg(latencies)),
      `${Math.round(Math.min(...latencies))}–${Math.round(Math.max(...latencies))}ms`,
      avg(counts).toFixed(1),
      String(allSources.length),
    ])
  }
  printTable(
    ['provider', 'runs', 'ok', 'errors', 'avg latency', 'latency range', 'avg sources', 'total sources'],
    aggRows,
  )
}

await main()
// Explicit exit: benchmark contexts (services, credential file watches) are
// scoped to this process and would otherwise keep it alive after the report.
process.exit(0)
