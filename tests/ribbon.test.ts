// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerRibbonActions } from "../src/commands/ribbon";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.__ouaiCommand = undefined;
});

describe("ribbon commands", () => {
  function register() {
    const handlers = new Map<
      string,
      (event: { completed: () => void }) => void
    >();
    vi.stubGlobal("Office", {
      actions: {
        associate: (
          name: string,
          handler: (event: { completed: () => void }) => void
        ) => handlers.set(name, handler),
      },
      addin: { showAsTaskpane: vi.fn().mockResolvedValue(undefined) },
    });
    registerRibbonActions();
    return handlers;
  }

  it.each(["Summarize", "Translate", "Analyse"])(
    "completes %s after dispatching",
    (name) => {
      const handlers = register();
      const listener = vi.fn();
      window.addEventListener("ouai:command", listener, { once: true });
      const completed = vi.fn();
      handlers.get(name)!({ completed });
      expect(listener).toHaveBeenCalledOnce();
      expect(window.__ouaiCommand).toBe(name);
      expect(completed).toHaveBeenCalledOnce();
    }
  );

  it("completes exactly once even when dispatch throws", () => {
    const handlers = register();
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => {
      throw new Error("dispatch failed");
    });
    const completed = vi.fn();
    expect(() => handlers.get("Translate")!({ completed })).toThrow(
      "dispatch failed"
    );
    expect(completed).toHaveBeenCalledOnce();
  });
});
