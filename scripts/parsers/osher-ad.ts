import { fetchCerberusItems } from './cerberus';
import { ParsedProduct, toParsedProducts } from './types';

const STORE_LIMIT = Number(process.env.OSHER_AD_STORE_LIMIT || 20);

export async function fetchAndParse(): Promise<ParsedProduct[]> {
  const items = await fetchCerberusItems('osherad', STORE_LIMIT);
  return toParsedProducts(items);
}
