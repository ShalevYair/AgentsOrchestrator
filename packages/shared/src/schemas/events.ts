import { z } from "zod";
import {
  BudgetLevelSchema,
  RunIdSchema,
  Sha256Schema,
  StageIdSchema,
  TaskIdSchema,
  UsageSchema,
} from "./common.js";
import { NdjsonEnvelopeSchema } from "./agent-output.js";
import { CheckpointDecisionSchema, JsonPatchOperationSchema } from "./checkpoint.js";
import { PlanSchema } from "./plan.js";
import { TaskUnderstandingSchema } from "./understanding.js";

/**
 * PROTOCOLS.md §9 documents each event as a name -> payload row. We wrap
 * that payload in a `{ type, runId, seq, payload }` envelope (our own
 * addition, not shown verbatim in the doc) so the WebSocket layer
 * (P2-T6) can discriminate on `type` and reconnect using `seq` without
 * inspecting the payload shape first.
 */
function event<Type extends string, Payload extends z.ZodType>(type: Type, payload: Payload) {
  return z.strictObject({
    type: z.literal(type),
    runId: RunIdSchema,
    seq: z.number().int().nonnegative(),
    payload,
  });
}

export const RunStartedEventSchema = event(
  "run.started",
  z.strictObject({ runId: RunIdSchema, budget: z.number().int().positive(), mode: BudgetLevelSchema }),
);

export const IntakeProgressEventSchema = event(
  "intake.progress",
  z.strictObject({
    filesProcessed: z.number().int().nonnegative(),
    totalFiles: z.number().int().nonnegative(),
    bytesExtracted: z.number().int().nonnegative(),
  }),
);

export const UnderstandingReadyEventSchema = event("understanding.ready", TaskUnderstandingSchema);

export const PlanReadyEventSchema = event(
  "plan.ready",
  z.strictObject({
    plan: PlanSchema,
    estimatedTokens: z.number().int().nonnegative(),
    requiresApproval: z.boolean(),
  }),
);

export const PlanAmendedEventSchema = event(
  "plan.amended",
  z.strictObject({
    version: z.number().int().positive(),
    patch: z.array(JsonPatchOperationSchema),
    reason: z.string().min(1),
    diff: z.string(),
  }),
);

const StageLifecyclePayloadSchema = z.strictObject({
  stageId: StageIdSchema,
  taskCount: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative(),
  criteriaMet: z.array(z.string()),
});
export const StageStartedEventSchema = event("stage.started", StageLifecyclePayloadSchema);
export const StageFinishedEventSchema = event("stage.finished", StageLifecyclePayloadSchema);

export const TaskStartedEventSchema = event(
  "task.started",
  z.strictObject({
    taskId: TaskIdSchema,
    agentType: z.string().min(1),
    shard: z.string(),
    contextTokens: z.number().int().nonnegative(),
  }),
);

export const TaskDeltaEventSchema = event(
  "task.delta",
  z.strictObject({ taskId: TaskIdSchema, envelope: NdjsonEnvelopeSchema }),
);

export const TaskFinishedEventSchema = event(
  "task.finished",
  z.strictObject({
    taskId: TaskIdSchema,
    usage: UsageSchema,
    finishReason: z.string(),
    violations: z.number().int().nonnegative(),
  }),
);

export const LedgerUpdatedEventSchema = event(
  "ledger.updated",
  z.strictObject({
    spent: z.number().int().nonnegative(),
    committed: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    projection: z.number().int().nonnegative(),
    byStage: z.record(StageIdSchema, z.number().int().nonnegative()),
  }),
);

export const CheckpointDecisionEventSchema = event("checkpoint.decision", CheckpointDecisionSchema);

export const ToolExecutedEventSchema = event(
  "tool.executed",
  z.strictObject({
    toolId: z.string().min(1),
    script: z.string(),
    exitCode: z.number().int(),
    durationMs: z.number().int().nonnegative(),
    outputSize: z.number().int().nonnegative(),
  }),
);

export const EgressRecordedEventSchema = event(
  "egress.recorded",
  z.strictObject({
    callId: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    artifactRefs: z.array(z.string()),
    redactions: z.number().int().nonnegative(),
  }),
);

export const ArtifactProducedEventSchema = event(
  "artifact.produced",
  z.strictObject({
    path: z.string().min(1),
    sha256: Sha256Schema,
    sizeBytes: z.number().int().nonnegative(),
    op: z.enum(["create", "update", "delete", "rename"]),
  }),
);

/**
 * `deliverables` and `ledger` are intentionally z.unknown() here: their
 * concrete shapes belong to the assembler (P8/P9) and the Ledger snapshot
 * (P4-T1) respectively, neither of which exists yet. Typing them now would
 * mean guessing at another phase's contract.
 */
export const RunFinishedEventSchema = event(
  "run.finished",
  z.strictObject({
    status: z.string(),
    deliverables: z.array(z.unknown()),
    ledger: z.unknown(),
    gaps: z.array(z.unknown()),
  }),
);

export const ErrorEventSchema = event(
  "error",
  z.strictObject({
    scope: z.string(),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
);

export const RuntimeEventSchema = z.discriminatedUnion("type", [
  RunStartedEventSchema,
  IntakeProgressEventSchema,
  UnderstandingReadyEventSchema,
  PlanReadyEventSchema,
  PlanAmendedEventSchema,
  StageStartedEventSchema,
  StageFinishedEventSchema,
  TaskStartedEventSchema,
  TaskDeltaEventSchema,
  TaskFinishedEventSchema,
  LedgerUpdatedEventSchema,
  CheckpointDecisionEventSchema,
  ToolExecutedEventSchema,
  EgressRecordedEventSchema,
  ArtifactProducedEventSchema,
  RunFinishedEventSchema,
  ErrorEventSchema,
]);
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
