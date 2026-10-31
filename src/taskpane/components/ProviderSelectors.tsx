import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dropdown, Option, Tooltip } from "@fluentui/react-components";
import { ArrowSync20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import { PROVIDER_DEFINITIONS, PROVIDER_ORDER } from "../../config/providers";
import {
  REASONING_LABELS,
  REASONING_LEVELS,
} from "../../config/reasoningProfiles";
import { ModelService } from "../../services/ModelService";
import type { AIModel, ProviderId, ReasoningLevel } from "../../types";

export function ProviderSelectors(): JSX.Element {
  const { t } = useTranslation();
  const activeProvider = useAppStore((s) => s.activeProvider);
  const activeModel = useAppStore((s) => s.activeModel);
  const reasoning = useAppStore((s) => s.reasoning);
  const providerConfigs = useAppStore((s) => s.providerConfigs);
  const officeReady = useAppStore((s) => s.officeReady);
  const hydrated = useAppStore((s) => s.hydrated);
  const vaultBusy = useAppStore((s) => s.vaultBusy);
  const secretsLocked = useAppStore((s) => s.secretsLocked);
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const setActiveModel = useAppStore((s) => s.setActiveModel);
  const setReasoning = useAppStore((s) => s.setReasoning);
  const persist = useAppStore((s) => s.persist);
  const [models, setModels] = useState<AIModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const refreshSeen = useRef(0);
  const config = providerConfigs[activeProvider];

  useEffect(() => {
    if (!officeReady || !hydrated || secretsLocked || vaultBusy) {
      setModels([]);
      setLoadingModels(false);
      setWarning(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const force = refreshSeen.current !== refresh;
    refreshSeen.current = refresh;
    const previousModel = useAppStore.getState().activeModel;
    const current = (): boolean => {
      const state = useAppStore.getState();
      return (
        !cancelled &&
        !state.secretsLocked &&
        state.hydrated &&
        !state.vaultBusy &&
        state.activeProvider === activeProvider &&
        state.providerConfigs[activeProvider] === config
      );
    };
    setLoadingModels(true);
    setModels([]);
    setActiveModel("");
    void (async () => {
      try {
        const [result, stored] = await Promise.all([
          ModelService.listModels(config, force, controller.signal),
          ModelService.getStoredActiveModel(activeProvider),
        ]);
        if (!current()) return;
        setModels(result.models);
        setWarning(result.warningKey ?? null);
        const candidate = [previousModel, stored].find(
          (id) => id && result.models.some((m) => m.id === id)
        );
        const chosen = candidate || result.models[0]?.id || "";
        setActiveModel(chosen);
        if (chosen && chosen !== stored) {
          await ModelService.setStoredActiveModel(activeProvider, chosen);
          if (!current()) return;
        }
        await persist();
      } catch {
        if (current()) useAppStore.getState().setError("errors.generic");
      } finally {
        if (current()) setLoadingModels(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeProvider,
    config,
    officeReady,
    hydrated,
    secretsLocked,
    vaultBusy,
    refresh,
    setActiveModel,
    persist,
  ]);

  const providerOptions = useMemo(
    () =>
      PROVIDER_ORDER.map((id) => ({
        id,
        label: PROVIDER_DEFINITIONS[id].name,
        configured: Boolean(providerConfigs[id].apiKey) || id === "ollama",
      })),
    [providerConfigs]
  );

  const saveSettings = (): void => {
    void persist().catch(() =>
      useAppStore.getState().setError("errors.generic")
    );
  };
  const onProviderChange = (id: string): void => {
    if (!PROVIDER_ORDER.includes(id as ProviderId)) return;
    setActiveProvider(id as ProviderId);
    setActiveModel("");
  };

  return (
    <div className="selectors">
      <Dropdown
        size="small"
        value={PROVIDER_DEFINITIONS[activeProvider].name}
        selectedOptions={[activeProvider]}
        disabled={secretsLocked || vaultBusy || !hydrated}
        onOptionSelect={(_, data) => onProviderChange(String(data.optionValue))}
      >
        {providerOptions.map((p) => (
          <Option key={p.id} value={p.id} text={p.label}>
            {p.label}
            {!p.configured ? " ⚠" : ""}
          </Option>
        ))}
      </Dropdown>
      <div style={{ display: "flex", gap: 4 }}>
        <Dropdown
          size="small"
          style={{ flex: 1 }}
          value={models.find((m) => m.id === activeModel)?.name ?? activeModel}
          selectedOptions={activeModel ? [activeModel] : []}
          onOptionSelect={(_, data) => {
            const id = String(data.optionValue);
            if (!models.some((model) => model.id === id)) return;
            setActiveModel(id);
            void ModelService.setStoredActiveModel(activeProvider, id)
              .then(() => {
                if (
                  useAppStore.getState().activeProvider === activeProvider &&
                  useAppStore.getState().activeModel === id
                )
                  saveSettings();
              })
              .catch(() => useAppStore.getState().setError("errors.generic"));
          }}
          disabled={
            loadingModels ||
            secretsLocked ||
            vaultBusy ||
            !officeReady ||
            !hydrated
          }
        >
          {models.map((m) => (
            <Option key={m.id} value={m.id} text={m.name}>
              {m.name}
            </Option>
          ))}
        </Dropdown>
        <Tooltip content={t("selectors.refreshModels")} relationship="label">
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowSync20Regular />}
            onClick={() => setRefresh((value) => value + 1)}
            disabled={
              loadingModels ||
              secretsLocked ||
              vaultBusy ||
              !officeReady ||
              !hydrated
            }
          />
        </Tooltip>
      </div>
      {warning && <div className="warning-banner full-width">{t(warning)}</div>}
      {!loadingModels &&
        officeReady &&
        hydrated &&
        !vaultBusy &&
        !secretsLocked &&
        models.length === 0 && (
          <div className="warning-banner full-width">
            {t("selectors.noModels")}
          </div>
        )}
      <Dropdown
        className="full-width"
        size="small"
        disabled={vaultBusy || !hydrated}
        value={REASONING_LABELS[reasoning]}
        selectedOptions={[reasoning]}
        onOptionSelect={(_, data) => {
          setReasoning(data.optionValue as ReasoningLevel);
          saveSettings();
        }}
      >
        {REASONING_LEVELS.map((level) => (
          <Option key={level} value={level} text={REASONING_LABELS[level]}>
            {t("selectors.reasoning")}: {REASONING_LABELS[level]}
          </Option>
        ))}
      </Dropdown>
    </div>
  );
}
