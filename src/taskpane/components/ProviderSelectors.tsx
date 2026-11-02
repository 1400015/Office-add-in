import type { JSX } from "react";
import { useMemo } from "react";
import {
  Button,
  Dropdown,
  Option,
  Spinner,
  Tooltip,
} from "@fluentui/react-components";
import { ArrowSync20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import { PROVIDER_DEFINITIONS, PROVIDER_ORDER } from "../../config/providers";
import {
  REASONING_LABELS,
  REASONING_LEVELS,
} from "../../config/reasoningProfiles";
import type { ProviderId, ReasoningLevel } from "../../types";

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
  const catalog = useAppStore((s) => s.modelCatalog);
  const refreshModels = useAppStore((s) => s.refreshModels);
  const available = officeReady && hydrated && !secretsLocked && !vaultBusy;
  const currentCatalog = catalog.provider === activeProvider;
  const ready = currentCatalog && catalog.status === "ready";
  const models = currentCatalog ? catalog.models : [];
  const loadingModels =
    available &&
    (!currentCatalog ||
      catalog.status === "idle" ||
      catalog.status === "loading");
  const warning = currentCatalog ? catalog.warningKey : undefined;

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
            const current = useAppStore.getState();
            if (
              current.modelCatalog.generation !== catalog.generation ||
              current.activeProvider !== activeProvider
            )
              return;
            setActiveModel(id);
          }}
          disabled={!ready || !available}
        >
          {models.map((m) => (
            <Option key={m.id} value={m.id} text={m.name}>
              {m.name}
              {m.chatCompatibility !== "supported"
                ? ` — ${t("selectors.modelCompatibilityUnknown")}`
                : ""}
            </Option>
          ))}
        </Dropdown>
        <Tooltip content={t("selectors.refreshModels")} relationship="label">
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowSync20Regular />}
            onClick={refreshModels}
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
      {loadingModels && <Spinner size="tiny" label={t("common.loading")} />}
      {warning && <div className="warning-banner full-width">{t(warning)}</div>}
      {ready &&
        models.length > 0 &&
        (!activeModel ||
          models.find((model) => model.id === activeModel)
            ?.chatCompatibility !== "supported") && (
          <div className="warning-banner full-width">
            {t(
              activeModel
                ? "selectors.modelCompatibilityUnknown"
                : "selectors.chooseCompatibleModel"
            )}
          </div>
        )}
      {ready && available && models.length === 0 && (
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
