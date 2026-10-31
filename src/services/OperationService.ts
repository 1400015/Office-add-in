import type { ProviderId } from "../types";

export interface Operation {
  readonly id: number;
  readonly conversationId: string;
  readonly signal: AbortSignal;
  readonly provider: ProviderId;
  readonly model: string;
  assertCurrent(): void;
}

let nextId = 0;
let active: { operation: Operation; controller: AbortController } | null = null;

export const OperationService = {
  begin(
    conversationId: string,
    provider: ProviderId,
    model: string
  ): Operation | null {
    if (active) return null;
    const controller = new AbortController();
    const operation: Operation = {
      id: ++nextId,
      conversationId,
      provider,
      model,
      signal: controller.signal,
      assertCurrent() {
        if (active?.operation !== operation || controller.signal.aborted) {
          const error = new Error("Operation cancelled");
          error.name = "AbortError";
          throw error;
        }
      },
    };
    active = { operation, controller };
    return operation;
  },
  current(): Operation | null {
    return active?.operation ?? null;
  },
  cancel(): void {
    const previous = active;
    active = null;
    previous?.controller.abort();
  },
  finish(operation: Operation): void {
    if (active?.operation === operation) active = null;
  },
};
