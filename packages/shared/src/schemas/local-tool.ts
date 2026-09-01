import { z } from "zod";

export const LocalToolRuntimeSchema = z.enum(["python", "node"]);
export type LocalToolRuntime = z.infer<typeof LocalToolRuntimeSchema>;

export const LocalToolSourceSchema = z.enum(["inline", "registry"]);
export type LocalToolSource = z.infer<typeof LocalToolSourceSchema>;

export const LocalToolExpectedOutputSchema = z.enum(["json", "text", "csv"]);
export type LocalToolExpectedOutput = z.infer<typeof LocalToolExpectedOutputSchema>;

export const LocalToolLimitsSchema = z.strictObject({
  timeoutMs: z.number().int().positive(),
  maxOutputBytes: z.number().int().positive(),
  memoryMb: z.number().int().positive(),
  network: z.boolean(),
});
export type LocalToolLimits = z.infer<typeof LocalToolLimitsSchema>;

/** PROTOCOLS.md §11. `inputs` is intentionally an open bag — its shape is per-tool. */
export const LocalToolSchema = z.strictObject({
  id: z.string().min(1),
  runtime: LocalToolRuntimeSchema,
  source: LocalToolSourceSchema,
  script: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
  limits: LocalToolLimitsSchema,
  expectedOutput: LocalToolExpectedOutputSchema,
});
export type LocalTool = z.infer<typeof LocalToolSchema>;

/** The `tool_result` NDJSON line a sandboxed run reports back. */
export const ToolResultSchema = z.strictObject({
  t: z.literal("tool_result"),
  toolId: z.string().min(1),
  ok: z.boolean(),
  data: z.unknown(),
  truncated: z.boolean(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;
