/**
 * P9-T11 / UX.md §2's "עצור" (stop) button. `run-chat.ts` has no
 * scheduler and no multi-request coordination — a stop request arrives on
 * an entirely separate HTTP request from the one running the chat turn,
 * so the only way to reach an in-flight `runChatTurn` call is a shared,
 * in-process handle keyed by `runId`. This is that handle: one
 * `AbortController` per currently-running run, registered for the
 * duration of the turn and checked between provider deltas.
 *
 * `AbortController` (not a plain boolean flag) because it's the one
 * cancellation primitive `packages/core`'s own `runScheduler` already
 * uses (`RunSchedulerOptions.signal`) — matching that shape means this
 * registry could hand its signal straight to a real scheduler later
 * without a redesign, even though nothing in `apps/runtime` calls
 * `runScheduler` today.
 */
export class RunRegistry {
  private readonly controllers = new Map<string, AbortController>();

  /** Called once, synchronously, at the very top of `runChatTurn` — before any `await` — so a stop request can never arrive before this exists. */
  register(runId: string): AbortController {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    return controller;
  }

  /** Always called from `runChatTurn`'s `finally`, on every exit path (completed, failed, or stopped) — an entry must never outlive the turn it was created for. */
  unregister(runId: string): void {
    this.controllers.delete(runId);
  }

  /**
   * Returns `true` if `runId` was actually live and just got signalled;
   * `false` if it wasn't tracked at all (already finished, or never
   * existed) — a benign, expected race the caller treats as a no-op, not
   * an error: the client may not know the run just finished on its own.
   */
  requestStop(runId: string): boolean {
    const controller = this.controllers.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }
}
