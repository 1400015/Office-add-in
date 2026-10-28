import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";
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
  slideId: string,
  updates: ShapeText[]
): Promise<void> {
  if (updates.length === 0) return;
  await PowerPoint.run(async (context) => {
    const slide = context.presentation.slides.getItem(slideId);
    for (const update of updates) {
      const shape = slide.shapes.getItem(update.id);
      shape.textFrame.textRange.text = update.text;
    }
    await context.sync();
  });
}

async function rewriteSlideTexts(
  prompt: PromptFn,
  instruction: string
): Promise<string> {
  const snapshot = await readActiveSlide();
  if (snapshot.shapes.length === 0) {
    throw new Error("The active slide has no text.");
  }
  const originals = snapshot.shapes.map((shape) => shape.text);
  const raw = await prompt(
    `${instruction}\n` +
      `Respond ONLY with a JSON array of ${originals.length} strings, in the same order, no markdown fences:\n` +
      JSON.stringify(originals)
  );
  const rewritten = parseAlignedStrings(raw, originals);
  await writeShapeTexts(
    snapshot.slideId,
    snapshot.shapes.map((shape, index) => ({
      id: shape.id,
      text: rewritten[index]!,
    }))
  );
  return rewritten.join("\n\n");
}

export async function improveSlide(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Improve slide");
  return rewriteSlideTexts(
    prompt,
    "Improve each text block of this PowerPoint slide. Keep the same language and meaning. Make the wording clearer, more concise and more professional."
  );
}

export async function fixSlideGrammar(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Fix slide grammar");
  return rewriteSlideTexts(
    prompt,
    "Correct the grammar, spelling and punctuation of each text block. Keep the original meaning, language and tone. Do not add new ideas."
  );
}

export async function translateSlide(
  targetLanguage: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("powerpoint", "Translate slide", { targetLanguage });
  return rewriteSlideTexts(
    prompt,
    `Translate each text block into ${targetLanguage}. Keep bullet structure. Do not add commentary.`
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

export async function summarizePresentation(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Summarize presentation");
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
  const truncated =
    outline.length > MAX_CONTEXT_CHARS
      ? outline.slice(0, MAX_CONTEXT_CHARS)
      : outline;
  if (!truncated.trim()) throw new Error("The presentation has no text.");
  return prompt(
    `Produce an executive summary of this presentation based on its slide outline. Use the same language as the outline when it is consistent:\n\n${truncated}`
  );
}

export async function createPresentation(
  input: CreatePresentationInput,
  prompt: PromptFn
): Promise<string> {
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
  const plans = parseSlidePlans(raw, slideCount);

  await PowerPoint.run(async (context) => {
    for (const plan of plans) {
      context.presentation.slides.add();
      const slides = context.presentation.slides;
      const countResult = slides.getCount();
      await context.sync();
      const slide = slides.getItemAt(countResult.value - 1);
      slide.shapes.load("items/type");
      await context.sync();
      for (const shape of slide.shapes.items) {
        if (shape.type === "Placeholder") {
          shape.delete();
        }
      }
      await context.sync();
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

export async function insertTextOnSlide(text: string): Promise<void> {
  const payload = text.trim();
  if (!payload) return;
  const replaced = await replaceSelectedText(payload);
  if (!replaced) await addTextBox(payload);
}

async function replaceSelectedText(payload: string): Promise<boolean> {
  try {
    return await PowerPoint.run(async (context) => {
      const presentation = context.presentation as PowerPoint.Presentation & {
        getSelectedTextRangeOrNullObject?: () => PowerPoint.TextRange;
      };
      if (!presentation.getSelectedTextRangeOrNullObject) return false;
      const range = presentation.getSelectedTextRangeOrNullObject();
      range.load("text");
      await context.sync();
      const nullable = range as PowerPoint.TextRange & {
        isNullObject?: boolean;
      };
      if (nullable.isNullObject) return false;
      const current = range.text ?? "";
      range.text = current.trim()
        ? `${current.replace(/\s+$/, "")}\n${payload}`
        : payload;
      await context.sync();
      return true;
    });
  } catch (error) {
    logger.info("powerpoint", "No selected text range; inserting a text box", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function addTextBox(payload: string): Promise<void> {
  await PowerPoint.run(async (context) => {
    const presentation = context.presentation;
    const selected = presentation.getSelectedSlides();
    selected.load("items");
    await context.sync();
    let slide = selected.items[0];
    if (!slide) {
      const countResult = presentation.slides.getCount();
      await context.sync();
      if (countResult.value === 0) {
        presentation.slides.add();
        await context.sync();
      }
      const after = presentation.slides.getCount();
      await context.sync();
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
    await context.sync();
  });
}
