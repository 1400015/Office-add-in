import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampSlideCount,
  contentLanguageName,
  parseAlignedStrings,
  parseSlidePlans,
} from "../src/powerpoint/slidePlan";
import {
  createPresentation,
  explainSlide,
  fixSlideGrammar,
  generateSpeakerNotes,
  improveSlide,
  insertTextOnSlide,
  summarizePresentation,
  translateSlide,
} from "../src/powerpoint/powerpointActions";

interface FakeShape {
  id: string;
  name: string;
  type: string;
  textFrame: { textRange: { text: string } };
  delete: () => void;
}

interface FakeSlide {
  id: string;
  shapes: {
    items: FakeShape[];
    load: () => void;
    getItem: (id: string) => FakeShape;
    addTextBox: (text: string) => FakeShape;
  };
  load: () => void;
}

function shape(id: string, text: string, type = "TextBox"): FakeShape {
  const created: FakeShape = {
    id,
    name: "",
    type,
    textFrame: { textRange: { text } },
    delete: () => {},
  };
  return created;
}

function slide(id: string, texts: string[]): FakeSlide {
  const items = texts.map((text, index) => shape(`${id}-s${index}`, text));
  const slideRef: FakeSlide = {
    id,
    load: () => {},
    shapes: {
      items,
      load: () => {},
      getItem: (shapeId: string) => {
        const found = items.find((item) => item.id === shapeId);
        if (!found) throw new Error(`missing shape ${shapeId}`);
        return found;
      },
      addTextBox: (text: string) => {
        const created = shape(`${id}-new-${items.length}`, text);
        items.push(created);
        return created;
      },
    },
  };
  return slideRef;
}

