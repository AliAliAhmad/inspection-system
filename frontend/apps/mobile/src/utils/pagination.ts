/**
 * Helpers for the backend's list envelope.
 *
 * Flask list endpoints answer `{ status, data: [...], pagination: { page,
 * per_page, total, pages, has_next? } }`. A few older ones put the rows under
 * `items`, and a few return a bare array. Screens used to read `total_pages`
 * at the top level or `.pagination` off the array itself — both always
 * undefined — so "load more" silently never fired. Read the envelope here,
 * in one place.
 */

export interface PageMeta {
  page: number;
  pages: number;
  total: number;
  hasNext: boolean;
}

/** The rows of one page, whatever envelope the endpoint uses. */
export function extractItems<T = any>(body: any): T[] {
  if (Array.isArray(body)) return body as T[];
  if (Array.isArray(body?.data)) return body.data as T[];
  if (Array.isArray(body?.items)) return body.items as T[];
  if (Array.isArray(body?.data?.data)) return body.data.data as T[];
  if (Array.isArray(body?.data?.items)) return body.data.items as T[];
  return [];
}

/** Paging metadata, or null when the endpoint does not page. */
export function extractPageMeta(body: any): PageMeta | null {
  const p = body?.pagination ?? body?.data?.pagination ?? body?.meta ?? null;
  if (!p || typeof p !== 'object') return null;
  const page = Number(p.page ?? p.current_page ?? 1) || 1;
  const pages = Number(p.pages ?? p.total_pages ?? 0) || 0;
  const total = Number(p.total ?? p.total_items ?? 0) || 0;
  const hasNext = typeof p.has_next === 'boolean' ? p.has_next : page < pages;
  return { page, pages, total, hasNext };
}

/** For useInfiniteQuery's getNextPageParam: the next page number, or undefined. */
export function nextPageParam(body: any): number | undefined {
  const meta = extractPageMeta(body);
  return meta && meta.hasNext ? meta.page + 1 : undefined;
}

/** Flatten every loaded page of an infinite query into one list. */
export function flattenPages<T = any>(pages: any[] | undefined): T[] {
  if (!pages) return [];
  const out: T[] = [];
  for (const body of pages) out.push(...extractItems<T>(body));
  return out;
}

/** Total row count reported by the first page, falling back to what is loaded. */
export function totalFromPages(pages: any[] | undefined, loaded: number): number {
  const meta = pages && pages.length ? extractPageMeta(pages[0]) : null;
  return meta ? Math.max(meta.total, loaded) : loaded;
}

/**
 * Walk every page of a list endpoint and return all rows.
 * Bounded by `maxPages` so a runaway response can never loop forever.
 */
export async function fetchAllPages<T = any>(
  fetchPage: (page: number) => Promise<{ data: any }>,
  maxPages = 50,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page);
    const body = res.data;
    rows.push(...extractItems<T>(body));
    const meta = extractPageMeta(body);
    if (!meta || !meta.hasNext) break;
  }
  return rows;
}
