// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MessageBubble } from "../src/taskpane/components/MessageBubble";
import type { ChatMessage } from "../src/types";

afterEach(() => {
  cleanup();
});

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

  it("renders copy and insert buttons for the last assistant message", () => {
    render(
      <MessageBubble
        message={makeMessage("assistant", "an answer")}
        isLastAssistant={true}
        onInsert={() => {}}
      />
    );
    expect(screen.getAllByRole("button").length).toBe(2);
  });

  it("hides the insert button for non-last assistant messages", () => {
    render(
      <MessageBubble
        message={makeMessage("assistant", "older answer")}
        isLastAssistant={false}
        onInsert={() => {}}
      />
    );
    expect(screen.getAllByRole("button").length).toBe(1);
  });

  it("calls onInsert when the insert button is clicked", () => {
    const onInsert = vi.fn();
    render(
      <MessageBubble
        message={makeMessage("assistant", "an answer")}
        isLastAssistant={true}
        onInsert={onInsert}
      />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]!);
    expect(onInsert).toHaveBeenCalledOnce();
  });

  it("copies content to the clipboard on copy click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <MessageBubble
        message={makeMessage("assistant", "copy me")}
        isLastAssistant={true}
        onInsert={() => {}}
      />
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("copy me");
    });
  });
});
