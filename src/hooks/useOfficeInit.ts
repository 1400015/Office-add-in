import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  getHost,
  getPlatform,
  waitForOfficeReady,
} from "../services/OfficeService";
import { logger } from "../services/LoggerService";

export function useOfficeInit(): boolean {
  const setOfficeInfo = useAppStore((s) => s.setOfficeInfo);
  const hydrate = useAppStore((s) => s.hydrate);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      const ready = await waitForOfficeReady();
      // Load the settings before publishing the host. Ribbon commands use the
      // host as their trigger, so they must not run against empty configs.
      await hydrate();
      if (cancelled) return;
      if (ready) {
        setOfficeInfo(getHost(), getPlatform());
      } else {
        logger.warn("office", "Running outside Office host (dev mode)");
        setOfficeInfo("unknown", "unknown");
      }
    }

    void init().catch((error: unknown) => {
      logger.error("office", "Failed to initialize settings", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [setOfficeInfo, hydrate]);
  return failed;
}
