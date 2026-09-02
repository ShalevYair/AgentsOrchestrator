/**
 * RFC 6902 JSON Patch — apply only (no library dependency; this project's
 * own convention throughout is a small hand-written implementation over a
 * third-party one where the surface needed is narrow and well-specified —
 * see e.g. P3-T3's PPTX extractor). Operates on a deep clone of the input
 * document, so a caller's original object is never mutated even when a
 * patch is later rejected by `patch.ts`'s validation layer.
 */

import { parsePointer } from "./json-pointer.js";

export type JsonPatchOp = "add" | "remove" | "replace" | "move" | "copy" | "test";

export interface JsonPatchOperationLike {
  op: JsonPatchOp;
  path: string;
  value?: unknown;
  from?: string;
}

export class JsonPatchApplyError extends Error {
  constructor(
    message: string,
    readonly opIndex: number,
  ) {
    super(message);
    this.name = "JsonPatchApplyError";
  }
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) =>
        Object.hasOwn(b as Record<string, unknown>, key) &&
        deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }
  return false;
}

/** Navigates to the *parent* of the pointer's final segment, returning that parent plus the final key/index — every op below acts on a (container, key) pair rather than re-walking the tree itself. */
function resolveParent(root: unknown, pointer: string): { container: unknown; key: string } {
  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new Error("root document cannot be targeted directly by add/remove/replace");
  }
  const key = segments[segments.length - 1]!;
  let container: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    if (Array.isArray(container)) {
      const index = Number(segment);
      if (!/^(0|[1-9]\d*)$/.test(segment) || index >= container.length) {
        throw new Error(`path segment "${segment}" does not resolve to an existing array index`);
      }
      container = container[index];
    } else if (container !== null && typeof container === "object") {
      if (!Object.hasOwn(container, segment)) {
        throw new Error(`path segment "${segment}" does not exist`);
      }
      container = (container as Record<string, unknown>)[segment];
    } else {
      throw new Error(`path segment "${segment}" cannot be traversed on a non-container value`);
    }
  }
  return { container, key };
}

function getValue(container: unknown, key: string): unknown {
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!/^(0|[1-9]\d*)$/.test(key) || index >= container.length) {
      throw new Error(`array index "${key}" does not exist`);
    }
    return container[index];
  }
  if (container !== null && typeof container === "object") {
    if (!Object.hasOwn(container, key)) throw new Error(`key "${key}" does not exist`);
    return (container as Record<string, unknown>)[key];
  }
  throw new Error("cannot read a property of a non-container value");
}

function setValue(container: unknown, key: string, value: unknown, mode: "add" | "replace"): void {
  if (Array.isArray(container)) {
    if (key === "-") {
      container.push(value);
      return;
    }
    const index = Number(key);
    if (!/^(0|[1-9]\d*)$/.test(key)) throw new Error(`invalid array index "${key}"`);
    if (mode === "add") {
      if (index > container.length) throw new Error(`array index "${key}" is out of bounds for add`);
      container.splice(index, 0, value);
    } else {
      if (index >= container.length) throw new Error(`array index "${key}" does not exist for replace`);
      container[index] = value;
    }
    return;
  }
  if (container !== null && typeof container === "object") {
    if (mode === "replace" && !Object.hasOwn(container, key)) {
      throw new Error(`key "${key}" does not exist for replace`);
    }
    (container as Record<string, unknown>)[key] = value;
    return;
  }
  throw new Error("cannot set a property on a non-container value");
}

function removeValue(container: unknown, key: string): unknown {
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!/^(0|[1-9]\d*)$/.test(key) || index >= container.length) {
      throw new Error(`array index "${key}" does not exist for remove`);
    }
    return container.splice(index, 1)[0];
  }
  if (container !== null && typeof container === "object") {
    if (!Object.hasOwn(container, key)) throw new Error(`key "${key}" does not exist for remove`);
    const value = (container as Record<string, unknown>)[key];
    delete (container as Record<string, unknown>)[key];
    return value;
  }
  throw new Error("cannot remove a property from a non-container value");
}

function applyOne(root: unknown, op: JsonPatchOperationLike): unknown {
  switch (op.op) {
    case "add": {
      const { container, key } = resolveParent(root, op.path);
      setValue(container, key, deepClone(op.value), "add");
      return root;
    }
    case "remove": {
      const { container, key } = resolveParent(root, op.path);
      removeValue(container, key);
      return root;
    }
    case "replace": {
      const { container, key } = resolveParent(root, op.path);
      setValue(container, key, deepClone(op.value), "replace");
      return root;
    }
    case "move": {
      if (op.from === undefined) throw new Error('"move" requires a "from" pointer');
      const source = resolveParent(root, op.from);
      const moved = removeValue(source.container, source.key);
      const dest = resolveParent(root, op.path);
      setValue(dest.container, dest.key, moved, "add");
      return root;
    }
    case "copy": {
      if (op.from === undefined) throw new Error('"copy" requires a "from" pointer');
      const source = resolveParent(root, op.from);
      const copied = deepClone(getValue(source.container, source.key));
      const dest = resolveParent(root, op.path);
      setValue(dest.container, dest.key, copied, "add");
      return root;
    }
    case "test": {
      const { container, key } = resolveParent(root, op.path);
      const actual = getValue(container, key);
      if (!deepEqual(actual, op.value)) {
        throw new Error(`"test" failed at "${op.path}": value does not match`);
      }
      return root;
    }
    default: {
      const exhaustive: never = op.op;
      throw new Error(`unknown JSON Patch op: ${String(exhaustive)}`);
    }
  }
}

/**
 * Applies `ops` in order to a deep clone of `document`, RFC 6902-style.
 * Throws `JsonPatchApplyError` (naming the failing op's index) on the
 * first operation that can't be applied — the whole patch is all-or-
 * nothing, matching `patch.ts`'s "a rejected patch changes nothing"
 * contract (that module is what actually decides *whether* to call this
 * at all; this function only knows how to apply a patch it's given, not
 * whether that patch should have been allowed).
 */
export function applyJsonPatch(document: unknown, ops: readonly JsonPatchOperationLike[]): unknown {
  let working = deepClone(document);
  ops.forEach((op, index) => {
    try {
      working = applyOne(working, op);
    } catch (error) {
      throw new JsonPatchApplyError(
        `op[${String(index)}] (${op.op} ${op.path}) failed: ${error instanceof Error ? error.message : String(error)}`,
        index,
      );
    }
  });
  return working;
}
