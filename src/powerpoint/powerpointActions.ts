import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";
import {
  ActionConflictError,
  isInvalidOfficeTarget,
  type ActionContext,
} from "../services/ActionContext";
import {
  clampSlideCount,
  parseAlignedStrings,
  parseSlidePlans,
  type SlidePlan,
} from "./slidePlan";

export type PromptFn = (text: string) => Promise<string>;

export interface CreatePresentationInput {
  topic: string;
  slideCount: number;
  language: string;
}

export type { SlidePlan };

interface ShapeText {
  id: string;
  text: string;
}

interface SlideSnapshot {
  slideId: string;
  shapes: ShapeText[];
}

const SLIDE_WIDTH = 680;

async function readActiveSlide(): Promise<SlideSnapshot> {
  return PowerPoint.run(async (context) => {
    const selected = context.presentation.getSelectedSlides();
    selected.load("items/id");
    await context.sync();
    let slide = selected.items[0];
    if (!slide) {
      const slides = context.presentation.slides;
      const countResult = slides.getCount();
      await context.sync();
      if (countResult.value === 0) {
        throw new Error("The presentation has no slides.");
      }
      slide = slides.getItemAt(countResult.value - 1);
      slide.load("id");
      await context.sync();
    }
    slide.shapes.load("items/id,items/textFrame/textRange/text");
    await context.sync();
    const shapes = slide.shapes.items
      .map((shape) => ({
        id: shape.id,
        text: shape.textFrame?.textRange?.text ?? "",
      }))
      .filter((shape) => shape.id && shape.text.trim().length > 0);
    return { slideId: slide.id, shapes };
  });
}

async function writeShapeTexts(
  snapshot: SlideSnapshot,
  updates: ShapeText[],
  action?: ActionContext
): Promise<void> {
  if (updates.length === 0) return;
  const result = updates.map((update) => update.text).join("\n\n");
  action?.assertCurrent();
  try {
    await PowerPoint.run(async (context) => {
      action?.assertCurrent();
      const slides = context.presentation.slides;
      slides.load("items/id");
      await context.sync();
      action?.assertCurrent();
      const slide = slides.items.find((item) => item.id === snapshot.slideId);
      if (!slide) throw new ActionConflictError(result);
      slide.shapes.load("items/id,items/textFrame/textRange/text");
      await context.sync();
      action?.assertCurrent();
      const shapes = new Map(
        slide.shapes.items.map((shape) => [shape.id, shape])
      );
      for (const original of snapshot.shapes) {
        const shape = shapes.get(original.id);
        if (!shape || shape.textFrame?.textRange?.text !== original.text) {
          throw new ActionConflictError(result);
        }
      }
      for (const update of updates) {
        const shape = shapes.get(update.id)!;
        shape.textFrame.textRange.text = update.text;
      }
      action?.assertCurrent();
      await context.sync();
    });
  } catch (error) {
    action?.assertCurrent();
    if (isInvalidOfficeTarget(error)) throw new ActionConflictError(result);
    throw error;
  }
}

async function rewriteSlideTexts(
  prompt: PromptFn,
  instruction: string,
  action?: ActionContext
): Promise<string> {
  action?.assertCurrent();
  const snapshot = await readActiveSlide();
  action?.assertCurrent();
  if (snapshot.shapes.length === 0) {
    throw new Error("The active slide has no text.");
  }
  const originals = snapshot.shapes.map((shape) => shape.text);
  const raw = await prompt(
    `${instruction}\n` +
      `Respond ONLY with a JSON array of ${originals.length} strings, in the same order, no markdown fences:\n` +
      JSON.stringify(originals)
  );
  action?.assertCurrent();
  const rewritten = parseAlignedStrings(raw, originals);
  await writeShapeTexts(
    snapshot,
    snapshot.shapes.map((shape, index) => ({
      id: shape.id,
      text: rewritten[index]!,
    })),
    action
  );
  return rewritten.join("\n\n");
}

export async function improveSlide(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  logger.info("powerpoint", "Improve slide");
  return rewriteSlideTexts(
    prompt,
    "Improve each text block of this PowerPoint slide. Keep the same language and meaning. Make the wording clearer, more concise and more professional.",
    action
  );
}

export async function fixSlideGrammar(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  logger.info("powerpoint", "Fix slide grammar");
  return rewriteSlideTexts(
    prompt,
    "Correct the grammar, spelling and punctuation of each text block. Keep the original meaning, language and tone. Do not add new ideas.",
    action
  );
}

export async function translateSlide(
  targetLanguage: string,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  logger.info("powerpoint", "Translate slide", { targetLanguage });
  return rewriteSlideTexts(
    prompt,
    `Translate each text block into ${targetLanguage}. Keep bullet structure. Do not add commentary.`,
    action
  );
}

export async function explainSlide(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Explain slide");
  const snapshot = await readActiveSlide();
  const text = snapshot.shapes.map((shape) => shape.text).join("\n");
  if (!text.trim()) throw new Error("The active slide has no text.");
  return prompt(
    `Explain this PowerPoint slide in the same language as the text. Describe the point of the slide and clarify any jargon:\n\n${text}`
  );
}

export async function generateSpeakerNotes(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Generate speaker notes");
  const snapshot = await readActiveSlide();
  const text = snapshot.shapes.map((shape) => shape.text).join("\n");
  if (!text.trim()) throw new Error("The active slide has no text.");
  return prompt(
    `Write speaker notes for a presenter delivering this slide. Be concise and practical. Return only the notes:\n\n${text}`
  );
}

