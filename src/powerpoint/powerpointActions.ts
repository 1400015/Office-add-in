import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";

export type PromptFn = (text: string) => Promise<string>;

async function getActiveSlide(): Promise<PowerPoint.Slide> {
  return PowerPoint.run(async (context) => {
    const selected = context.presentation.getSelectedSlides();
    selected.load("items");
    await context.sync();
    const first = selected.items[0];
    if (first) return first;
    const slides = context.presentation.slides;
    const countResult = slides.getCount();
    await context.sync();
    const count = countResult.value;
    if (count === 0) throw new Error("The presentation has no slides.");
    return slides.getItemAt(count - 1);
  });
}

async function getSlideAllText(slide: PowerPoint.Slide): Promise<string> {
  return PowerPoint.run(async (context) => {
    slide.shapes.load("items/textFrame/textRange");
    await context.sync();
    return slide.shapes.items
      .map((shape) => shape.textFrame?.textRange?.text ?? "")
      .join("\n")
      .trim();
  });
}

async function getActiveSlideText(): Promise<string> {
  return PowerPoint.run(async (context) => {
    const selected = context.presentation.getSelectedSlides();
    selected.load("items");
    await context.sync();
    const slide = selected.items[0];
    if (!slide) throw new Error("No slide is selected.");
    slide.shapes.load("items/textFrame/textRange");
    await context.sync();
    return slide.shapes.items
      .map((shape) => shape.textFrame?.textRange?.text ?? "")
      .join("\n")
      .trim();
  });
}

async function getPresentationOutline(): Promise<string> {
  return PowerPoint.run(async (context) => {
    const slides = context.presentation.slides;
    slides.load("items/shapes/items/textFrame/textRange");
    await context.sync();
    return slides.items
      .map((slide, i) => {
        const firstShape =
          slide.shapes.items[0]?.textFrame?.textRange?.text?.trim();
        return `Slide ${i + 1}: ${firstShape ?? "(no text)"}`;
      })
      .join("\n");
  });
}

export interface CreatePresentationInput {
  topic: string;
  slideCount: number;
  language: string;
}

export interface SlidePlan {
  title: string;
  bullets: string[];
}

export async function createPresentation(
  input: CreatePresentationInput,
  prompt: PromptFn
): Promise<SlidePlan[]> {
  logger.info("powerpoint", "Create presentation", { ...input });
  const raw = await prompt(
    `Create a presentation plan in ${input.language} about "${input.topic}" with exactly ${input.slideCount} slides. ` +
      `Respond ONLY with a JSON array in this exact format, no markdown fences:\n` +
      `[{"title": "...", "bullets": ["...", "..."]}]`
  );
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const plans = JSON.parse(cleaned) as SlidePlan[];
  if (!Array.isArray(plans) || plans.length === 0) {
    throw new Error("The AI did not return a valid presentation plan.");
  }

  await PowerPoint.run(async (context) => {
    for (const plan of plans) {
      context.presentation.slides.add();
      const slides = context.presentation.slides;
      const countResult = slides.getCount();
      await context.sync();
      const count = countResult.value;
      const slide = slides.getItemAt(count - 1);
      const titleBox = slide.shapes.addTextBox(plan.title, {
        left: 40,
        top: 30,
        width: 600,
        height: 60,
      });
      titleBox.textFrame.textRange.text = plan.title;
      const bodyBox = slide.shapes.addTextBox(plan.bullets.join("\n"), {
        left: 40,
        top: 110,
        width: 600,
        height: 350,
      });
      bodyBox.textFrame.textRange.text = plan.bullets.join("\n");
      await context.sync();
    }
  });
  return plans;
}

export async function improveSlide(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Improve slide");
  const slide = await getActiveSlide();
  const text = await getSlideAllText(slide);
  if (!text) throw new Error("The active slide has no text to improve.");
  return prompt(
    `Improve the following slide content. Make it clearer, more concise and more professional, in the same language. Return only the improved text:\n\n${text}`
  );
}

export async function generateSpeakerNotes(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Generate speaker notes");
  const text = await getActiveSlideText();
  if (!text) throw new Error("The active slide has no text.");
  return prompt(
    `Write speaker notes for a presenter delivering this slide. Be concise and practical:\n\n${text}`
  );
}

export async function summarizePresentation(prompt: PromptFn): Promise<string> {
  logger.info("powerpoint", "Summarize presentation");
  const outline = await getPresentationOutline();
  const truncated =
    outline.length > MAX_CONTEXT_CHARS
      ? outline.slice(0, MAX_CONTEXT_CHARS)
      : outline;
  return prompt(
    `Produce an executive summary of this presentation based on its slide outline:\n\n${truncated}`
  );
}
