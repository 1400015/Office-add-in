import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";
import {
  ActionConflictError,
  isInvalidOfficeTarget,
  type ActionContext,
} from "../services/ActionContext";

export type PromptFn = (text: string) => Promise<string>;

type Source = {
  text: string;
  target?: Word.Range;
  original?: string;
  truncated?: boolean;
};

async function readSource(
  track = false,
  action?: ActionContext
): Promise<Source> {
  action?.assertCurrent();
  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    action?.assertCurrent();
    const original = selection.text;
    if (!track && original.length > MAX_CONTEXT_CHARS)
      action?.reportTruncation?.();
    if (original.trim()) {
      if (track && original.length > MAX_CONTEXT_CHARS)
        throw new Error("selection-too-long");
      if (track) {
        selection.track();
        try {
          await context.sync();
          action?.assertCurrent();
        } catch (error) {
          selection.untrack();
          await context.sync().catch(() => {});
          throw error;
        }
      }
      return {
        text: original.slice(0, MAX_CONTEXT_CHARS),
        target: track ? selection : undefined,
        original,
        truncated: original.length > MAX_CONTEXT_CHARS,
      };
    }
    const body = context.document.body;
    body.load("text");
    await context.sync();
    action?.assertCurrent();
    const text = body.text.trim();
    if (text.length > MAX_CONTEXT_CHARS) action?.reportTruncation?.();
    return {
      text: text.slice(0, MAX_CONTEXT_CHARS),
      truncated: text.length > MAX_CONTEXT_CHARS,
    };
  });
}

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```[\w-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

async function release(target: Word.Range): Promise<void> {
  try {
    await Word.run(target, async (context) => {
      target.untrack();
      await context.sync();
    });
  } catch (error) {
    logger.warn("word", "Failed to release tracked range", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function apply(
  target: Word.Range,
  original: string,
  text: string,
  action?: ActionContext,
  location: Word.InsertLocation = Word.InsertLocation.replace
): Promise<void> {
  action?.assertCurrent();
  try {
    await Word.run(target, async (context) => {
      action?.assertCurrent();
      target.load("text");
      await context.sync();
      action?.assertCurrent();
      if (target.text !== original) throw new ActionConflictError(text);
      target.insertText(text, location);
      action?.assertCurrent();
      await context.sync();
    });
  } catch (error) {
    if (isInvalidOfficeTarget(error)) throw new ActionConflictError(text);
    throw error;
  }
}

async function transform(
  prompt: PromptFn,
  instruction: string,
  action?: ActionContext
): Promise<string> {
  const source = await readSource(true, action);
  try {
    if (!source.text) throw new Error("Select some text first.");
    const result = stripFences(
      await prompt(
        `${instruction}\n\n${source.text}${source.truncated ? "\n\n[Content truncated]" : ""}`
      )
    );
    action?.assertCurrent();
    if (!result) throw new Error("empty-response");
    if (source.target)
      await apply(source.target, source.original!, result, action);
    return result;
  } finally {
    if (source.target) await release(source.target);
  }
}

export async function summarizeDocument(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  const source = await readSource(false, action);
  if (!source.text) throw new Error("No text available to summarize.");
  return prompt(
    `Summarize the following Word document content. Provide a clear, structured summary with key points:\n\n${source.text}${source.truncated ? "\n\n[Content truncated]" : ""}`
  );
}

export async function explainSelection(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  const source = await readSource(false, action);
  if (!source.text) throw new Error("Select some text first.");
  return prompt(
    `Explain this text in detail, in the same language as the text:\n\n${source.text}${source.truncated ? "\n\n[Content truncated]" : ""}`
  );
}

export async function rewriteSelection(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  return transform(
    prompt,
    "Rewrite the following text keeping its meaning but improving clarity and style. Return only the rewritten text:",
    action
  );
}

export async function translateSelection(
  targetLanguage: string,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  return transform(
    prompt,
    `Translate the following text into ${targetLanguage}. Return only the translation:`,
    action
  );
}

export async function fixGrammar(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  return transform(
    prompt,
    "Correct the grammar, spelling and punctuation of the following text. Keep the original meaning and language. Return only the corrected text:",
    action
  );
}

export async function generateAndInsert(
  instruction: string,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  action?.assertCurrent();
  const captured = await Word.run(async (context) => {
    const target = context.document.getSelection();
    target.load("text");
    target.track();
    try {
      await context.sync();
      action?.assertCurrent();
      return { target, original: target.text };
    } catch (error) {
      target.untrack();
      await context.sync().catch(() => {});
      throw error;
    }
  });
  try {
    const generated = stripFences(
      await prompt(
        `Generate content based on this instruction. Return only the content to insert, no explanations:\n\n${instruction}`
      )
    );
    action?.assertCurrent();
    if (!generated) throw new Error("empty-response");
    await apply(
      captured.target,
      captured.original,
      `\n${generated}\n`,
      action,
      Word.InsertLocation.end
    );
    return generated;
  } finally {
    await release(captured.target);
  }
}
