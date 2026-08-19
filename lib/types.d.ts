/**
 * Wire types for the SearXNG search JSON API (`GET /search?q=...&format=json`).
 * The instance must enable the JSON output format (`search.formats` in its
 * `settings.yml`); the wire shape is provider-private and does not depend on
 * any other harness seam.
 * @module dsh-searxng-search/types
 */
/** One SearXNG result entry; every portable field is optional in the wild. */
export interface SearxngResult {
    /** Target URL; the only field every normalized source must carry. */
    url?: string | null;
    /** Result heading. */
    title?: string | null;
    /** Snippet text around the query match; may be empty for some engines. */
    content?: string | null;
    /** Producing engine id; engine metadata is not portable and is not mapped. */
    engine?: string;
    /** Engine relevance score; not portable and not mapped. */
    score?: number;
    /** Publication date as the producing engine reports it; not every engine supplies one. */
    publishedDate?: string | null;
}
/** SearXNG's `format=json` response envelope. */
export interface SearxngResponse {
    /** The query as the instance echoed it. */
    query?: string;
    /** Total hits the instance counted; not a source list. */
    number_of_results?: number;
    /** The result entries. */
    results?: SearxngResult[];
}
/** SearXNG's error envelope (`{"error": "..."}`). */
export interface SearxngError {
    error?: string;
}
