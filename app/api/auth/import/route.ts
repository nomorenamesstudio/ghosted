import { NextResponse } from "next/server";
import {
  ImportError,
  MAX_IMPORTED_APPLICATIONS,
  importFileSchema,
  importUserData,
  type ImportMode,
} from "@/lib/services/import";
import {
  handleRouteError,
  jsonError,
  requireSessionForWrite,
} from "@/lib/utils/api";
import { verifyCsrfToken } from "@/lib/utils/csrf";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Five megabytes is roughly a hundred thousand applications — far past any real
 * account, and small enough that the body can be read and parsed in memory
 * without thinking about it.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The most stream reads one body may take.
 *
 * `Content-Length` bounds the bytes, not the work: a peer framing those bytes as
 * tiny writes forces one retained `Uint8Array` per read, so a 5 MB chunked body
 * of one-byte frames means millions of objects retained (measured in the
 * 2026-10-14 static audit: ~1,000,000 reads, ~259 bytes RSS each, ~1.3 GB
 * projected). A real upload arrives in a few dozen reads — Next aggregates what
 * the socket delivered — so a generous cap costs nothing honest and turns the
 * framing trick into a 413.
 */
const MAX_READS = 8_192;

/**
 * Read the request body, giving up as soon as it exceeds the cap.
 *
 * `await request.text()` buffers whatever arrives before any check can run, and
 * `Content-Length` is the client's claim, not a fact — a self-hosted container
 * with a modest memory limit is exactly where an unbounded body hurts. So both
 * caps are enforced on the stream, and the header check above is only a cheap
 * early exit.
 */
async function readBoundedBody(request: Request): Promise<string | null> {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let reads = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    reads += 1;
    size += value.byteLength;
    if (size > MAX_BYTES || reads > MAX_READS) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Enough applications to be one file, checked before the elements are parsed.
 *
 * Zod validates array elements first and applies an array-level `.max()` after,
 * so the schema's cap cannot bound the parse work — a 5 MB document of `{}` rows
 * reached ~1.7M element parses, 11 s of CPU and ~3 GB of heap before the cap
 * reported (static audit 2026-10-14). This is a shape check, not a validation:
 * anything that is not an array here is left for the schema to describe
 * properly.
 */
function tooManyApplications(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const rows = (body as { applications?: unknown }).applications;
  return Array.isArray(rows) && rows.length > MAX_IMPORTED_APPLICATIONS;
}

/**
 * Import a Ghosted export (`?mode=merge` by default, `?mode=replace` to empty
 * the account first). The response reports what landed, so the UI can say
 * "42 applications, 3 skipped" rather than "done".
 */
export async function POST(request: Request) {
  try {
    const userId = await requireSessionForWrite("import");

    const mode: ImportMode =
      new URL(request.url).searchParams.get("mode") === "replace"
        ? "replace"
        : "merge";

    // `replace` deletes every application in the account before importing, and
    // it is the only hard delete in the app that a page can reach without
    // proving anything — the account route asks for the CSRF token and a
    // password for the same class of action. The file lands in the body, so the
    // token travels in a header the caller sets.
    if (
      mode === "replace" &&
      !verifyCsrfToken(request, request.headers.get("x-csrf-token"))
    ) {
      return jsonError(
        403,
        "Missing or invalid CSRF token — reload the page and try again",
        "INVALID_CSRF_TOKEN",
      );
    }

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

    // Before the schema: see `tooManyApplications`.
    if (tooManyApplications(body)) {
      return jsonError(
        413,
        `That file carries more than ${MAX_IMPORTED_APPLICATIONS} applications — import it in parts.`,
        "TOO_MANY_APPLICATIONS",
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
