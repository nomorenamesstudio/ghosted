/**
 * Reading an upstream body with a cap, rather than after the fact.
 *
 * `res.arrayBuffer()` takes whatever the upstream sends before any size check
 * runs, so a hostile or broken image host can make this process hold a gigabyte
 * in order to decide the body is not a 64 KB logo (static audit, first pass).
 * Measured on 2026-10-15: against an endless body `arrayBuffer()` never
 * returned, and the `AbortSignal.timeout` on the request did not end it either.
 */
export async function readCapped(
  res: Response,
  limit: number,
): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    if (!reader.closed) reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
