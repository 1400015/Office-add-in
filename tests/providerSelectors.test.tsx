// @vitest-environment happy-dom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import "../src/i18n";
import { ProviderSelectors } from "../src/taskpane/components/ProviderSelectors";
import { useAppStore } from "../src/store/useAppStore";
import {
  ModelService,
  type ModelListResult,
} from "../src/services/ModelService";
import {
  createDefaultProviderConfig,
  PROVIDER_ORDER,
} from "../src/config/providers";
import type { ProviderConfig, ProviderId } from "../src/types";

vi.mock("../src/services/ModelService", () => ({
  ModelService: {
    listModels: vi.fn(),
    getStoredActiveModel: vi.fn(async () => null),
    setStoredActiveModel: vi.fn(async () => {}),
    invalidate: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function model(id: string, provider: ProviderId): ModelListResult {
  return { source: "remote", models: [{ id, name: id, provider }] };
}

beforeAll(() => {
  vi.spyOn(Element.prototype, "animate").mockImplementation(
    () =>
      ({
        cancel() {},
        finished: Promise.resolve(),
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as Animation
  );
});
beforeEach(() => {
  vi.clearAllMocks();
  const configs = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_ORDER)
    configs[id] = createDefaultProviderConfig(id);
  useAppStore.setState({
    providerConfigs: configs,
    activeProvider: "mistral",
    activeModel: "",
    officeReady: true,
    hydrated: true,
    vaultBusy: false,
    secretsLocked: false,
    persist: vi.fn(async () => {}),
  });
});
afterEach(cleanup);

describe("ProviderSelectors", () => {
  it("ignores an older provider list that finishes after the current provider", async () => {
    const old = deferred<ModelListResult>();
    const current = deferred<ModelListResult>();
    vi.mocked(ModelService.listModels).mockImplementation((config) =>
      config.id === "mistral" ? old.promise : current.promise
    );
    render(<ProviderSelectors />);
    await waitFor(() =>
      expect(ModelService.listModels).toHaveBeenCalledTimes(1)
    );
    act(() => useAppStore.getState().setActiveProvider("gemini"));
    await waitFor(() =>
      expect(ModelService.listModels).toHaveBeenCalledTimes(2)
    );
    await act(async () => current.resolve(model("gemini-model", "gemini")));
    await waitFor(() =>
      expect(useAppStore.getState().activeModel).toBe("gemini-model")
    );
    await act(async () => old.resolve(model("old-model", "mistral")));
    expect(useAppStore.getState().activeProvider).toBe("gemini");
    expect(useAppStore.getState().activeModel).toBe("gemini-model");
    expect(ModelService.setStoredActiveModel).not.toHaveBeenCalledWith(
      "mistral",
      "old-model"
    );
  });

  it("ignores a list that resolves after the vault becomes busy", async () => {
    const pending = deferred<ModelListResult>();
    vi.mocked(ModelService.listModels).mockReturnValue(pending.promise);
    render(<ProviderSelectors />);
    await waitFor(() => expect(ModelService.listModels).toHaveBeenCalledOnce());
    act(() => useAppStore.setState({ vaultBusy: true }));
    await act(async () => pending.resolve(model("late-model", "mistral")));
    expect(useAppStore.getState().activeModel).toBe("");
    expect(ModelService.setStoredActiveModel).not.toHaveBeenCalled();
  });
});
