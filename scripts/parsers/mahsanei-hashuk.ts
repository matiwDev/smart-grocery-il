import { fetchLaibcatalogItems } from './laibcatalog';
import { ParsedProduct, toParsedProducts } from './types';

const MAHSANEI_HASHUK_CHAIN_ID = '7290661400001';
const BRANCH_LIMIT = Number(process.env.MAHSANEI_HASHUK_BRANCH_LIMIT || 20);

export async function fetchAndParse(): Promise<ParsedProduct[]> {
  const items = await fetchLaibcatalogItems(MAHSANEI_HASHUK_CHAIN_ID, BRANCH_LIMIT);
  return toParsedProducts(items);
}
