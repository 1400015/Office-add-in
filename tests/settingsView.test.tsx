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
  act,
} from "@testing-library/react";
import "../src/i18n";
import { SettingsView } from "../src/taskpane/SettingsView";
import { useAppStore } from "../src/store/useAppStore";
import {
  createDefaultProviderConfig,
  PROVIDER_DEFINITIONS,
  PROVIDER_ORDER,
} from "../src/config/providers";
import type { ProviderConfig, ProviderId } from "../src/types";
import { ModelService } from "../src/services/ModelService";

vi.mock("../src/services/ModelService", () => ({
  ModelService: {
    probeConnection: vi.fn(async () => ({ modelCount: 2 })),
    listModels: vi.fn(async () => [
      { id: "m1", name: "m1", provider: "mistral" },
      { id: "m2", name: "m2", provider: "mistral" },
    ]),
  },
}));

vi.mock("../src/services/OfficeService", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, isOllamaCompatible: vi.fn(() => false) };
});

function createConfigs(): Record<ProviderId, ProviderConfig> {
  const configs = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_ORDER)
    configs[id] = createDefaultProviderConfig(id);
  return configs;
}

beforeAll(() => {
  // Fluent's presence animations reject an AbortError in happy-dom; use
  // inert animations so unmounting the view cannot leak unhandled rejections.
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
  useAppStore.setState({
    providerConfigs: createConfigs(),
    updateProviderConfig: vi.fn(),
    temperature: 0.7,
    maxTokens: 1024,
    activeProvider: "mistral",
    activeModel: "mistral-large-latest",
    systemPrompt: "",
    theme: "light",
    language: "en",
    secretsLocked: false,
    hydrated: true,
    vaultBusy: false,
    passphraseEnabled: false,
    createPassphrase: vi.fn(),
    unlockSecrets: vi.fn(async () => true),
    lockSecrets: vi.fn(),
    setTemperature: vi.fn(),
    setMaxTokens: vi.fn(),
    setSystemPrompt: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    persist: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsView", () => {
  it("hides editable settings while the vault is busy", () => {
    useAppStore.setState({ hydrated: true, vaultBusy: true });
    render(<SettingsView />);
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.queryByText(PROVIDER_DEFINITIONS.mistral.name)).toBeNull();
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("discards a probe response when the vault becomes busy", async () => {
    let finish!: (value: { modelCount: number }) => void;
    vi.mocked(ModelService.probeConnection).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    render(<SettingsView />);
    fireEvent.click(
      screen.getByRole("button", { name: PROVIDER_DEFINITIONS.mistral.name })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Test connection" })
    );
    act(() => useAppStore.setState({ vaultBusy: true }));
    await act(async () => finish({ modelCount: 2 }));
    act(() => useAppStore.setState({ vaultBusy: false }));
    expect(screen.queryByText("OK (2 models)")).toBeNull();
  });

  it("renders the general and providers sections with every provider", () => {
    render(<SettingsView />);

    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText("Providers")).toBeTruthy();
    for (const id of PROVIDER_ORDER) {
      expect(screen.getByText(PROVIDER_DEFINITIONS[id].name)).toBeTruthy();
    }
  });

  it("shows the current temperature and max-tokens readings", () => {
    render(<SettingsView />);

    expect(screen.getAllByText("0.7").length).toBeGreaterThan(0);
    // min(1024, MAX_TOKENS_LIMIT) for the default mistral family (no limit).
    expect(screen.getAllByText("1024").length).toBeGreaterThan(0);
  });

  it("warns when Ollama cannot run on this host", () => {
    render(<SettingsView />);

    expect(
      screen.getByText(
        "Ollama runs on localhost and only works in Office Desktop. In Office on the web, browser security blocks local connections."
      )
    ).toBeTruthy();
  });

  it("tests a provider connection and shows the model count", async () => {
    render(<SettingsView />);

    // Expand the provider accordion first: its panel is hidden until open.
    fireEvent.click(
      screen.getByRole("button", {
        name: PROVIDER_DEFINITIONS["mistral"].name,
      })
    );
    const testButton = await screen.findByRole("button", {
      name: "Test connection",
    });
    fireEvent.click(testButton);

    await screen.findByText("OK (2 models)");
  });

  it("persists the settings and toggles the save label", async () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(useAppStore.getState().persist).toHaveBeenCalledOnce();
    });
    await screen.findByText("Settings saved");
  });

  it("hides provider edits while secrets are locked", () => {
    useAppStore.setState({ secretsLocked: true });
    render(<SettingsView />);

    expect(
      screen.getByText("Unlock the passphrase to view or change API keys.")
    ).toBeTruthy();
    expect(screen.queryByText(PROVIDER_DEFINITIONS["mistral"].name)).toBeNull();
  });

  it("locks the secrets on demand when a passphrase exists", () => {
    useAppStore.setState({ passphraseEnabled: true });
    render(<SettingsView />);

    fireEvent.click(screen.getByText("Lock"));

    expect(useAppStore.getState().lockSecrets).toHaveBeenCalledOnce();
  });
});
