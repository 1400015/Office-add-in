import { IncompleteResponseError, type ProviderId } from "../types";

/** Older compatible endpoints may omit completion metadata. If present, it
 * must describe a normal text completion before its output can be applied. */
export function assertResponseComplete(
  provider: ProviderId,
  result: string,
  reason: unknown,
  normalReasons: readonly string[]
): void {
  if (reason === undefined || reason === null) return;
  if (typeof reason !== "string" || !normalReasons.includes(reason)) {
    throw new IncompleteResponseError(
      provider,
      result,
      typeof reason === "string" ? reason : "invalid-completion-reason"
    );
  }
}
