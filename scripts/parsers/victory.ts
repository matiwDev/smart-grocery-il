import { fetchLaibcatalogItems } from './laibcatalog';
import { ParsedProduct, toParsedProducts } from './types';

// Confirmed live (Phase 11 probe): edi=7290696200003 has real branch data;
// the chain's second registered EDI (7290058103393) returned an empty branch
// list on the same platform, so only the working one is used here.
const VICTORY_CHAIN_ID = '7290696200003';
const BRANCH_LIMIT = Number(process.env.VICTORY_BRANCH_LIMIT || 20);

export async function fetchAndParse(): Promise<ParsedProduct[]> {
  const items = await fetchLaibcatalogItems(VICTORY_CHAIN_ID, BRANCH_LIMIT);
  return toParsedProducts(items);
}
