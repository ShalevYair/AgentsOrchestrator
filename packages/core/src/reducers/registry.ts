import { ConfigError } from "@ao/shared";
import { LOCAL_REDUCERS } from "./local-reducers.js";
import type { Reducer } from "./types.js";

export interface ReducerRegistry {
  /** Registers a new reducer under `id`. Throws if `id` is already taken — every id, built-in or custom, is claimed exactly once. */
  register: <I, O>(id: string, reducer: Reducer<I, O>) => void;
  /** Looks up a reducer by id. Throws a `ConfigError` naming every known id when `id` isn't registered — the same "fail loud, list what's real" shape `@ao/platform`'s `resolveOutputSchema` (P10-T1) uses for an unknown `schemaRef`. */
  resolve: <I, O>(id: string) => Reducer<I, O>;
  has: (id: string) => boolean;
  /** Every registered id, sorted. */
  list: () => string[];
}

/**
 * P10-T6 — "reducer מותאם נרשם ורץ בלי לגעת בליבה" (a custom reducer
 * registers and runs without touching the core). Unlike an agent's prompt
 * (P10-T1's `agent.md`) or a recipe's plan template (P10-T4's YAML), a
 * reducer's actual logic is executable code (PROTOCOLS.md §8's
 * `Reducer<I,O>`), not a document — there's no file format that could load
 * it generically. So "extensible registration" here means exactly what it
 * says: a plain, mutable id -> function map any caller *outside*
 * `packages/core` can call `.register()` on at runtime, no different from
 * how the 4 fixed-shape `local:*` reducers (`LOCAL_REDUCERS`,
 * local-reducers.ts) are pre-seeded into it below — those get no special
 * treatment beyond being registered first.
 *
 * `local:reduce-tree` and `llm:synthesize` are deliberately **not**
 * pre-seeded: both need a caller-supplied piece (a combiner / a
 * `fallbackValue`, see `reduce-tree.ts`/`llm-synthesize.ts`'s own comments)
 * that this registry's flat `Reducer<I,O>` shape has nowhere to hold — the
 * same reason `LOCAL_REDUCERS` itself already excludes them. A caller that
 * needs either still imports them directly; this registry was never their
 * only path to being used, so leaving them out isn't a regression.
 */
export function createReducerRegistry(): ReducerRegistry {
  const reducers = new Map<string, Reducer<unknown, unknown>>();
  for (const [id, reducer] of Object.entries(LOCAL_REDUCERS)) {
    reducers.set(id, reducer as Reducer<unknown, unknown>);
  }

  return {
    register<I, O>(id: string, reducer: Reducer<I, O>): void {
      if (reducers.has(id)) {
        throw new ConfigError(
          `reducer id "${id}" is already registered — every id must be claimed exactly once`,
        );
      }
      reducers.set(id, reducer as Reducer<unknown, unknown>);
    },
    resolve<I, O>(id: string): Reducer<I, O> {
      const reducer = reducers.get(id);
      if (!reducer) {
        throw new ConfigError(
          `no reducer registered for mergeStrategy "${id}" — known: ${[...reducers.keys()].sort().join(", ")}`,
        );
      }
      return reducer as Reducer<I, O>;
    },
    has(id: string): boolean {
      return reducers.has(id);
    },
    list(): string[] {
      return [...reducers.keys()].sort();
    },
  };
}
