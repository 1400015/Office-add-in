// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MessageBubble } from "../src/taskpane/components/MessageBubble";
import type { ChatMessage } from "../src/types";

afterEach(() => {
  cleanup();
});

// react-markdown is lazy-loaded: assistant content renders through a
// <Suspense> fallback first, so assertions on markdown output must wait.
async function renderAssistant(
  content: string,
  isLastAssistant: boolean,
  onInsert = () => {}
): Promise<void> {
  render(
    <MessageBubble
      message={makeMessage("assistant", content)}
      isLastAssistant={isLastAssistant}
      onInsert={onInsert}
    />
  );
  // Wait for the lazy chunk to resolve and the markdown to render (the
  // rendered text differs from raw markdown, e.g. **bold** -> <strong>).
  await waitFor(() => {
    expect(
      document.querySelector(".message-markdown")?.textContent?.trim().length
    ).toBeGreaterThan(0);
  });
}

function makeMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: "m1",
    role,
    content,
    timestamp: Date.now(),
  };
}

describe("MessageBubble", () => {
  it("renders the message content", () => {
    render(
      <MessageBubble
        message={makeMessage("user", "hello there")}
        isLastAssistant={false}
        onInsert={() => {}}
      />
    );
    expect(screen.getByText("hello there")).toBeTruthy();
  });

  it("renders action buttons only for assistant messages", () => {
    render(
      <MessageBubble
        message={makeMessage("user", "question")}
        isLastAssistant={false}
        onInsert={() => {}}
      />
    );
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(0);
  });

  it("renders copy and insert buttons for the last assistant message", async () => {
    await renderAssistant("an answer", true);
    expect(screen.getAllByRole("button").length).toBe(2);
  });

  it("hides the insert button for non-last assistant messages", async () => {
    await renderAssistant("older answer", false);
    expect(screen.getAllByRole("button").length).toBe(1);
  });

  it("calls onInsert when the insert button is clicked", async () => {
    const onInsert = vi.fn();
    await renderAssistant("an answer", true, onInsert);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]!);
    expect(onInsert).toHaveBeenCalledOnce();
  });

  it("copies content to the clipboard on copy click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    await renderAssistant("copy me", true);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("copy me");
    });
  });

  it("renders assistant markdown (e.g. bold) after the lazy chunk loads", async () => {
    await renderAssistant("**bold** text", true);
    await waitFor(() => {
      expect(
        document.querySelector(".message-markdown strong")?.textContent
      ).toBe("bold");
    });
  });
});
