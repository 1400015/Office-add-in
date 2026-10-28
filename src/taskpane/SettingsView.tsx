import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Button,
  Field,
  Input,
  Slider,
  Dropdown,
  Option,
  Switch,
  MessageBar,
  MessageBarBody,
  Text,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import { PROVIDER_DEFINITIONS, PROVIDER_ORDER } from "../config/providers";
import {
  MAX_TOKENS_LIMIT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from "../config/reasoningProfiles";
import { isOllamaCompatible } from "../services/OfficeService";
import { ModelService } from "../services/ModelService";
import type { ProviderId, ThemeMode } from "../types";

const THEME_OPTIONS: ThemeMode[] = ["light", "dark", "auto"];
const LANGUAGE_OPTIONS = ["en", "pt", "es", "fr", "de"] as const;

export function SettingsView(): JSX.Element {
  const { t, i18n } = useTranslation();
  const providerConfigs = useAppStore((s) => s.providerConfigs);
  const updateProviderConfig = useAppStore((s) => s.updateProviderConfig);
  const temperature = useAppStore((s) => s.temperature);
  const maxTokens = useAppStore((s) => s.maxTokens);
  const systemPrompt = useAppStore((s) => s.systemPrompt);
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const setTemperature = useAppStore((s) => s.setTemperature);
  const setMaxTokens = useAppStore((s) => s.setMaxTokens);
  const setSystemPrompt = useAppStore((s) => s.setSystemPrompt);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const persist = useAppStore((s) => s.persist);

  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [testResult, setTestResult] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  const onSave = async (): Promise<void> => {
    await persist();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const onTest = async (id: ProviderId): Promise<void> => {
    setTesting(id);
    setTestResult((prev) => ({ ...prev, [id]: { ok: true, message: "" } }));
    try {
      const models = await ModelService.listModels(providerConfigs[id], true);
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: true, message: `OK (${models.length} models)` },
      }));
    } catch (error) {
      setTestResult((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const ollamaBlocked = providerConfigs.ollama && !isOllamaCompatible();

  return (
    <div className="settings-section">
      <Accordion
        collapsible
        multiple
        defaultOpenItems={["general", "providers"]}
      >
        <AccordionItem value="general">
          <AccordionHeader>{t("settings.general")}</AccordionHeader>
          <AccordionPanel>
            <div className="settings-field">
              <Field label={t("settings.temperature")}>
                <Slider
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(_, data) => setTemperature(data.value)}
                />
                <Text size={200}>{temperature.toFixed(1)}</Text>
              </Field>
            </div>
            <div className="settings-field">
              <Field label={t("settings.maxTokens")}>
                <Slider
                  min={256}
                  max={MAX_TOKENS_LIMIT}
                  step={256}
                  value={maxTokens}
                  onChange={(_, data) => setMaxTokens(data.value)}
                />
                <Text size={200}>{maxTokens}</Text>
              </Field>
            </div>
            <div className="settings-field">
              <Field label={t("settings.systemPrompt")}>
                <Input
                  value={systemPrompt}
                  placeholder={t("settings.systemPromptPlaceholder")}
                  onChange={(_, data) => setSystemPrompt(data.value)}
                />
              </Field>
            </div>
            <div className="settings-field">
              <Field label={t("settings.theme")}>
                <Dropdown
                  value={t(`settings.themes.${theme}`)}
                  selectedOptions={[theme]}
                  onOptionSelect={(_, data) =>
                    setTheme(data.optionValue as ThemeMode)
                  }
                >
                  {THEME_OPTIONS.map((mode) => (
                    <Option
                      key={mode}
                      value={mode}
                      text={t(`settings.themes.${mode}`)}
                    >
                      {t(`settings.themes.${mode}`)}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
            <div className="settings-field">
              <Field label={t("settings.language")}>
                <Dropdown
                  value={t(`languages.${language}`)}
                  selectedOptions={[language]}
                  onOptionSelect={(_, data) => {
                    const lng = String(data.optionValue);
                    setLanguage(lng);
                    void i18n.changeLanguage(lng);
                  }}
                >
                  {LANGUAGE_OPTIONS.map((lng) => (
                    <Option key={lng} value={lng} text={t(`languages.${lng}`)}>
                      {t(`languages.${lng}`)}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="providers">
          <AccordionHeader>{t("settings.providers")}</AccordionHeader>
          <AccordionPanel>
            <div className="warning-banner">
              {t("settings.keySecurityWarning")}
            </div>
            {ollamaBlocked && (
              <MessageBar intent="warning">
                <MessageBarBody>{t("settings.ollamaWarning")}</MessageBarBody>
              </MessageBar>
            )}
            {PROVIDER_ORDER.map((id) => {
              const def = PROVIDER_DEFINITIONS[id];
              const config = providerConfigs[id];
              const corsIssue = !def.corsSafe;
              const result = testResult[id];
              return (
                <Accordion
                  key={id}
                  collapsible
                  style={{
                    border: "1px solid var(--colorNeutralStroke2, #e0e0e0)",
                    borderRadius: 6,
                    marginTop: 8,
                  }}
                >
                  <AccordionItem value={id}>
                    <AccordionHeader>{def.name}</AccordionHeader>
                    <AccordionPanel>
                      <div className="settings-field">
                        <Field label={def.apiKeyLabel}>
                          <Input
                            type="password"
                            value={config.apiKey}
                            autoComplete="off"
                            onChange={(_, data) =>
                              updateProviderConfig(id, { apiKey: data.value })
                            }
                          />
                        </Field>
                        {config.apiKey.length > 0 && (
                          <Text size={200}>••••{config.apiKey.slice(-4)}</Text>
                        )}
                      </div>
                      <div className="settings-field">
                        <Field label={t("settings.endpoint")}>
                          <Input
                            value={config.endpoint}
                            onChange={(_, data) =>
                              updateProviderConfig(id, { endpoint: data.value })
                            }
                          />
                        </Field>
                      </div>
                      <div className="settings-field">
                        <Field label={t("settings.timeout")}>
                          <Input
                            type="number"
                            value={String(config.timeout)}
                            onChange={(_, data) =>
                              updateProviderConfig(id, {
                                timeout:
                                  Number(data.value) || def.defaultTimeout,
                              })
                            }
                          />
                        </Field>
                      </div>
                      <div className="settings-field">
                        <Switch
                          checked={config.useProxy}
                          onChange={(_, data) =>
                            updateProviderConfig(id, {
                              useProxy: Boolean(data.checked),
                            })
                          }
                          label={t("settings.useProxy")}
                        />
                      </div>
                      {config.useProxy && (
                        <div className="settings-field">
                          <Field label={t("settings.proxyUrl")}>
                            <Input
                              value={config.proxyUrl}
                              placeholder="https://your-proxy.example.com"
                              onChange={(_, data) =>
                                updateProviderConfig(id, {
                                  proxyUrl: data.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                      {corsIssue && !config.useProxy && (
                        <MessageBar intent="warning">
                          <MessageBarBody>
                            {t("settings.corsWarning")}
                          </MessageBarBody>
                        </MessageBar>
                      )}
                      {result && (
                        <MessageBar intent={result.ok ? "success" : "error"}>
                          <MessageBarBody>{result.message}</MessageBarBody>
                        </MessageBar>
                      )}
                      <Button
                        size="small"
                        onClick={() => void onTest(id)}
                        disabled={testing === id}
                      >
                        {testing === id
                          ? t("common.loading")
                          : t("settings.testConnection")}
                      </Button>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              );
            })}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <Button appearance="primary" onClick={() => void onSave()}>
        {saved ? t("settings.saved") : t("settings.save")}
      </Button>
    </div>
  );
}

export { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE };
