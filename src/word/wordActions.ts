import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";

export type PromptFn = (text: string) => Promise<string>;

async function getSelectedOrDocumentText(): Promise<string> {
  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    const selected = selection.text.trim();
    if (selected.length > 0) return selected;

    const body = context.document.body;
    body.load("text");
    await context.sync();
    const full = body.text.trim();
    return full.slice(0, MAX_CONTEXT_CHARS);
  });
}

export async function summarizeDocument(prompt: PromptFn): Promise<string> {
  logger.info("word", "Summarize document");
  const text = await getSelectedOrDocumentText();
  if (!text) throw new Error("No text available to summarize.");
  return prompt(
    `Summarize the following Word document content. Provide a clear, structured summary with key points:\n\n${text}`
  );
}

export async function explainSelection(prompt: PromptFn): Promise<string> {
  logger.info("word", "Explain selection");
  const text = await getSelectedOrDocumentText();
  if (!text) throw new Error("Select some text first.");
  return prompt(
    `Explain this text in detail, in the same language as the text:\n\n${text}`
  );
}

export async function rewriteSelection(prompt: PromptFn): Promise<string> {
  logger.info("word", "Rewrite selection");
  const text = await getSelectedOrDocumentText();
  if (!text) throw new Error("Select some text first.");
  return prompt(
    `Rewrite the following text keeping its meaning but improving clarity and style. Return only the rewritten text:\n\n${text}`
  );
}

export async function translateSelection(
  targetLanguage: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("word", "Translate selection", { targetLanguage });
  const text = await getSelectedOrDocumentText();
  if (!text) throw new Error("Select some text first.");
  return prompt(
    `Translate the following text into ${targetLanguage}. Return only the translation:\n\n${text}`
  );
}

export async function fixGrammar(prompt: PromptFn): Promise<string> {
  logger.info("word", "Fix grammar");
  const text = await getSelectedOrDocumentText();
  if (!text) throw new Error("Select some text first.");
  return prompt(
    `Correct the grammar, spelling and punctuation of the following text. Keep the original meaning and language. Return only the corrected text:\n\n${text}`
  );
}

export async function generateAndInsert(
  instruction: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("word", "Generate content and insert");
  const generated = await prompt(
    `Generate content based on this instruction. Return only the content to insert, no explanations:\n\n${instruction}`
  );
  await Word.run(async (context) => {
    context.document
      .getSelection()
      .insertText(`\n${generated}\n`, Word.InsertLocation.end);
    await context.sync();
  });
  return generated;
}
