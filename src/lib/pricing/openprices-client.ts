import type { OpenPrice } from "./openprices";

export const OPEN_PRICES_BASE = "https://prices.openfoodfacts.org";
const USER_AGENT = "menu-budget/0.1 (application personnelle de menus a petit budget)";

export interface OpenPricesLocation {
  id: number;
  osm_name: string | null;
  osm_display_name: string | null;
  osm_brand: string | null;
  osm_address_city: string | null;
  price_count: number;
  product_count: number;
}

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

async function getJson<T>(fetchFn: FetchLike, url: string): Promise<T> {
  const res = await fetchFn(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) throw new Error("Magasin introuvable sur Open Prices.");
  if (!res.ok) throw new Error(`Open Prices a répondu ${res.status}. Réessayez plus tard.`);
  return (await res.json()) as T;
}

export async function fetchOpenPricesLocation(locationId: number, fetchFn: FetchLike = fetch): Promise<OpenPricesLocation> {
  return getJson<OpenPricesLocation>(fetchFn, `${OPEN_PRICES_BASE}/api/v1/locations/${locationId}`);
}

/**
 * Récupère les prix d'un magasin, du plus récent au plus ancien, jusqu'à `since`.
 * Requêtes espacées (service communautaire) et nombre de pages plafonné.
 */
export async function fetchOpenPrices(
  locationId: number,
  opts: { since: string; maxPages?: number; delayMs?: number },
  fetchFn: FetchLike = fetch,
): Promise<OpenPrice[]> {
  const out: OpenPrice[] = [];
  const maxPages = opts.maxPages ?? 60;
  for (let page = 1; page <= maxPages; page++) {
    const url = `${OPEN_PRICES_BASE}/api/v1/prices?location_id=${locationId}&size=100&page=${page}&order_by=-date&date__gte=${opts.since}`;
    const data = await getJson<{ items: OpenPrice[]; pages: number }>(fetchFn, url);
    out.push(...data.items);
    if (page >= data.pages || data.items.length === 0) break;
    if (opts.delayMs !== 0) await new Promise((r) => setTimeout(r, opts.delayMs ?? 300));
  }
  return out;
}
