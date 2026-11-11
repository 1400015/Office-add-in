// @vitest-environment happy-dom
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "../src/i18n";
import { ChatView } from "../src/taskpane/ChatView";
import { useAppStore } from "../src/store/useAppStore";
import type { ChatMessage } from "../src/types";

const sendMessage = vi.fn();
const stopStreaming = vi.fn();

vi.mock("../src/hooks/useChat", () => ({
  useChat: () => ({
    sendMessage,
    stopStreaming,
    insertLastAnswer: vi.fn(),
    regenerateLast: vi.fn(),
  }),
}));

vi.mock("../src/taskpane/components/ProviderSelectors", () => ({
  ProviderSelectors: () => <div data-testid="provider-selectors" />,
}));

vi.mock("../src/taskpane/components/QuickActions", () => ({
  QuickActions: () => <div data-testid="quick-actions" />,
}));

function makeMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: `m-${content}`, role, content, timestamp: Date.now() };
}

beforeAll(() => {
  vi.spyOn(Element.prototype, "animate").mockImplementation(
    () =>
      ({
        cancel: () => {},
        finished: Promise.resolve(),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as Animation
  );
});

beforeEach(() => {
  sendMessage.mockClear();
  stopStreaming.mockClear();
  useAppStore.setState({
    messages: [],
    isStreaming: false,
    streamingContent: "",
    error: null,
    setError: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatView", () => {
  it("shows the empty state when there are no messages", () => {
    render(<ChatView />);

    expect(screen.getByText("How can I help you today?")).toBeTruthy();
    expect(
      screen.getByText("Ask anything, or use a quick action for your document.")
    ).toBeTruthy();
  });

  it("renders the conversation messages", () => {
    useAppStore.setState({
      messages: [
        makeMessage("user", "hello there"),
        makeMessage("assistant", "hi back"),
      ],
    });

    render(<ChatView />);

    expect(screen.getByText("hello there")).toBeTruthy();
    expect(screen.getByText("hi back")).toBeTruthy();
  });

  it("shows the streaming bubble and thinking indicator", () => {
    useAppStore.setState({ isStreaming: true, streamingContent: "" });

    render(<ChatView />);

    expect(screen.getByText("Thinking...")).toBeTruthy();
  });

  it("shows streamed content while streaming", () => {
    useAppStore.setState({
      isStreaming: true,
      streamingContent: "partial answer",
    });

    render(<ChatView />);

    expect(screen.getByText("partial answer")).toBeTruthy();
  });

  it("renders the error bar and dismisses it", () => {
    const setError = vi.fn();
    useAppStore.setState({ error: "noApiKey", setError });

    render(<ChatView />);

    expect(screen.getByText(/API key/i)).toBeTruthy();
    // The dismiss button is the first button rendered (error bar precedes
    // the input area); the Send button is the second.
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(setError).toHaveBeenCalledWith(null);
  });

  it("sends a trimmed message and clears the input", async () => {
    render(<ChatView />);

    const textarea = screen.getByPlaceholderText("Write here...");
    fireEvent.change(textarea, { target: { value: "  hi  " } });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith("hi");
    });
  });

  it("disables send while streaming and offers stop", () => {
    useAppStore.setState({ isStreaming: true });

    render(<ChatView />);

    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(stopStreaming).toHaveBeenCalledOnce();
  });
});
