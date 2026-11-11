import { afterEach, expect, it, vi } from "vitest";
import { readTreasury } from "./read";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const path = "/v2/accounting/od/debt_to_penny";

it("preserves native amounts, nulls and metadata without rounding", async () => {
  const native = { data: [{ amount: "40097178119750.91", missing: null }], meta: { count: 1 }, links: { next: null } };
  vi.stubGlobal("fetch", async () => Response.json(native));
  expect(await readTreasury(path, {})).toEqual(native);
});
it("does not expose a configured proxy error body", async () => {
  vi.stubGlobal("fetch", async () => new Response("private proxy diagnostics", { status: 503 }));
  const error = await readTreasury(path, {}, "https://proxy.test").catch(error => error);
  expect(error).toMatchObject({ message: "Treasury HTTP 503", status: 503 });
  expect(error).not.toHaveProperty("data");
});
it("retains complete bounded public HTTP problem details", async () => {
  const problem = { error: "Invalid query", message: "α".repeat(20000), details: { field: "001" } };
  const raw = JSON.stringify(problem);
  vi.stubGlobal("fetch", async () => new Response(raw, { status: 400, headers: { "retry-after": "10" } }));
  await expect(readTreasury(path, {})).rejects.toMatchObject({ status: 400, data: { response: raw, problem, http_status: 400, retry_after: "10" } });
});
it.each([{ status: 206 }, { headers: { "content-range": "bytes 0-1/10" } }])("rejects a partial success with evidence", async options => {
  vi.stubGlobal("fetch", async () => new Response("{}", options));
  await expect(readTreasury(path, {})).rejects.toMatchObject({ status: 502, data: { response: "{}", incomplete: true } });
});
it("cancels a stalled read without waiting on a stalled cancellation", async () => {
  vi.useFakeTimers(); const cancel = vi.fn(() => new Promise<void>(() => {}));
  vi.stubGlobal("fetch", async () => new Response(new ReadableStream({ cancel })));
  const assertion = expect(readTreasury(path, {})).rejects.toThrow("25 seconds");
  await vi.advanceTimersByTimeAsync(25000); await assertion;
  expect(cancel).toHaveBeenCalledTimes(1);
});
it.each(["not json", '{"data":', new Uint8Array([0xff])])("rejects invalid JSON/UTF-8", async body => {
  vi.stubGlobal("fetch", async () => new Response(body));
  await expect(readTreasury(path, {})).rejects.toThrow();
});
it("bounds streamed bytes independently of content-length", async () => {
  vi.stubGlobal("fetch", async () => new Response(" ".repeat(4 * 1024 * 1024 + 1)));
  await expect(readTreasury(path, {})).rejects.toThrow("4 MiB");
});
it("rejects an absent body", async () => {
  vi.stubGlobal("fetch", async () => new Response(null));
  await expect(readTreasury(path, {})).rejects.toThrow("Empty Treasury response");
});
it("bounds a stalled body and aborts the request", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => {
    signal = options.signal ?? undefined;
    return new Response(new ReadableStream({ start() {} }));
  });
  const assertion = expect(readTreasury(path, {})).rejects.toThrow("25 seconds");
  await vi.advanceTimersByTimeAsync(25000); await assertion;
  expect(signal?.aborted).toBe(true);
});
