import { fetchCerberusItems } from './cerberus';
import { ParsedBranchFeed, toParsedProducts } from './types';

const STORE_LIMIT = Number(process.env.YOHANANOF_STORE_LIMIT || Infinity);

export async function fetchAndParse(): Promise<ParsedBranchFeed[]> {
  const branchFeeds = await fetchCerberusItems('yohananof', STORE_LIMIT);
  return branchFeeds.map((feed) => ({ externalId: feed.storeId, items: toParsedProducts(feed.items) }));
}
