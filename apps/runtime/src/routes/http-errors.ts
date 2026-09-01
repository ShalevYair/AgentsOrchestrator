import { toSerializedError, type SerializedError } from "@ao/shared";
import type { FastifyReply } from "fastify";

const STATUS_BY_CODE: Partial<Record<SerializedError["code"], number>> = {
  NOT_FOUND: 404,
  PROVIDER_KEY_INVALID: 422,
  SCHEMA_VALIDATION_FAILED: 400,
  CONFIG_INVALID: 400,
};

/** Normalizes any thrown value into the same `{scope,code,message,recoverable}` wire shape used by the `error` WS event, with a best-effort HTTP status. */
export function sendAppError(reply: FastifyReply, error: unknown): void {
  const serialized = toSerializedError(error);
  const status = STATUS_BY_CODE[serialized.code] ?? 500;
  reply.code(status).send(serialized);
}
