/**
 * RFC 6901 JSON Pointer — parsing and resolution only (no mutation; that's
 * `json-patch-apply.ts`'s job). Shared by patch application's value-level
 * checks (P6-T3, e.g. "read the current `tokenBudget.hardCap` before
 * deciding whether a `replace` moves it downward") and diff formatting
 * (P6-T4, "show old → new for a `replace`").
 */

/** Splits `/a/b~1c/2` into `["a", "b/c", "2"]`, undoing `~1` → `/` and `~0` → `~` per RFC 6901 §3. An empty pointer `""` (the whole document) yields `[]`. */
export function parsePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(`invalid JSON Pointer (must start with "/" or be empty): ${pointer}`);
  }
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export type PointerLookup = { found: true; value: unknown } | { found: false };

/** Resolves `pointer` against `document`, walking one segment at a time. Never throws on a missing path — `found: false` covers both "the parent doesn't exist" and "the key/index doesn't exist on it". */
export function resolvePointer(document: unknown, pointer: string): PointerLookup {
  const segments = parsePointer(pointer);
  let current: unknown = document;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (index < 0 || index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (current !== null && typeof current === "object") {
      if (!Object.hasOwn(current, segment)) return { found: false };
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return { found: false };
  }
  return { found: true, value: current };
}
