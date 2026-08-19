# dsh-searxng-search

A [SearXNG](https://docs.searxng.org/)-backed web search provider for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web capability seam (`ctx.web`).

This is a **standalone, installable plugin**: it does not modify the harness project itself. It registers a `WebSearchProvider` (id `searxng`) with the `ctx.web` seam of whatever harness it is installed into, so the harness's model-facing `web_search` tool is served by your own SearXNG instance — no DeepSeek/Exa/Perplexity search API key required.

## How it works

The plugin calls your instance's `GET /search` endpoint with `format=json` and maps `results[]` into the seam's normalized sources (`url`, `title`, `snippet` ← `content`, `publishedAt` ← `publishedDate`; entries without a URL are dropped). The endpoint is deployment configuration, not a credential:

| Config key | Default | Meaning |
|---|---|---|
| `baseURL` | `$SEARXNG_BASE_URL`, else `http://127.0.0.1:8080` | Instance endpoint base; `/search` is appended. An unparseable value makes the provider unavailable. |
| `language` | (unset) | Instance search language sent as `language` (e.g. `en`). Unset lets the instance decide. |
| `categories` | (unset) | Comma-separated SearXNG categories sent as `categories` (e.g. `general`). Unset uses the instance default. |
| `safesearch` | (unset) | Safe search level sent as `safesearch`: `0` off, `1` moderate, `2` strict. Unset uses the instance default. |
| `timeRange` | (unset) | Recency window sent as `time_range`: `day`, `week`, `month`, or `year`. Unset sends no window. |

The instance must enable the JSON output format in its `settings.yml`:

```yaml
search:
  formats:
    - html
    - json
```

The `@deepseek-ai/*` seam packages are declared as **optional peers**: the harness that loads this plugin already provides them (the launcher's `$DSH_HOME/profiles/node_modules` fallback), so npm/pnpm must not try to resolve them from the registry — the pre-release `@deepseek-ai` tree there is incomplete. Install this plugin into a profile; do not install the seam packages from npm.

## Install into a DeepSeek Harness profile

A dsh profile's `cordis.patch.yml` is the plugin layer that stays out of the harness project. Two ways to make the package resolvable:

### Option A — local build (no npm publish needed)

```sh
git clone https://github.com/ben0112/dsh-searxng-search.git
cd dsh-searxng-search
pnpm install

# The @deepseek-ai seam packages are still pre-release on npm, so link them
# from a DeepSeek Harness checkout for build/test (default path:
# ~/deepseek-harness, or pass the checkout path as an argument):
scripts/link-dev-deps.sh /path/to/deepseek-harness

pnpm build

# Make the package resolvable from your profile (peers resolve via the
# harness's own $DSH_HOME/profiles/node_modules fallback):
mkdir -p ~/.dsh/profiles/web/node_modules
ln -s "$PWD" ~/.dsh/profiles/web/node_modules/dsh-searxng-search
```

### Option B — from npm (once published)

```sh
cd ~/.dsh/profiles/web
pnpm add dsh-searxng-search
```

### Enable the plugin

Add to `~/.dsh/profiles/web/cordis.patch.yml` (replace the whole `web` row's config; a patch layer replaces a row's entire `config`):

```yaml
- insert:
    - id: web-search-searxng
      name: 'dsh-searxng-search'
      config:
        baseURL: https://searxng.example.com

- id: web
  config:
    searchProvider: searxng
```

The profile patch hot-reloads on long-lived surfaces; restart `dsh web` if it does not pick it up. To revert to DeepSeek search, restore `searchProvider: deepseek-official` and drop the insert.

## Develop

```sh
pnpm install
scripts/link-dev-deps.sh /path/to/deepseek-harness   # link @deepseek-ai seam packages
pnpm build       # tsc → lib/ (ESM + d.ts)
pnpm test        # unit tests (fetch mocked; no network)
pnpm test:e2e    # real-instance smoke; self-skips without $SEARXNG_BASE_URL
pnpm benchmark   # compare deepseek-official vs SearXNG over a fixed query set
```

Run the benchmark against your instance:

```sh
SEARXNG_BASE_URL=https://searxng.example.com pnpm benchmark
BENCH_ITERATIONS=3 SEARXNG_BASE_URL=... pnpm benchmark
```

The DeepSeek side of the benchmark takes its key from `$DEEPSEEK_API_KEY`, or from the harness credentials document at `$DSH_HOME/.credentials.yaml`.

## Publish to npm (GitHub Action)

The `.github/workflows/publish.yml` workflow publishes to npm automatically:

1. Bump the version in `package.json` and commit (`pnpm build` first — `lib/` is committed, so rebuild and include it in the same commit).
2. Push a version tag:
   ```sh
   git tag v0.1.2
   git push github v0.1.2
   ```
3. The workflow validates `v<tag> == package.json version`, packs a dry-run, then runs `npm publish`.

A manual run is also available under **Actions → publish → Run workflow** with a `dry_run` toggle to test the pipeline without publishing.

The `dsh-searxng-search` package publishes through **npm trusted publishing (OIDC)** — no npm token is stored in the repository. Register the repository (`ben0112/dsh-searxng-search`) under npmjs.com → Access Tokens → Trusted publishing; the workflow then authenticates via the GitHub Actions OIDC token (`id-token: write`) and runs `npm publish --provenance`.

## License

MIT
