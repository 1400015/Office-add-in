import type { ProviderConfig } from "../../../types";
import { friendlyError } from "../../../services/ErrorService";

export type I18nLabel = (
  key: string,
  options?: Record<string, unknown>
) => string;
export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export async function runConnectionTest(
  probe: (
    config: ProviderConfig,
    signal?: AbortSignal
  ) => Promise<{ modelCount?: number }>,
  config: ProviderConfig,
  t: I18nLabel,
  signal?: AbortSignal
): Promise<ConnectionTestResult> {
  try {
    const result = await probe(config, signal);
    return {
      ok: true,
      message:
        result.modelCount === undefined
          ? t("settings.connectionSuccess")
          : t("settings.connectionOk", { count: result.modelCount }),
    };
  } catch (error) {
    const key = friendlyError(error, { provider: config.id });
    return {
      ok: false,
      message: t(key.startsWith("errors.") ? key : `errors.${key}`),
    };
  }
}
