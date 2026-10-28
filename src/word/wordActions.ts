import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";

export type PromptFn = (text: string) => Promise<string>;

async function readSource(): Promise<{ text: string; hasSelection: boolean }> {
  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    const selected = selection.text.trim();
    if (selected.length > 0) {
      return { text: selected.slice(0, MAX_CONTEXT_CHARS), hasSelection: true };
    }
    const body = context.document.body;
    body.load("text");
    await context.sync();
    return {
      text: body.text.trim().slice(0, MAX_CONTEXT_CHARS),
      hasSelection: false,
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

async function replaceSelection(text: string): Promise<void> {
  await Word.run(async (context) => {
    context.document
      .getSelection()
      .insertText(text, Word.InsertLocation.replace);
    await context.sync();
  });
}

export async function summarizeDocument(prompt: PromptFn): Promise<string> {
  logger.info("word", "Summarize document");
  const text = (await readSource()).text;
  if (!text) throw new Error("No text available to summarize.");
  return prompt(
    `Summarize the following Word document content. Provide a clear, structured summary with key points:\n\n${text}`
  );
}

export async function explainSelection(prompt: PromptFn): Promise<string> {
  logger.info("word", "Explain selection");
  const text = (await readSource()).text;
  if (!text) throw new Error("Select some text first.");
  return prompt(
    `Explain this text in detail, in the same language as the text:\n\n${text}`
  );
}

export async function rewriteSelection(prompt: PromptFn): Promise<string> {
  logger.info("word", "Rewrite selection");
  const source = await readSource();
  if (!source.text) throw new Error("Select some text first.");
  const rewritten = stripFences(
    await prompt(
      `Rewrite the following text keeping its meaning but improving clarity and style. Return only the rewritten text:\n\n${source.text}`
    )
  );
  if (source.hasSelection) await replaceSelection(rewritten);
  return rewritten;
}

export async function translateSelection(
  targetLanguage: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("word", "Translate selection", { targetLanguage });
  const source = await readSource();
  if (!source.text) throw new Error("Select some text first.");
  const translated = stripFences(
    await prompt(
      `Translate the following text into ${targetLanguage}. Return only the translation:\n\n${source.text}`
    )
  );
  if (source.hasSelection) await replaceSelection(translated);
  return translated;
}

export async function fixGrammar(prompt: PromptFn): Promise<string> {
  logger.info("word", "Fix grammar");
  const source = await readSource();
  if (!source.text) throw new Error("Select some text first.");
  const corrected = stripFences(
    await prompt(
      `Correct the grammar, spelling and punctuation of the following text. Keep the original meaning and language. Return only the corrected text:\n\n${source.text}`
    )
  );
  if (source.hasSelection) await replaceSelection(corrected);
  return corrected;
}

export async function generateAndInsert(
  instruction: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("word", "Generate content and insert");
  const generated = stripFences(
    await prompt(
      `Generate content based on this instruction. Return only the content to insert, no explanations:\n\n${instruction}`
    )
  );
  await Word.run(async (context) => {
    context.document
      .getSelection()
      .insertText(`\n${generated}\n`, Word.InsertLocation.end);
    await context.sync();
  });
  return generated;
}
