import { NextResponse } from "next/server";
import {
  ImportError,
  importFileSchema,
  importUserData,
  type ImportMode,
} from "@/lib/services/import";
import {
  handleRouteError,
  jsonError,
  requireSessionForWrite,
} from "@/lib/utils/api";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Five megabytes is roughly a hundred thousand applications — far past any real
 * account, and small enough that the body can be read and parsed in memory
 * without thinking about it.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Read the request body, giving up as soon as it exceeds the cap.
 *
 * `await request.text()` buffers whatever arrives before any check can run, and
 * `Content-Length` is the client's claim, not a fact — a self-hosted container
 * with a modest memory limit is exactly where an unbounded body hurts. So the
 * cap is enforced on the stream, and the header check above it is only a cheap
 * early exit.
 */
async function readBoundedBody(request: Request): Promise<string | null> {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Import a Ghosted export (`?mode=merge` by default, `?mode=replace` to empty
 * the account first). The response reports what landed, so the UI can say
 * "42 applications, 3 skipped" rather than "done".
 */
export async function POST(request: Request) {
  try {
    const userId = await requireSessionForWrite("import");

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      return jsonError(413, "That file is too large to import", "FILE_TOO_LARGE");
    }

    const raw = await readBoundedBody(request);
    if (raw === null) {
      return jsonError(413, "That file is too large to import", "FILE_TOO_LARGE");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError(
        400,
        "That is not a Ghosted export — the file is not valid JSON",
        "INVALID_JSON",
      );
    }

    const parsed = importFileSchema.safeParse(body);
    if (!parsed.success) {
      // The first few issues only: a wall of Zod paths helps nobody reading a
      // toast, and the full list is in the log for whoever is debugging.
      logger.warn(
        { userId, issues: parsed.error.issues.slice(0, 10) },
        "import rejected",
      );
      return jsonError(
        400,
        "That file does not look like a Ghosted export",
        "INVALID_IMPORT",
        parsed.error.issues.slice(0, 5).map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    const mode: ImportMode =
      new URL(request.url).searchParams.get("mode") === "replace"
        ? "replace"
        : "merge";

    const result = await importUserData(userId, parsed.data, mode);
    logger.info({ userId, ...result }, "import finished");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ImportError) {
      return jsonError(400, err.message, err.code);
    }
    return handleRouteError(err);
  }
}
