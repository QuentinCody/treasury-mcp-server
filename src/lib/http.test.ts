import { afterEach, expect, it, vi } from "vitest";
import { treasuryFetch } from "./http";

afterEach(() => vi.unstubAllGlobals());
it("encodes parameter names/values once and requests JSON without redirects", async () => {
  const mock = vi.fn(async () => Response.json({})); vi.stubGlobal("fetch", mock);
  await treasuryFetch("/v1/accounting/od/rates_of_exchange", { "page[size]": 2, filter: "country_currency_desc:eq:Euro Zone-Euro", unused: null });
  const [url, options] = mock.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.searchParams.get("page[size]")).toBe("2");
  expect(url.searchParams.get("filter")).toBe("country_currency_desc:eq:Euro Zone-Euro");
  expect(url.searchParams.has("unused")).toBe(false);
  expect(options).toMatchObject({ method: "GET", redirect: "manual" });
});
it.each(["//evil.test", "/v1/../admin", "/v1/x?filter=y", "/v1/%2e%2e/x", "/v1/x#y"]) ("rejects unsafe path %s", async path => {
  await expect(treasuryFetch(path, {})).rejects.toThrow("resource path");
});
it.each(["http://proxy.test", "https://user:pass@proxy.test", "https://proxy.test?x=1"]) ("rejects unsafe base %s", async proxyUrl => {
  await expect(treasuryFetch("/v1/x", {}, { proxyUrl })).rejects.toThrow("base URL");
});
