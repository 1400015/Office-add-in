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
import { loadTextShapes } from "./textShapes";
import { createIdentifiedSlide } from "./slideTargets";

export type PromptFn = (text: string) => Promise<string>;

export interface CreatePresentationInput {
  topic: string;
  slideCount: number;
  language: string;
}

export type { SlidePlan };

/** Preserve the complete plan when creation may have changed only part of a deck. */
export class PresentationCreationConflictError extends ActionConflictError {
  constructor(
    result: string,
    readonly createdSlides: number,
    readonly creationStarted: boolean
  ) {
    super(result);
  }
}

interface ShapeText {
  id: string;
  text: string;
}

interface SlideSnapshot {
  slideId: string;
  shapes: ShapeText[];
}

const SLIDE_WIDTH = 680;

async function readActiveSlide(action?: ActionContext): Promise<SlideSnapshot> {
  action?.assertCurrent();
  return PowerPoint.run(async (context) => {
    action?.assertCurrent();
    const selected = context.presentation.getSelectedSlides();
    selected.load("items/id");
    await context.sync();
    action?.assertCurrent();
    let slide = selected.items[0];
    if (!slide) {
      const slides = context.presentation.slides;
      const countResult = slides.getCount();
      await context.sync();
      action?.assertCurrent();
      if (countResult.value === 0) {
        throw new Error("The presentation has no slides.");
      }
      slide = slides.getItemAt(countResult.value - 1);
      slide.load("id");
      await context.sync();
      action?.assertCurrent();
    }
    const loaded = await loadTextShapes(context, slide.shapes, action);
    const shapes = loaded
      .map((shape) => ({
        id: shape.id,
        text: shape.textFrame.textRange.text,
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
      const loaded = await loadTextShapes(context, slide.shapes, action);
      action?.assertCurrent();
      const shapes = new Map(loaded.map((shape) => [shape.id, shape]));
      for (const original of snapshot.shapes) {
        const shape = shapes.get(original.id);
        if (!shape || shape.textFrame.textRange.text !== original.text) {
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
  const snapshot = await readActiveSlide(action);
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
    slides.load("items/id");
    await context.sync();
    action?.assertCurrent();
    const lines: string[] = [];
    for (const [index, slide] of slides.items.entries()) {
      const shapes = await loadTextShapes(context, slide.shapes, action);
      const text = shapes
        .map((shape) => shape.textFrame.textRange.text.trim())
        .filter(Boolean)
        .join(" | ");
      lines.push(`Slide ${index + 1}: ${text || "(no text)"}`);
    }
    return lines.join("\n");
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
  const result = plans
    .map(
      (plan, index) =>
        `${index + 1}. ${plan.title}\n${plan.bullets.map((bullet) => `• ${bullet}`).join("\n")}`
    )
    .join("\n\n");

  let createdSlides = 0;
  let creationStarted = false;
  try {
    await PowerPoint.run(async (context) => {
      for (const plan of plans) {
        const slideId = await createIdentifiedSlide(
          context,
          result,
          action,
          undefined,
          () => {
            creationStarted = true;
          }
        );
        createdSlides++;
        action?.assertCurrent();
        const slide = context.presentation.slides.getItem(slideId);
        // Preserve inherited placeholders: automatic cleanup could erase a
        // coauthor's edit even after the new slide has been identified.
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
        action?.assertCurrent();
      }
    });
  } catch (error) {
    // Ownership wins over preserving output after cancellation/new chat/lock.
    action?.assertCurrent();
    if (creationStarted || error instanceof ActionConflictError)
      throw new PresentationCreationConflictError(
        result,
        createdSlides,
        creationStarted
      );
    throw error;
  }
  return result;
}

export async function insertTextOnSlide(
  text: string,
  action?: ActionContext
): Promise<void> {
  const payload = text.trim();
  if (!payload) return;
  action?.assertCurrent();
  try {
    await PowerPoint.run(async (context) => {
      action?.assertCurrent();
      const presentation = context.presentation as PowerPoint.Presentation & {
        getSelectedTextRangeOrNullObject?: () => PowerPoint.TextRange;
      };
      const selected = presentation.getSelectedSlides();
      const slides = presentation.slides;
      selected.load("items/id");
      slides.load("items/id");
      const range = selectedTextRange(presentation);
      range?.load("text,start,length");
      await context.sync();
      action?.assertCurrent();

      // Copy IDs now: a later sync can refresh the collection's live items.
      const initialIds = slides.items.map((slide) => slide.id);
      let slideId = selected.items[0]?.id ?? initialIds[initialIds.length - 1];
      if (range && !range.isNullObject) {
        if (!slideId) throw new ActionConflictError(payload);
        const snapshot = {
          text: range.text,
          start: range.start,
          length: range.length,
        };
        const frame = range.getParentTextFrame();
        const shape = frame.getParentShape();
        const parentSlide = shape.getParentSlide();
        shape.load("id");
        parentSlide.load("id");
        frame.textRange.load("text");
        action?.assertCurrent();
        await context.sync();
        action?.assertCurrent();
        const originalText = frame.textRange.text;
        if (
          parentSlide.id !== slideId ||
          !Number.isInteger(snapshot.start) ||
          !Number.isInteger(snapshot.length) ||
          snapshot.start < 0 ||
          snapshot.length < 0 ||
          originalText.slice(
            snapshot.start,
            snapshot.start + snapshot.length
          ) !== snapshot.text
        )
          throw new ActionConflictError(payload);

        // Resolve by immutable IDs before writing; never revisit the current
        // selected range, which may now belong to a different shape or slide.
        const textRange = slides.getItem(slideId).shapes.getItem(shape.id)
          .textFrame.textRange;
        textRange.load("text");
        action?.assertCurrent();
        await context.sync();
        action?.assertCurrent();
        if (textRange.text !== originalText)
          throw new ActionConflictError(payload);
        const target = textRange.getSubstring(snapshot.start, snapshot.length);
        target.text = snapshot.text.trim()
          ? `${snapshot.text.replace(/\s+$/, "")}\n${payload}`
          : payload;
        action?.assertCurrent();
        await context.sync();
        action?.assertCurrent();
        return;
      }

      if (!slideId)
        slideId = await createIdentifiedSlide(
          context,
          payload,
          action,
          initialIds
        );
      action?.assertCurrent();
      const box = slides.getItem(slideId).shapes.addTextBox(payload, {
        left: 48,
        top: 120,
        width: SLIDE_WIDTH,
        height: 280,
      });
      box.name = "Inserted text";
      box.textFrame.textRange.text = payload;
      action?.assertCurrent();
      await context.sync();
      action?.assertCurrent();
    });
  } catch (error) {
    action?.assertCurrent();
    // A failed write can already have reached the host. Never retry it as a
    // text box, or use a later selection as a replacement destination.
    if (isInvalidOfficeTarget(error)) throw new ActionConflictError(payload);
    throw error;
  }
}

function selectedTextRange(
  presentation: PowerPoint.Presentation & {
    getSelectedTextRangeOrNullObject?: () => PowerPoint.TextRange;
  }
): PowerPoint.TextRange | null {
  if (
    !presentation.getSelectedTextRangeOrNullObject ||
    typeof Office === "undefined" ||
    !Office.context.requirements.isSetSupported("PowerPointApi", "1.5")
  )
    return null;
  try {
    return presentation.getSelectedTextRangeOrNullObject();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (
      code === "ApiNotFound" ||
      code === "NotImplemented" ||
      code === "NotSupported"
    )
      return null;
    throw error;
  }
}
