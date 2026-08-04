import { fetchCerberusItems } from './cerberus';
import { ParsedProduct, toParsedProducts } from './types';

const STORE_LIMIT = Number(process.env.RAMI_LEVY_STORE_LIMIT || 20);

export async function fetchAndParse(): Promise<ParsedProduct[]> {
  const items = await fetchCerberusItems('RamiLevi', STORE_LIMIT);
  return toParsedProducts(items);
}
