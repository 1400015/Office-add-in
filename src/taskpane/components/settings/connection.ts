import type { ProviderConfig } from "../../../types";

/** Minimal shape of react-i18next's translation function used here. */
export type I18nLabel = (
  key: string,
  options?: Record<string, unknown>
) => string;

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Probe one provider with a forced model listing and translate the
 * outcome into the banner shown under its credentials accordion.
 */
export async function runConnectionTest(
  listModels: (
    config: ProviderConfig,
    forceRefresh?: boolean
  ) => Promise<unknown[]>,
  config: ProviderConfig,
  t: I18nLabel
): Promise<ConnectionTestResult> {
  try {
    const models = await listModels(config, true);
    return {
      ok: true,
      message: t("settings.connectionOk", { count: models.length }),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
