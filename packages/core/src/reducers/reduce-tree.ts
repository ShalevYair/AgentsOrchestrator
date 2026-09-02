import type { Reducer } from "./types.js";

/**
 * `local:reduce-tree` (PROTOCOLS.md §8) — "מיזוג היררכי לתוצאות רבות":
 * pairwise-combines `values` in a balanced binary-tree shape instead of one
 * long left fold. `combine` must be associative (recommended commutative
 * too, since the exact pairing depends on array length parity) — every
 * `local:*` combiner this project defines (finding-merge, string
 * concatenation, numeric sum) already is. Unlike the other `local:*`
 * reducers, this one is generic over what "combine" even means, so it isn't
 * a fixed-shape entry in `LOCAL_REDUCERS` — a caller supplies its own
 * `combine`/`empty` via `makeReduceTreeReducer` for whatever value type its
 * Stage actually produces.
 */
export function reduceTree<T>(values: readonly T[], combine: (a: T, b: T) => T, empty: T): T {
  if (values.length === 0) return empty;
  if (values.length === 1) return values[0] as T;
  const mid = Math.floor(values.length / 2);
  const left = reduceTree(values.slice(0, mid), combine, empty);
  const right = reduceTree(values.slice(mid), combine, empty);
  return combine(left, right);
}

/** Adapts `reduceTree` into the standard `Reducer<T, T>` shape (PROTOCOLS.md §8). Always reports zero gaps and `needsLlmStitch: false` — a hierarchical merge over already-valid values never itself discovers a gap; that's `combine`'s business if it wants to surface one via its own value shape. */
export function makeReduceTreeReducer<T>(combine: (a: T, b: T) => T, empty: T): Reducer<T, T> {
  return (inputs) => ({
    value: reduceTree(
      inputs.map((r) => r.value),
      combine,
      empty,
    ),
    gaps: [],
    needsLlmStitch: false,
  });
}
