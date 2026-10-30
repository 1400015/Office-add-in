import type { JSX } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
  Textarea,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import {
  isTargetLanguage,
  TARGET_LANGUAGES,
  type TargetLanguage,
} from "./languages";

interface CreatePresentationDialogProps {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  topic: string;
  onTopicChange: (value: string) => void;
  slideCount: string;
  onSlideCountChange: (value: string) => void;
  onSubmit: () => void;
}

export function CreatePresentationDialog({
  open,
  onClose,
  busy,
  topic,
  onTopicChange,
  slideCount,
  onSlideCountChange,
  onSubmit,
}: CreatePresentationDialogProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t("dialogs.createTitle")}</DialogTitle>
          <DialogContent>
            <div className="dialog-fields">
              <Field label={t("dialogs.topic")} required>
                <Input
                  value={topic}
                  placeholder={t("dialogs.topicPlaceholder")}
                  onChange={(_, data) => onTopicChange(data.value)}
                />
              </Field>
              <Field label={t("dialogs.slideCount")}>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={slideCount}
                  onChange={(_, data) => onSlideCountChange(data.value)}
                />
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              appearance="primary"
              disabled={!topic.trim() || busy}
              onClick={onSubmit}
            >
              {t("dialogs.create")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

interface TranslateDialogProps {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  targetLang: TargetLanguage;
  onTargetLangChange: (value: TargetLanguage) => void;
  onSubmit: () => void;
}

export function TranslateDialog({
  open,
  onClose,
  busy,
  targetLang,
  onTargetLangChange,
  onSubmit,
}: TranslateDialogProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t("dialogs.translateTitle")}</DialogTitle>
          <DialogContent>
            <Field label={t("dialogs.targetLanguage")}>
              <Dropdown
                value={t(`languages.${targetLang}`)}
                selectedOptions={[targetLang]}
                onOptionSelect={(_, data) => {
                  if (isTargetLanguage(data.optionValue)) {
                    onTargetLangChange(data.optionValue);
                  }
                }}
              >
                {TARGET_LANGUAGES.map((code) => (
                  <Option key={code} value={code}>
                    {t(`languages.${code}`)}
                  </Option>
                ))}
              </Dropdown>
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button appearance="primary" disabled={busy} onClick={onSubmit}>
              {t("dialogs.translate")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

interface InstructionDialogProps {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  title: string;
  instruction: string;
  onInstructionChange: (value: string) => void;
  onSubmit: () => void;
}

export function InstructionDialog({
  open,
  onClose,
  busy,
  title,
  instruction,
  onInstructionChange,
  onSubmit,
}: InstructionDialogProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <Field label={t("dialogs.instruction")} required>
              <Textarea
                value={instruction}
                placeholder={t("dialogs.instructionPlaceholder")}
                onChange={(_, data) => onInstructionChange(data.value)}
                rows={4}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              appearance="primary"
              disabled={!instruction.trim() || busy}
              onClick={onSubmit}
            >
              {t("dialogs.generate")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
