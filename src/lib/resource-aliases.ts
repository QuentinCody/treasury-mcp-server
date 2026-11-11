/** Compatibility spellings map only to the verified equivalent resource. */
export const resourceAliases: Record<string, string> = {
  "/v2/accounting/od/auctions_query": "/v1/accounting/od/auctions_query",
  "/v2/accounting/od/upcoming_auctions": "/v1/accounting/od/upcoming_auctions",
  "/v1/accounting/od/gold_reserve": "/v2/accounting/od/gold_reserve",
};
