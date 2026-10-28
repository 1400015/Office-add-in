import { logger } from "../services/LoggerService";

type CommandAction = "Summarize" | "Translate" | "Analyse";

declare global {
  interface Window {
    __ouaiCommand?: CommandAction;
  }
}

function handleCommand(action: CommandAction): void {
  logger.info("commands", `Ribbon command received: ${action}`);
  window.__ouaiCommand = action;
  window.dispatchEvent(new CustomEvent("ouai:command", { detail: action }));
}

Office.onReady(() => {
  logger.info("commands", "Commands page ready, registering actions");
  Office.actions.associate("Summarize", () => {
    handleCommand("Summarize");
    return Promise.resolve();
  });
  Office.actions.associate("Translate", () => {
    handleCommand("Translate");
    return Promise.resolve();
  });
  Office.actions.associate("Analyse", () => {
    handleCommand("Analyse");
    return Promise.resolve();
  });
});

export {};
