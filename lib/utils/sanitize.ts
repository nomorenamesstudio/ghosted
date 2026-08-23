/**
 * Sanitize free-text fields before they are stored. React escapes on render,
 * so this is defense-in-depth: strip <script> tags and event-handler
 * attributes, and neutralize javascript:/data: URI payloads.
 */
export function sanitizeText(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  return trimmed
    // Remove whole <script> elements (content included).
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " $1")
    .replace(/(href|src)\s*=\s*["']?\s*(javascript|data):/gi, "$1=\"\"")
    .trim();
}

const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/** Validate that a URL is a well-formed http/https URL (no javascript:/data:). */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (value == null || value.trim() === "") return true; // optional field
  return URL_RE.test(value.trim());
}
