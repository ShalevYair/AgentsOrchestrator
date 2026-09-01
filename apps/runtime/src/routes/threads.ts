import { NotFoundError, SchemaValidationError } from "@ao/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context.js";
import { createThread, getThread, listThreads } from "../db/threads.repo.js";
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

function requireThread(ctx: AppContext, id: string): void {
  if (!getThread(ctx.driver, id)) {
    throw new NotFoundError(`thread ${id} not found`);
  }
}

export function registerThreadRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/threads", () => listThreads(ctx.driver));

  app.post("/api/threads", (request: FastifyRequest<{ Body: CreateThreadBody }>, reply) => {
    const trimmed = request.body?.title?.trim();
    const title = trimmed && trimmed.length > 0 ? trimmed : "New chat";
    const thread = createThread(ctx.driver, title);
    reply.code(201).send(thread);
  });

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
        requireThread(ctx, threadId);
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
        void runChatTurn({
          driver: ctx.driver,
          hub: ctx.hub,
          provider: ctx.provider,
          model: ctx.model,
          threadId,
          runId,
        }).catch((error: unknown) => {
          ctx.logger.error({ err: error, runId, threadId }, "chat turn failed");
        });

        reply.code(202).send({ runId, userMessage });
      } catch (error) {
        sendAppError(reply, error);
      }
    },
  );
}
