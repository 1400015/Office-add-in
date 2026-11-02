import type { JSX } from "react";
import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Button,
  Card,
  Text,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import {
  PROMPT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  templateText,
} from "./PromptTemplates";
import { useAppStore } from "../store/useAppStore";
import { useChat } from "../hooks/useChat";

export function TemplatesView(): JSX.Element {
  const { t, i18n } = useTranslation();
  const setView = useAppStore((s) => s.setView);
  const catalogStatus = useAppStore((s) => s.modelCatalog.status);
  const activeModel = useAppStore((s) => s.activeModel);
  const modelsReady = catalogStatus === "ready" && Boolean(activeModel);
  const busy = useAppStore(
    (s) =>
      s.isStreaming ||
      s.pendingAction !== null ||
      s.secretsLocked ||
      s.vaultBusy ||
      !s.hydrated
  );
  const { submitMessage } = useChat();
  const [used, setUsed] = useState<string | null>(null);

  const onUse = async (
    templateId: string,
    prompt: string,
    system?: string
  ): Promise<void> => {
    if (busy || !modelsReady) return;
    const request = submitMessage(prompt, system);
    if (!request) return;
    setView("chat");
    setUsed(templateId);
    await request;
  };

  return (
    <div className="templates-grid">
      {!busy && !modelsReady && (
        <div className="warning-banner">
          {t(
            catalogStatus === "idle" || catalogStatus === "loading"
              ? "common.loading"
              : "errors.noModel"
          )}
        </div>
      )}
      <Accordion
        collapsible
        multiple
        defaultOpenItems={[TEMPLATE_CATEGORIES[0]]}
      >
        {TEMPLATE_CATEGORIES.map((category) => {
          const templates = PROMPT_TEMPLATES.filter(
            (tpl) => tpl.category === category
          );
          if (templates.length === 0) return null;
          return (
            <AccordionItem key={category} value={category}>
              <AccordionHeader>
                {t(`templates.categories.${category}`)}
              </AccordionHeader>
              <AccordionPanel>
                {templates.map((tpl) => {
                  const title = templateText(tpl.title, i18n.language);
                  const prompt = templateText(tpl.prompt, i18n.language);
                  const system = tpl.systemPrompt
                    ? templateText(tpl.systemPrompt, i18n.language)
                    : undefined;
                  return (
                    <Card key={tpl.id} size="small" style={{ marginBottom: 8 }}>
                      <Text weight="semibold">{title}</Text>
                      <div
                        style={{ fontSize: 11, opacity: 0.75, margin: "4px 0" }}
                      >
                        {prompt.slice(0, 120)}
                        {prompt.length > 120 ? "..." : ""}
                      </div>
                      <Button
                        size="small"
                        appearance="primary"
                        disabled={busy || !modelsReady}
                        onClick={() => void onUse(tpl.id, prompt, system)}
                      >
                        {used === tpl.id
                          ? t("templates.sent")
                          : t("templates.use")}
                      </Button>
                    </Card>
                  );
                })}
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
