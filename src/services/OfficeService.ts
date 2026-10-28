import { insertTextInCell } from "../excel/excelActions";
import { insertTextOnSlide } from "../powerpoint/powerpointActions";
import type { ChatContext, OfficeHost, OfficePlatform } from "../types";
import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "./LoggerService";

let hostCache: OfficeHost | null = null;
let platformCache: OfficePlatform | null = null;
let readyPromise: Promise<boolean> | null = null;

export function isOfficeReady(): boolean {
  return typeof Office !== "undefined" && Office.context !== undefined;
}

export async function waitForOfficeReady(): Promise<boolean> {
  if (!isOfficeReady()) return false;
  if (!readyPromise) {
    readyPromise = new Promise((resolve) => {
      Office.onReady((info) => {
        logger.info("office", "Office.js ready", {
          host: info.host,
          platform: info.platform,
        });
        resolve(true);
      });
    });
  }
  return readyPromise;
}

export function getHost(): OfficeHost {
  if (hostCache) return hostCache;
  if (!isOfficeReady()) return "unknown";
  const host = Office.context.host;
  switch (host) {
    case Office.HostType.Word:
      hostCache = "word";
      break;
    case Office.HostType.Excel:
      hostCache = "excel";
      break;
    case Office.HostType.PowerPoint:
      hostCache = "powerpoint";
      break;
    default:
      hostCache = "unknown";
  }
  return hostCache;
}

export function getPlatform(): OfficePlatform {
  if (platformCache) return platformCache;
  if (!isOfficeReady()) return "unknown";
  const platform = Office.context.platform;
  switch (platform) {
    case Office.PlatformType.PC:
    case Office.PlatformType.Mac:
    case Office.PlatformType.iOS:
    case Office.PlatformType.Android:
    case Office.PlatformType.Universal:
      platformCache = "desktop";
      break;
    case Office.PlatformType.OfficeOnline:
      platformCache = "web";
      break;
    default:
      platformCache = "unknown";
  }
  return platformCache;
}

export function isOllamaCompatible(): boolean {
  const host = getHost();
  const platform = getPlatform();
  if (host === "unknown") return true;
  return platform === "desktop";
}

function truncate(text: string): string {
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  return `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[... truncated ${text.length - MAX_CONTEXT_CHARS} chars ...]`;
}

export async function getContext(): Promise<ChatContext> {
  const host = getHost();
  if (host === "unknown") {
    return { host, contextType: "none" };
  }
  try {
    switch (host) {
      case "word":
        return { host, ...(await getWordContext()) };
      case "excel":
        return { host, ...(await getExcelContext()) };
      case "powerpoint":
        return { host, ...(await getPowerPointContext()) };
    }
  } catch (error) {
    logger.warn("office", "Failed to read Office context", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { host, contextType: "none" };
  }
}

async function getWordContext(): Promise<
  Pick<ChatContext, "selectionText" | "contextType">
> {
  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    const text = selection.text.trim();
    if (text.length > 0) {
      return {
        selectionText: truncate(text),
        contextType: "selection" as const,
      };
    }
    const body = context.document.body;
    body.load("text");
    await context.sync();
    const full = body.text.trim();
    if (!full) return { contextType: "none" as const };
    return {
      selectionText: truncate(full),
      contextType: "document" as const,
    };
  });
}

async function getExcelContext(): Promise<
  Pick<ChatContext, "selectionText" | "contextType">
> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load("values,address");
    await context.sync();
    const values = range.values as (string | number | boolean)[][];
    if (values.length === 0) return { contextType: "none" as const };
    // Serialising a whole column can freeze the taskpane, so cap the snapshot
    // before building the CSV (same budget the Excel actions use).
    const maxRows = 200;
    const maxColumns = 50;
    const rows = values.slice(0, maxRows);
    const truncated =
      values.length > maxRows || (values[0]?.length ?? 0) > maxColumns;
    const csv = rows
      .map((row) =>
        row
          .slice(0, maxColumns)
          .map((cell) => String(cell ?? ""))
          .join(",")
      )
      .join("\n");
    if (csv.trim().length === 0) return { contextType: "none" as const };
    return {
      selectionText: truncate(
        `Range ${range.address}${truncated ? " (truncated)" : ""}\n\n${csv}`
      ),
      contextType: "range" as const,
    };
  });
}

async function getPowerPointContext(): Promise<
  Pick<ChatContext, "selectionText" | "contextType">
> {
  return PowerPoint.run(async (context) => {
    const selected = context.presentation.getSelectedSlides();
    selected.load("items/shapes/items/textFrame/textRange");
    await context.sync();
    const slide = selected.items[0];
    if (!slide) return { contextType: "none" as const };
    const text = slide.shapes.items
      .map((shape) => shape.textFrame?.textRange?.text ?? "")
      .join("\n")
      .trim();
    if (text.length === 0) return { contextType: "none" as const };
    return {
      selectionText: truncate(text),
      contextType: "slide" as const,
    };
  });
}

export async function insertTextAtSelection(text: string): Promise<void> {
  const host = getHost();
  if (host === "word") {
    await Word.run(async (context) => {
      context.document.getSelection().insertText(text, Word.InsertLocation.end);
      await context.sync();
    });
    return;
  }
  if (host === "excel") {
    await insertTextInCell(text);
    return;
  }
  if (host === "powerpoint") {
    await insertTextOnSlide(text);
    return;
  }
  throw new Error(`Insertion is not supported in ${host}`);
}
