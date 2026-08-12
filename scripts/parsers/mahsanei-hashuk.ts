import { fetchLaibcatalogItems } from './laibcatalog';
import { ParsedBranchFeed, toParsedProducts } from './types';

const MAHSANEI_HASHUK_CHAIN_ID = '7290661400001';
const BRANCH_LIMIT = Number(process.env.MAHSANEI_HASHUK_BRANCH_LIMIT || Infinity);

export async function fetchAndParse(): Promise<ParsedBranchFeed[]> {
  const branchFeeds = await fetchLaibcatalogItems(MAHSANEI_HASHUK_CHAIN_ID, BRANCH_LIMIT);
  return branchFeeds.map((feed) => ({ externalId: feed.branchNumber, items: toParsedProducts(feed.items) }));
}