export async function summarizePresentation(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  logger.info("powerpoint", "Summarize presentation");
  action?.assertCurrent();
  const outline = await PowerPoint.run(async (context) => {
    const slides = context.presentation.slides;
    slides.load("items/shapes/items/textFrame/textRange/text");
    await context.sync();
    return slides.items
      .map((slide, index) => {
        const text = slide.shapes.items
          .map((shape) => shape.textFrame?.textRange?.text?.trim() ?? "")
          .filter(Boolean)
          .join(" | ");
        return `Slide ${index + 1}: ${text || "(no text)"}`;
      })
      .join("\n");
  });
  action?.assertCurrent();
  if (outline.length > MAX_CONTEXT_CHARS) action?.reportTruncation?.();
  const truncated =
    outline.length > MAX_CONTEXT_CHARS
      ? `${outline.slice(0, MAX_CONTEXT_CHARS)}\n[Content truncated]`
      : outline;
  if (!truncated.trim()) throw new Error("The presentation has no text.");
  return prompt(
    `Produce an executive summary of this presentation based on its slide outline. Use the same language as the outline when it is consistent:\n\n${truncated}`
  );
}

export async function createPresentation(
  input: CreatePresentationInput,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  action?.assertCurrent();
  const slideCount = clampSlideCount(input.slideCount);
  const topic = input.topic.trim();
  if (!topic) throw new Error("A topic is required.");
  logger.info("powerpoint", "Create presentation", {
    topic,
    slideCount,
    language: input.language,
  });
  const raw = await prompt(
    `Create a presentation plan in ${input.language} about ${JSON.stringify(topic)} with exactly ${slideCount} slides. ` +
      `Respond ONLY with a JSON array in this exact format, no markdown fences:\n` +
      `[{"title": "...", "bullets": ["...", "..."]}]`
  );
  action?.assertCurrent();
  const plans = parseSlidePlans(raw, slideCount);

  await PowerPoint.run(async (context) => {
    for (const plan of plans) {
      action?.assertCurrent();
      context.presentation.slides.add();
      const slides = context.presentation.slides;
      const countResult = slides.getCount();
      action?.assertCurrent();
      await context.sync();
      action?.assertCurrent();
      const slide = slides.getItemAt(countResult.value - 1);
      slide.shapes.load("items/type");
      await context.sync();
      action?.assertCurrent();
      for (const shape of slide.shapes.items) {
        if (shape.type === "Placeholder") {
          shape.delete();
        }
      }
      action?.assertCurrent();
      await context.sync();
      action?.assertCurrent();
      const titleBox = slide.shapes.addTextBox(plan.title, {
        left: 40,
        top: 28,
        width: SLIDE_WIDTH,
        height: 64,
      });
      titleBox.name = "Title";
      titleBox.textFrame.textRange.text = plan.title;
      const body = plan.bullets.join("\n");
      const bodyBox = slide.shapes.addTextBox(body, {
        left: 40,
        top: 110,
        width: SLIDE_WIDTH,
        height: 360,
      });
      bodyBox.name = "Body";
      bodyBox.textFrame.textRange.text = body;
      action?.assertCurrent();
      await context.sync();
    }
  });

  return plans
    .map(
      (plan, index) =>
        `${index + 1}. ${plan.title}\n${plan.bullets.map((bullet) => `• ${bullet}`).join("\n")}`
    )
    .join("\n\n");
}

export async function insertTextOnSlide(
  text: string,
  action?: ActionContext
): Promise<void> {
  const payload = text.trim();
  if (!payload) return;
  action?.assertCurrent();
  const replaced = await replaceSelectedText(payload, action);
  action?.assertCurrent();
  if (!replaced) await addTextBox(payload, action);
}

async function replaceSelectedText(
  payload: string,
  action?: ActionContext
): Promise<boolean> {
  try {
    return await PowerPoint.run(async (context) => {
      action?.assertCurrent();
      const presentation = context.presentation as PowerPoint.Presentation & {
        getSelectedTextRangeOrNullObject?: () => PowerPoint.TextRange;
      };
      if (!presentation.getSelectedTextRangeOrNullObject) return false;
      const range = presentation.getSelectedTextRangeOrNullObject();
      range.load("text");
      await context.sync();
      action?.assertCurrent();
      const nullable = range as PowerPoint.TextRange & {
        isNullObject?: boolean;
      };
      if (nullable.isNullObject) return false;
      const current = range.text ?? "";
      range.text = current.trim()
        ? `${current.replace(/\s+$/, "")}\n${payload}`
        : payload;
      action?.assertCurrent();
      await context.sync();
      return true;
    });
  } catch (error) {
    action?.assertCurrent();
    logger.info("powerpoint", "No selected text range; inserting a text box", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function addTextBox(
  payload: string,
  action?: ActionContext
): Promise<void> {
  await PowerPoint.run(async (context) => {
    action?.assertCurrent();
    const presentation = context.presentation;
    const selected = presentation.getSelectedSlides();
    selected.load("items");
    await context.sync();
    action?.assertCurrent();
    let slide = selected.items[0];
    if (!slide) {
      const countResult = presentation.slides.getCount();
      await context.sync();
      action?.assertCurrent();
      if (countResult.value === 0) {
        presentation.slides.add();
        action?.assertCurrent();
        await context.sync();
        action?.assertCurrent();
      }
      const after = presentation.slides.getCount();
      await context.sync();
      action?.assertCurrent();
      slide = presentation.slides.getItemAt(after.value - 1);
    }
    const box = slide.shapes.addTextBox(payload, {
      left: 48,
      top: 120,
      width: SLIDE_WIDTH,
      height: 280,
    });
    box.name = "Inserted text";
    box.textFrame.textRange.text = payload;
    action?.assertCurrent();
    await context.sync();
  });
}
