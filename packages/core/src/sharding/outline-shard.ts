import {
  SchemaValidationError,
  type Outline,
  type OutlineSection,
  type OutlineSpec,
  type OutlineSpecSection,
} from "@ao/shared";
import { buildShards, verifyShards, type ShardItem } from "./shard.js";

export interface SectionOwnership {
  sectionId: string;
  ownerTaskId: string;
}

function taskIdFor(stageId: string, index: number): string {
  return `${stageId}#${String(index)}`;
}

function toShardItem(section: OutlineSpecSection): ShardItem {
  const item: ShardItem = { id: section.id, weight: section.expectedOutputTokens };
  if (section.deliverableKind === "files") item.path = section.path;
  return item;
}

/**
 * P8-T2 — "פילוח לפי שלד: בעלות בלעדית לכל סעיף/קובץ". Reuses P5-T5's
 * `buildShards`/`verifyShards` (`./shard.js`) rather than duplicating
 * fan-out logic: calling `buildShards(items, items.length)` degenerates
 * the general N-way bin-packer into exactly "one shard per section",
 * which is provably what it does whenever `count === groups.length` —
 * `buildShards` always places the next (weighted) group into the
 * currently-*lightest* shard, every shard starts at weight 0, and there
 * are as many shards as groups, so induction over the placement order
 * guarantees each group lands in a still-untouched (weight-0) shard until
 * every shard holds exactly one. That is precisely "each agent gets
 * exclusive ownership of ONE section or file" (ARCHITECTURE.md §6) — a
 * stricter case of sharding, not a different mechanism, so this module
 * stays a thin wrapper instead of a parallel implementation.
 *
 * Enforcement happens here, not just as documentation: `verifyShards`'s
 * result is checked and **thrown** on, so a malformed outline (e.g. two
 * distinct section ids that name the same file `path`, the "shared-file"
 * violation kind) can never silently produce ownership with an unowned or
 * double-owned section — this is what makes P8-T2's own done-criterion
 * ("נאכף בזמן הפילוח", not merely tested) true at the call site a real
 * scheduler would make, not only in a unit test that calls `verifyShards`
 * directly.
 */
export function planSectionOwnership(stageId: string, spec: OutlineSpec): SectionOwnership[] {
  const items = spec.sections.map(toShardItem);
  const shards = buildShards(items, items.length);
  const violations = verifyShards(items, shards);
  if (violations.length > 0) {
    throw new SchemaValidationError(
      `outline "${spec.id}" failed exclusive-ownership sharding: ${violations.map((v) => v.detail).join("; ")}`,
      { details: { outlineId: spec.id, violations } },
    );
  }

  return shards.map((shard, index) => {
    const item = shard.items[0];
    if (!item || shard.items.length !== 1) {
      // Unreachable given buildShards(items, items.length)'s guarantee above
      // — kept as a hard invariant check rather than a silent `!`, since a
      // future change to buildShards's packing heuristic could otherwise
      // violate it without any test here noticing until much later.
      throw new SchemaValidationError(
        `outline "${spec.id}" produced shard ${String(index)} with ${String(shard.items.length)} section(s), expected exactly 1`,
        { details: { outlineId: spec.id, shardIndex: index } },
      );
    }
    return { sectionId: item.id, ownerTaskId: taskIdFor(stageId, index) };
  });
}

/**
 * Turns a validated `OutlineSpec` (the outliner's own output, P8-T1) plus
 * its computed ownership into the Blackboard-shaped `Outline` (P5-T9) —
 * attaching the two runtime fields (`ownerTaskId`, `status`) the outliner
 * itself can't know yet. Every section must already have an owner (call
 * `planSectionOwnership` first); a missing one is a caller bug, not a data
 * problem, so it throws rather than silently skipping the section.
 */
export function attachOwnership(spec: OutlineSpec, ownership: readonly SectionOwnership[]): Outline {
  const ownerBySection = new Map(ownership.map((o) => [o.sectionId, o.ownerTaskId]));
  const sections: OutlineSection[] = spec.sections.map((section) => {
    const ownerTaskId = ownerBySection.get(section.id);
    if (ownerTaskId === undefined) {
      throw new SchemaValidationError(
        `section "${section.id}" of outline "${spec.id}" has no assigned owner — call planSectionOwnership first`,
      );
    }
    return { id: section.id, title: section.title, ownerTaskId, status: "pending" };
  });
  return { id: spec.id, sections };
}
