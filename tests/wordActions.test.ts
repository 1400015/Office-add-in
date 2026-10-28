import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fixGrammar,
  rewriteSelection,
  translateSelection,
} from "../src/word/wordActions";

function installWord(selection: string, body = ""): { inserted: string[] } {
  const inserted: string[] = [];
  vi.stubGlobal("Word", {
    InsertLocation: { replace: "Replace", end: "End" },
    run: async (callback: (context: unknown) => Promise<unknown>) =>
      callback({
        document: {
          getSelection: () => ({
            text: selection,
            load: () => {},
            insertText: (text: string, location: string) => {
              inserted.push(`${location}:${text}`);
            },
          }),
          body: { text: body, load: () => {} },
        },
        sync: async () => {},
      }),
  });
  return { inserted };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Word in-place edits", () => {
  it("replaces the selection and drops a code fence", async () => {
    const { inserted } = installWord("texto cru");
    const result = await rewriteSelection(async () => "```\ntexto limpo\n```");
    expect(result).toBe("texto limpo");
    expect(inserted).toEqual(["Replace:texto limpo"]);
  });

  it("translates the selection into the document", async () => {
    const { inserted } = installWord("coração");
    const result = await translateSelection("English", async (prompt) => {
      expect(prompt).toContain("English");
      expect(prompt).toContain("coração");
      return "heart";
    });
    expect(result).toBe("heart");
    expect(inserted).toEqual(["Replace:heart"]);
  });

  it("does not replace the document when nothing is selected", async () => {
    const { inserted } = installWord("", "documento inteiro");
    const result = await fixGrammar(async () => "documento revisto");
    expect(result).toBe("documento revisto");
    expect(inserted).toEqual([]);
  });
});
