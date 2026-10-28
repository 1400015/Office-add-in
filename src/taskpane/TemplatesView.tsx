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
import { PROMPT_TEMPLATES, TEMPLATE_CATEGORIES } from "./PromptTemplates";
import { useAppStore } from "../store/useAppStore";
import { useChat } from "../hooks/useChat";

export function TemplatesView(): JSX.Element {
  const { t } = useTranslation();
  const setSystemPrompt = useAppStore((s) => s.setSystemPrompt);
  const persist = useAppStore((s) => s.persist);
  const { sendMessage } = useChat();
  const [used, setUsed] = useState<string | null>(null);

  const onUse = async (
    templateId: string,
    prompt: string,
    system?: string
  ): Promise<void> => {
    if (system) {
      setSystemPrompt(system);
      await persist();
    }
    setUsed(templateId);
    await sendMessage(prompt);
  };

  return (
    <div className="templates-grid">
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
                {templates.map((tpl) => (
                  <Card key={tpl.id} size="small" style={{ marginBottom: 8 }}>
                    <Text weight="semibold">{tpl.title}</Text>
                    <div
                      style={{ fontSize: 11, opacity: 0.75, margin: "4px 0" }}
                    >
                      {tpl.prompt.slice(0, 120)}
                      {tpl.prompt.length > 120 ? "..." : ""}
                    </div>
                    <Button
                      size="small"
                      appearance="primary"
                      onClick={() =>
                        void onUse(tpl.id, tpl.prompt, tpl.systemPrompt)
                      }
                    >
                      {used === tpl.id ? t("chat.copied") : t("templates.use")}
                    </Button>
                  </Card>
                ))}
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
