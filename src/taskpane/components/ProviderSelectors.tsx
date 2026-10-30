import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
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
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const setActiveModel = useAppStore((s) => s.setActiveModel);
  const setReasoning = useAppStore((s) => s.setReasoning);
  const persist = useAppStore((s) => s.persist);

  const [models, setModels] = useState<AIModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const config = providerConfigs[activeProvider];

  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    ModelService.listModels(config)
      .then(async (list) => {
        if (cancelled) return;
        setModels(list);
        if (!list.some((m) => m.id === activeModel) && list.length > 0) {
          setActiveModel(list[0]!.id);
          await ModelService.setStoredActiveModel(activeProvider, list[0]!.id);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  const providerOptions = useMemo(
    () =>
      PROVIDER_ORDER.map((id) => ({
        id,
        label: PROVIDER_DEFINITIONS[id].name,
        configured: Boolean(providerConfigs[id].apiKey) || id === "ollama",
      })),
    [providerConfigs]
  );

  const onProviderChange = async (id: string): Promise<void> => {
    const providerId = id as ProviderId;
    setActiveProvider(providerId);
    const stored = await ModelService.getStoredActiveModel(providerId);
    const list = await ModelService.listModels(
      useAppStore.getState().providerConfigs[providerId]
    );
    setModels(list);
    if (stored && list.some((m) => m.id === stored)) {
      setActiveModel(stored);
    } else if (list.length > 0) {
      setActiveModel(list[0]!.id);
      await ModelService.setStoredActiveModel(providerId, list[0]!.id);
    }
    void persist();
  };

  const onRefresh = async (): Promise<void> => {
    setLoadingModels(true);
    try {
      const list = await ModelService.listModels(config, true);
      setModels(list);
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <div className="selectors">
      <Dropdown
        size="small"
        value={PROVIDER_DEFINITIONS[activeProvider].name}
        selectedOptions={[activeProvider]}
        onOptionSelect={(_, data) =>
          void onProviderChange(String(data.optionValue))
        }
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
            setActiveModel(String(data.optionValue));
            void ModelService.setStoredActiveModel(
              activeProvider,
              String(data.optionValue)
            );
            void persist();
          }}
          disabled={loadingModels}
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
            onClick={() => void onRefresh()}
            disabled={loadingModels}
          />
        </Tooltip>
      </div>

      <Dropdown
        className="full-width"
        size="small"
        value={REASONING_LABELS[reasoning]}
        selectedOptions={[reasoning]}
        onOptionSelect={(_, data) => {
          setReasoning(data.optionValue as ReasoningLevel);
          void persist();
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
