import { logger } from "../services/LoggerService";

export type RibbonCommand = "Summarize" | "Translate" | "Analyse";

declare global {
  interface Window {
    __ouaiCommand?: RibbonCommand;
  }
}

function handleCommand(action: RibbonCommand): void {
  logger.info("commands", `Ribbon command received: ${action}`);
  // The taskpane and the ribbon share the same runtime, so a custom event is
  // enough to deliver the command. The window flag covers the race where the
  // taskpane has not mounted its listener yet.
  window.__ouaiCommand = action;
  window.dispatchEvent(new CustomEvent("ouai:command", { detail: action }));
  try {
    const result = Office.addin?.showAsTaskpane?.();
    if (result) {
      void result.catch((error: unknown) => {
        logger.warn("commands", "Could not open the taskpane", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  } catch (error) {
    logger.warn("commands", "showAsTaskpane is not available", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Registers the ribbon actions. Must run in the shared runtime (the taskpane
 * page), so the commands can reach the React app through the same window.
 */
export function registerRibbonActions(): void {
  if (typeof Office === "undefined" || !Office.actions) return;
  try {
    Office.actions.associate("Summarize", () => handleCommand("Summarize"));
    Office.actions.associate("Translate", () => handleCommand("Translate"));
    Office.actions.associate("Analyse", () => handleCommand("Analyse"));
    logger.info("commands", "Ribbon actions registered");
  } catch (error) {
    logger.warn("commands", "Could not register ribbon actions", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
