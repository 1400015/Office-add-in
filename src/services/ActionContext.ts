/** Operation ownership shared with Office actions. */
export interface ActionContext {
  signal: AbortSignal;
  assertCurrent(): void;
  reportTruncation?(): void;
}

/** Generated content could not be safely applied to its original target. */
export class ActionConflictError extends Error {
  constructor(readonly result: string) {
    super("action-conflict");
    this.name = "ActionConflictError";
  }
}

export function isInvalidOfficeTarget(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === "string" &&
    /InvalidObjectPath|ItemNotFound|InvalidReference|InvalidArgument/i.test(
      code
    )
  );
}
