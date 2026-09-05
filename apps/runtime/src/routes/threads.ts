import { GoalConfigSchema, isAppError, NotFoundError, SchemaValidationError } from "@ao/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context.js";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  updateThreadGoalConfig,
  type Thread,
} from "../db/threads.repo.js";
import { insertMessage, listMessages } from "../db/messages.repo.js";
import { genRunId } from "../db/ids.js";
import { runChatTurn } from "../chat/run-chat.js";
import { sendAppError } from "./http-errors.js";

interface CreateThreadBody {
  title?: string;
}

interface PostMessageBody {
  content?: string;
}

interface ThreadParams {
  id: string;
}

function requireThread(ctx: AppContext, id: string): Thread {
  const thread = getThread(ctx.driver, id);
  if (!thread) {
    throw new NotFoundError(`thread ${id} not found`);
  }
  return thread;
}

export function registerThreadRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/threads", () => listThreads(ctx.driver));

  app.post("/api/threads", (request: FastifyRequest<{ Body: CreateThreadBody }>, reply) => {
    const trimmed = request.body?.title?.trim();
    const title = trimmed && trimmed.length > 0 ? trimmed : "New chat";
    const thread = createThread(ctx.driver, title);
    reply.code(201).send(thread);
  });

  app.delete("/api/threads/:id", (request: FastifyRequest<{ Params: ThreadParams }>, reply) => {
    try {
      requireThread(ctx, request.params.id);
      deleteThread(ctx.driver, request.params.id);
      reply.code(204).send();
    } catch (error) {
      sendAppError(reply, error);
    }
  });

  app.put(
    "/api/threads/:id/goal-config",
    (request: FastifyRequest<{ Params: ThreadParams; Body: unknown }>, reply) => {
      try {
        requireThread(ctx, request.params.id);
        const parsed = GoalConfigSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new SchemaValidationError(`invalid goal config: ${parsed.error.message}`);
        }
        updateThreadGoalConfig(ctx.driver, request.params.id, parsed.data);
        reply.code(200).send(parsed.data);
      } catch (error) {
        sendAppError(reply, error);
      }
    },
  );

  app.get("/api/threads/:id/messages", (request: FastifyRequest<{ Params: ThreadParams }>, reply) => {
    try {
      requireThread(ctx, request.params.id);
      reply.send(listMessages(ctx.driver, request.params.id));
    } catch (error) {
      sendAppError(reply, error);
    }
  });

  app.post(
    "/api/threads/:id/messages",
    (request: FastifyRequest<{ Params: ThreadParams; Body: PostMessageBody }>, reply) => {
      try {
        const threadId = request.params.id;
        const thread = requireThread(ctx, threadId);
        const content = request.body?.content?.trim();
        if (!content) {
          throw new SchemaValidationError("message content must be a non-empty string");
        }

        const userMessage = insertMessage(ctx.driver, { threadId, role: "user", content });
        const runId = genRunId();

        // Not awaited: the HTTP response hands the client `runId` right
        // away so it can subscribe over WS before streaming starts (see
        // runChatTurn's doc comment). Errors from here on surface as an
        // `error` WS event (published inside runChatTurn) plus a logged
        // rejection here as a last-resort net.
        const startedAt = Date.now();
        void runChatTurn({
          driver: ctx.driver,
          hub: ctx.hub,
          provider: ctx.provider,
          runRegistry: ctx.runRegistry,
          model: ctx.model,
          threadId,
          runId,
          goalConfig: thread.goalConfig,
        })
          .then(() => {
            // P12-T7: duration only — this walking-skeleton chat path (P2)
            // has no rich usage/degradation summary to thread back through
            // RunChatTurnResult without touching its already-well-tested
            // internals; that richer event can grow once the real
            // Scheduler/Plan path replaces it.
            ctx.telemetry.record({ type: "run_completed", durationMs: Date.now() - startedAt });
          })
          .catch((error: unknown) => {
            ctx.logger.error({ err: error, runId, threadId }, "chat turn failed");
            const errorCode = isAppError(error) ? error.code : "UNKNOWN_ERROR";
            ctx.telemetry.record({ type: "run_failed", durationMs: Date.now() - startedAt, errorCode });
          });

        reply.code(202).send({ runId, userMessage });
      } catch (error) {
        sendAppError(reply, error);
      }
    },
  );
}
