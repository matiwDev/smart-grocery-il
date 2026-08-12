import { fetchCerberusItems } from './cerberus';
import { ParsedBranchFeed, toParsedProducts } from './types';

const STORE_LIMIT = Number(process.env.OSHER_AD_STORE_LIMIT || Infinity);

export async function fetchAndParse(): Promise<ParsedBranchFeed[]> {
  const branchFeeds = await fetchCerberusItems('osherad', STORE_LIMIT);
  return branchFeeds.map((feed) => ({ externalId: feed.storeId, items: toParsedProducts(feed.items) }));
}
