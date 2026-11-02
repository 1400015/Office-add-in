import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

/** Keep model availability current regardless of the selected taskpane tab. */
export function useModelCatalog(): void {
  const generation = useAppStore((s) => s.modelCatalog.generation);
  const reason = useAppStore((s) => s.modelCatalog.reason);
  const officeReady = useAppStore((s) => s.officeReady);
  const hydrated = useAppStore((s) => s.hydrated);
  const secretsLocked = useAppStore((s) => s.secretsLocked);
  const vaultBusy = useAppStore((s) => s.vaultBusy);
  const loadModelCatalog = useAppStore((s) => s.loadModelCatalog);

  useEffect(() => {
    if (!officeReady || !hydrated || secretsLocked || vaultBusy) return;
    const controller = new AbortController();
    const load = (): void => {
      void loadModelCatalog(controller.signal).catch(() => {
        const current = useAppStore.getState();
        if (
          !controller.signal.aborted &&
          current.modelCatalog.generation === generation &&
          current.officeReady &&
          current.hydrated &&
          !current.secretsLocked &&
          !current.vaultBusy
        )
          current.setError("errors.generic");
      });
    };
    const timer =
      reason === "config" ? window.setTimeout(load, 300) : undefined;
    if (timer === undefined) load();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    generation,
    reason,
    officeReady,
    hydrated,
    secretsLocked,
    vaultBusy,
    loadModelCatalog,
  ]);
}
