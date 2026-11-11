import { treasuryFetch } from "./http";

async function readBody(response: Response, preserveErrorBody: boolean, signal: AbortSignal): Promise<unknown> {
  if (!response.ok && !preserveErrorBody) {
    void response.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`Treasury HTTP ${response.status}`), { status: response.status });
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty Treasury response");
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const chunks: string[] = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4 * 1024 * 1024) throw new Error("Treasury response exceeds 4 MiB; reduce page size");
      chunks.push(decoder.decode(part.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    const raw = chunks.join("");
    const evidence = { response: raw, http_status: response.status, source_url: response.url || undefined,
      retry_after: response.headers.get("retry-after"), incomplete: true };
    if (response.status === 206 || response.headers.has("content-range")) {
      throw Object.assign(new Error("Unexpected partial Treasury response"), { status: 502, data: preserveErrorBody ? { ...evidence, content_range: response.headers.get("content-range") } : undefined });
    }
    let data: unknown;
    try { data = JSON.parse(raw); }
    catch {
      if (response.ok) throw Object.assign(new Error("Treasury returned invalid JSON"), { status: 502, data: preserveErrorBody ? evidence : undefined });
    }
    if (!response.ok) throw Object.assign(new Error(`Treasury HTTP ${response.status}`), { status: response.status, data: { ...evidence, problem: data } });
    return data;
  } finally { signal.removeEventListener("abort", cancel); cancel(); reader.releaseLock(); }
}

export async function readTreasuryResponse(fetchResponse: (signal: AbortSignal) => Promise<Response>, preserveErrorBody = true) {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("Treasury read exceeded 25 seconds")); }, 25000);
  });
  try {
    return await Promise.race([
      fetchResponse(controller.signal).then(async response => ({ data: await readBody(response, preserveErrorBody, controller.signal), response })), deadline,
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
}

export async function readTreasury(path: string, params: Record<string, unknown>, proxyUrl?: string): Promise<unknown> {
  return (await readTreasuryResponse(signal => treasuryFetch(path, params, { proxyUrl, signal }), proxyUrl === undefined)).data;
}