function installPowerPoint(initial: FakeSlide[]): { slides: FakeSlide[] } {
  const slides = initial;
  const presentation = {
    slides,
    getSelectedSlides: () => ({
      items: slides[0] ? [slides[0]] : [],
      load: () => {},
    }),
    getSelectedTextRangeOrNullObject: undefined as
      | (() => { text: string; isNullObject: boolean; load: () => void })
      | undefined,
  };
  const api = {
    getCount: () => ({ value: slides.length }),
    getItem: (id: string) => {
      const found = slides.find((item) => item.id === id);
      if (!found) throw new Error(`missing slide ${id}`);
      return found;
    },
    getItemAt: (index: number) => {
      const found = slides[index];
      if (!found) throw new Error(`missing slide index ${index}`);
      return found;
    },
    add: () => {
      const created = slide(`slide-${slides.length + 1}`, []);
      const placeholder = shape(
        `${created.id}-ph`,
        "Click to add title",
        "Placeholder"
      );
      placeholder.delete = () => {
        const index = created.shapes.items.indexOf(placeholder);
        if (index >= 0) created.shapes.items.splice(index, 1);
      };
      created.shapes.items.unshift(placeholder);
      slides.push(created);
      return created;
    },
    load: () => {},
  };
  Object.assign(presentation, { slides: api });
  // Keep the array reachable for assertions via the same objects inside api.
  (api as { items?: FakeSlide[] }).items = slides;

  vi.stubGlobal("PowerPoint", {
    run: async (callback: (context: unknown) => Promise<unknown>) =>
      callback({
        presentation: {
          ...presentation,
          slides: api,
          getSelectedSlides: presentation.getSelectedSlides,
          getSelectedTextRangeOrNullObject:
            presentation.getSelectedTextRangeOrNullObject,
        },
        sync: async () => {},
      }),
  });
  return { slides };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("slide plan parsing", () => {
  it("names the UI language", () => {
    expect(contentLanguageName("pt-PT")).toBe("Portuguese");
    expect(contentLanguageName("en")).toBe("English");
  });

  it("clamps the slide count", () => {
    expect(clampSlideCount(0)).toBe(1);
    expect(clampSlideCount(6.4)).toBe(6);
    expect(clampSlideCount(40)).toBe(15);
    expect(clampSlideCount(Number.NaN)).toBe(5);
  });

  it("parses a fenced plan and trims extra slides", () => {
    const plans = parseSlidePlans(
      '```json\n[{"title":" A ","bullets":[" one "]},{"title":"B","bullets":["two"]},{"title":"C","bullets":[]}]\n```',
      2
    );
    expect(plans).toEqual([
      { title: "A", bullets: ["one"] },
      { title: "B", bullets: ["two"] },
    ]);
  });

  it("rejects a plan without titles", () => {
    expect(() => parseSlidePlans('[{"title":"","bullets":["x"]}]')).toThrow(
      /missing a title/i
    );
  });

  it("aligns rewritten strings and falls back for a single block", () => {
    expect(parseAlignedStrings('[" clearer "]', ["old"])).toEqual(["clearer"]);
    expect(parseAlignedStrings("just prose", ["old"])).toEqual(["just prose"]);
    expect(() => parseAlignedStrings("nope", ["a", "b"])).toThrow(
      /one text block/i
    );
  });
});

describe("PowerPoint actions", () => {
  it("writes improved text back onto the slide", async () => {
    const deck = installPowerPoint([slide("s1", ["Hello", "World"])]);
    const result = await improveSlide(async () =>
      JSON.stringify(["Olá", "Mundo"])
    );
    expect(result).toBe("Olá\n\nMundo");
    expect(
      deck.slides[0]?.shapes.items.map((item) => item.textFrame.textRange.text)
    ).toEqual(["Olá", "Mundo"]);
  });

  it("corrects grammar in place", async () => {
    const deck = installPowerPoint([slide("s1", ["teh cat"])]);
    await fixSlideGrammar(async () => JSON.stringify(["the cat"]));
    expect(deck.slides[0]?.shapes.items[0]?.textFrame.textRange.text).toBe(
      "the cat"
    );
  });

  it("translates each text block", async () => {
    const deck = installPowerPoint([slide("s1", ["Heart wall"])]);
    await translateSlide("Portuguese", async () =>
      JSON.stringify(["Parede cardíaca"])
    );
    expect(deck.slides[0]?.shapes.items[0]?.textFrame.textRange.text).toBe(
      "Parede cardíaca"
    );
  });

  it("explains and writes speaker notes without changing the slide", async () => {
    const deck = installPowerPoint([slide("s1", ["Mitral valve"])]);
    await expect(explainSlide(async (prompt) => prompt)).resolves.toMatch(
      /Mitral valve/
    );
    await expect(
      generateSpeakerNotes(async () => "Mention the leaflets.")
    ).resolves.toBe("Mention the leaflets.");
    expect(deck.slides[0]?.shapes.items[0]?.textFrame.textRange.text).toBe(
      "Mitral valve"
    );
  });

  it("refuses an empty slide", async () => {
    installPowerPoint([slide("s1", ["   "])]);
    await expect(improveSlide(async () => "[]")).rejects.toThrow(/no text/i);
  });

  it("summarizes every text block on the outline", async () => {
    installPowerPoint([slide("s1", ["Title", "Bullet"])]);
    const summary = await summarizePresentation(async (prompt) => prompt);
    expect(summary).toContain("Slide 1: Title | Bullet");
  });

  it("creates the requested slides on the deck", async () => {
    const deck = installPowerPoint([]);
    const outline = await createPresentation(
      { topic: "Histology", slideCount: 2, language: "Portuguese" },
      async () =>
        JSON.stringify([
          { title: "Epitélio", bullets: ["Revestimento"] },
          { title: "Conjuntivo", bullets: ["Matriz"] },
          { title: "Extra", bullets: ["Ignorar"] },
        ])
    );
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]?.shapes.items[0]?.textFrame.textRange.text).toBe(
      "Epitélio"
    );
    expect(
      deck.slides[0]?.shapes.items.some((item) => item.type === "Placeholder")
    ).toBe(false);
    expect(deck.slides[1]?.shapes.items[1]?.textFrame.textRange.text).toBe(
      "Matriz"
    );
    expect(outline).toContain("1. Epitélio");
    expect(outline).not.toContain("Extra");
  });

  it("inserts a text box when nothing is selected", async () => {
    const deck = installPowerPoint([slide("s1", ["Title"])]);
    await insertTextOnSlide("Nota clínica");
    const texts = deck.slides[0]?.shapes.items.map(
      (item) => item.textFrame.textRange.text
    );
    expect(texts).toContain("Nota clínica");
  });
});
