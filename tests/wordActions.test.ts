import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fixGrammar,
  generateAndInsert,
  rewriteSelection,
  translateSelection,
} from "../src/word/wordActions";

function installWord(
  selection: string,
  body = ""
): {
  inserted: string[];
  insertedTargets: number[];
  targets: Array<{
    text: string;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
  }>;
  select: (text: string) => void;
} {
  const inserted: string[] = [];
  const insertedTargets: number[] = [];
  const targets: Array<{
    text: string;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
  }> = [];
  const makeTarget = (text: string) => {
    const id = targets.length;
    const target = {
      text,
      load: vi.fn(),
      track: vi.fn(),
      untrack: vi.fn(),
      insertText: (value: string, location: string) => (
        inserted.push(`${location}:${value}`),
        insertedTargets.push(id)
      ),
    };
    targets.push(target);
    return target;
  };
  let selected = makeTarget(selection);
  const context = {
    document: {
      getSelection: () => selected,
      body: { text: body, load: () => {} },
    },
    sync: async () => {},
  };
  vi.stubGlobal("Word", {
    InsertLocation: { replace: "Replace", end: "End" },
    run: async (
      first: unknown,
      second?: (context: unknown) => Promise<unknown>
    ) => (typeof first === "function" ? first : second!)(context),
  });
  return {
    inserted,
    insertedTargets,
    targets,
    select: (text) => {
      selected = makeTarget(text);
    },
  };
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
  it("rejects a selection over the limit without calling the model", async () => {
    const { inserted } = installWord("a".repeat(60001));
    const prompt = vi.fn(async () => "new");
    await expect(rewriteSelection(prompt)).rejects.toThrow(
      "selection-too-long"
    );
    expect(prompt).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("writes the original selection even if the user selects another", async () => {
    const { inserted, insertedTargets, targets, select } =
      installWord("original");
    const result = await rewriteSelection(async () => {
      select("other");
      return "rewritten";
    });
    expect(result).toBe("rewritten");
    expect(inserted).toEqual(["Replace:rewritten"]);
    expect(insertedTargets).toEqual([0]);
    expect(targets[0]!.untrack).toHaveBeenCalledOnce();
    expect(targets[1]!.untrack).not.toHaveBeenCalled();
  });

  it("refuses edited targets and exposes the generated text", async () => {
    const { inserted, targets } = installWord("original");
    await expect(
      rewriteSelection(async () => {
        targets[0]!.text = "changed";
        return "rewritten";
      })
    ).rejects.toMatchObject({
      name: "ActionConflictError",
      result: "rewritten",
    });
    expect(inserted).toEqual([]);
    expect(targets[0]!.untrack).toHaveBeenCalledOnce();
  });

  it("rejects empty output and releases the target", async () => {
    const { inserted, targets } = installWord("original");
    await expect(rewriteSelection(async () => "```\n```")).rejects.toThrow(
      "empty-response"
    );
    expect(inserted).toEqual([]);
    expect(targets[0]!.untrack).toHaveBeenCalledOnce();
  });
  it("accepts a selection exactly at the limit", async () => {
    const { inserted } = installWord("a".repeat(60000));
    await rewriteSelection(async () => "replacement");
    expect(inserted).toEqual(["Replace:replacement"]);
  });

  it("releases the target and does not write if cancellation occurs during the prompt", async () => {
    const { inserted, targets } = installWord("original");
    const controller = new AbortController();
    const action = {
      signal: controller.signal,
      assertCurrent: () => {
        if (controller.signal.aborted) throw new Error("cancelled");
      },
    };
    await expect(
      rewriteSelection(async () => {
        controller.abort();
        return "rewritten";
      }, action)
    ).rejects.toThrow("cancelled");
    expect(inserted).toEqual([]);
    expect(targets[0]!.untrack).toHaveBeenCalledOnce();
  });
  it("releases the tracked selection after a provider error", async () => {
    const { targets, inserted } = installWord("original");
    await expect(
      rewriteSelection(async () => {
        throw new Error("offline");
      })
    ).rejects.toThrow("offline");
    expect(targets[0]!.untrack).toHaveBeenCalledOnce();
    expect(inserted).toEqual([]);
  });

  it("anchors generated text to the original selection", async () => {
    const { inserted, insertedTargets, select } = installWord("original");
    await generateAndInsert("instruction", async () => {
      select("other");
      return "generated";
    });
    expect(inserted).toEqual(["End:\ngenerated\n"]);
    expect(insertedTargets).toEqual([0]);
  });
});
