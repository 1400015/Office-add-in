import { logger } from "../services/LoggerService";

type CommandAction = "Summarize" | "Translate" | "Analyse";

declare global {
  interface Window {
    __ouaiCommand?: CommandAction;
  }
}

function handleCommand(action: CommandAction): Promise<void> {
  logger.info("commands", `Ribbon command received: ${action}`);
  window.__ouaiCommand = action;
  window.dispatchEvent(new CustomEvent("ouai:command", { detail: action }));
  const show = Office.addin?.showAsTaskpane;
  if (!show) return Promise.resolve();
  return show().then(() => undefined);
}

Office.onReady(() => {
  logger.info("commands", "Commands page ready, registering actions");
  Office.actions.associate("Summarize", () => handleCommand("Summarize"));
  Office.actions.associate("Translate", () => handleCommand("Translate"));
  Office.actions.associate("Analyse", () => handleCommand("Analyse"));
});

export {};
