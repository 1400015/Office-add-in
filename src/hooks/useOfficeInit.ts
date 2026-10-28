import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  getHost,
  getPlatform,
  waitForOfficeReady,
} from "../services/OfficeService";
import { logger } from "../services/LoggerService";

export function useOfficeInit(): void {
  const setOfficeInfo = useAppStore((s) => s.setOfficeInfo);
  const hydrate = useAppStore((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      const ready = await waitForOfficeReady();
      if (cancelled) return;
      if (ready) {
        setOfficeInfo(getHost(), getPlatform());
      } else {
        logger.warn("office", "Running outside Office host (dev mode)");
        setOfficeInfo("unknown", "unknown");
      }
      await hydrate();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [setOfficeInfo, hydrate]);
}
