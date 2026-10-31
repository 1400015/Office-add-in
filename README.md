# Office Universal AI

Universal AI assistant add-in for **Microsoft Word, Excel and PowerPoint** (Desktop and Web).

Built with **React + TypeScript + Vite + Office.js + Fluent UI v9**.

## Features

- **Multi-provider**: Mistral AI, OpenAI, Anthropic Claude, Google Gemini, OpenRouter and local Ollama — with a generic provider interface ready for extensions
- **Dynamic model listing** per provider (with curated fallbacks)
- **Abstract reasoning levels**: OFF / LOW / MEDIUM / HIGH / MAXIMUM, adapted internally per provider
- **Streaming chat** (SSE) with a ChatGPT-like interface
- **Host-aware quick actions**:
  - **Word**: summarize document, explain selection, rewrite, translate or fix grammar in place when text is selected, generate & insert content
  - **Excel**: explain formula, generate formula, analyse table, generate VBA, generate Office Script
  - **PowerPoint**: create slides, explain the active slide, improve or correct its text in place, translate the slide, generate speaker notes, summarize the deck, and insert the last answer onto the slide
- **Prompt template library**: medicine, veterinary, pharmacy, research, programming, marketing, legal, education
- **Local history** (IndexedDB) and settings persistence (`OfficeRuntime.storage`)
- **Theme**: light / dark / automatic (follows the Office theme)
- **i18n**: English, Portuguese, Spanish, French and German (extensible)

## Project structure

```text
OfficeUniversalAI/
├── manifest.xml              # Universal manifest (Word, Excel, PowerPoint)
├── index.html                # Taskpane entry (also the shared runtime)
├── src/
│   ├── taskpane/             # React UI (Chat, Settings, History, Templates)
│   ├── commands/             # Ribbon bridge running in the shared runtime
│   ├── providers/            # BaseProvider + 6 providers + factory
│   ├── services/             # Storage, History (IndexedDB), Model, Office, Http, Logger
│   ├── store/                # Zustand store
│   ├── hooks/                # useOfficeInit, useChat
│   ├── word/ excel/ powerpoint/  # Host-specific actions
│   ├── config/               # Provider definitions, reasoning profiles
│   ├── i18n/                 # Translations (en, pt, es, fr, de)
│   └── types/                # Shared TypeScript types
├── public/icons/             # Add-in icons (16–128 px)
└── tests/                    # Vitest unit tests
```

## Documentation

- **[INSTALL.md](INSTALL.md)** — detailed installation guide (Windows, Mac, Web, production hosting, organization deployment)
- **[README.md](README.md)** — this file (architecture, configuration, development)

## Getting started

### Prerequisites

- Node.js >= 20.19 (React 19 and Vite 7 require at least Node 20.19)
- Microsoft 365 (Desktop or Web) — for sideloading

### Install and run

```bash
npm install
npm run icons     # generate the ribbon/manifest icons (requires sharp)
npm start         # installs dev certificates and starts https://localhost:3000
```

> Office Add-ins require HTTPS. `npm start` installs a local dev certificate via
> `office-addin-dev-certs`. On first run, trust the certificate in your OS keychain.

### Other scripts

```bash
npm run build       # typecheck + production build into dist/
npm run validate    # validate manifest.xml against Microsoft's schema
npm run lint        # ESLint (strict, zero warnings allowed)
npm run format      # Prettier
npm test            # Vitest unit tests
npm run stop        # remove dev certificates
```

> **Note on `npm run validate`**: the manifest is validated against Microsoft's
> schema, including the `VersionOverrides` block. The command contacts Microsoft's
> validation service and exits nonzero on rejection, timeout, network failure or
> an invalid response. It respects `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`.
> CI runs this on every push; service acceptance does not replace testing in Office.

## Sideloading

### Microsoft 365 Desktop (Windows / Mac)

1. Run `npm start` (or `npm run build` and serve `dist/` over HTTPS on port 3000).
2. In Word, Excel or PowerPoint go to **Insert > Get Add-ins > My Add-ins**.
3. Choose **Upload My Add-in** (or **Shared Folder** in an organization).
4. Select `manifest.xml` from this project.
5. The **AI Assistant** group appears on the Home tab. Click **Open Chat**.

Alternatively, use the Office Add-in debugging tools:

```bash
npm run sideload    # office-addin-debugging start manifest.xml desktop
```

### Microsoft 365 on the Web

1. Host the production build (`dist/`) on any HTTPS endpoint, including `https://localhost:3000` during development.
2. Update every `https://localhost:3000` URL in `manifest.xml` (icons, `SourceLocation`, `AppDomains`) to your hosting URL.
3. In Office on the web, go to **Insert > Get Add-ins > My Add-ins > Upload My Add-in** and select the updated `manifest.xml`.

### Network catalog (organization-wide)

Deploy `manifest.xml` through the Microsoft 365 admin center (**Settings > Integrated apps > Add-ins > Deploy Add-in**) pointing to the hosted URL.

## Configuration

Open the **Settings** tab inside the add-in:

- Add an **API key** and optional **endpoint** per provider.
- Providers whose APIs do not allow direct browser calls (**OpenAI**, **Claude**) require the **proxy** in [`proxy/worker.ts`](proxy/worker.ts). Deploy it with `npx wrangler deploy --var ALLOWED_ORIGINS:"https://meu-servidor.com"` and paste the worker origin into **Proxy URL**. The add-in sends `X-OUAI-Upstream`; the worker only forwards to allowlisted provider hosts and adds CORS. API keys are sent in the provider's authentication header, never in the URL. A plain deploy is already production (`ENVIRONMENT` is set in `wrangler.toml`): the worker answers HTTP 500 until `ALLOWED_ORIGINS` is the origin that hosts the add-in, refuses requests without an `Origin` header, and rejects every other browser origin. Local testing uses `npx wrangler dev --env dev`, which allows only `https://localhost:3000`. The taskpane translates each of these rejections into an actionable message.
- **Ollama** only works in **Office Desktop** (the browser blocks `http://localhost` from the Office web taskpane).
- **Test connection** contacts the configured endpoint and checks authentication where applicable. It does not generate a response or verify available quota. Suggested model lists may be shown when listing is unavailable; those suggestions do not prove connectivity. An Ollama server with no installed models returns an empty list.
- Word replacement actions reject selections longer than 60,000 characters. If the original Word, Excel or PowerPoint content changes while an AI response is being generated, the response is shown in chat without overwriting the changed content.

> ⚠️ **Security note**: Without a passphrase, API keys are only obfuscated in `OfficeRuntime.storage`. Set a passphrase in Settings to encrypt keys and chat history with a key that stays in memory for the session (it is not stored). Secrets are masked in the UI and redacted from logs.

## Internationalization (i18n)

The UI is fully translated into **English, Portuguese, Spanish, French and German** with i18next and react-i18next.

- **Bundles**: [`src/i18n/locales/`](src/i18n/locales/) holds `en.json`, `pt.json`, `es.json`, `fr.json` and `de.json`, each with the same key set. They are registered in [`src/i18n/index.ts`](src/i18n/index.ts) with `fallbackLng: "en"`. On first run the UI language is detected from the browser/Office language (`detectLanguage()`), falling back to English; a language saved in Settings overrides the detection on start.
- **Usage**: components call `t("section.key")`. Dynamic keys such as ``t(`languages.${code}`)`` must resolve to an existing section of the bundle.
- **Plurals**: keys that vary with a count use the i18next `_one` / `_other` suffixes (e.g. `history.messageCount_one`) and are called with `t("history.messageCount", { count })`.
- **Errors**: services return `errors.*` keys via [`src/services/ErrorService.ts`](src/services/ErrorService.ts) and the UI translates them at render time, so raw provider or Office.js messages are never shown as-is.
- **Prompt templates**: [`src/taskpane/PromptTemplates.ts`](src/taskpane/PromptTemplates.ts) defines every field with all five languages — TypeScript rejects a template that misses one — and `templateText(value, language)` selects the right text (handles region tags like `pt-BR`, falls back to English).
- **Adding a language**: create the locale file, register it in `resources` and `SUPPORTED_LANGUAGES` in `src/i18n/index.ts`, add its code to `LANGUAGE_OPTIONS` in `src/taskpane/SettingsView.tsx` and to `TARGET_LANGUAGES` in `src/taskpane/components/QuickActions.tsx`, and add its name under `languages.*` in every bundle.
- **Guardrails**: [`tests/i18n.test.ts`](tests/i18n.test.ts) runs in CI and enforces exact key parity with non-empty values per locale, that every `t()` key used in `src/` exists in the bundles, that values identical to English stay on an explicit allowlist, and that every prompt template field is filled in all five languages.

## Troubleshooting

| Problem                                      | Cause / Fix                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add-in won't load / blank taskpane           | Office requires HTTPS. Run `npm start` to install dev certificates, and trust the certificate in your OS keychain on first run.                                  |
| `npm run validate` reports manifest errors   | The validator checks the full schema, including `VersionOverrides`. Fix `manifest.xml`; `npx office-addin-manifest info manifest.xml` shows the parsed manifest. |
| OpenAI / Claude requests fail in the browser | CORS. Use the proxy option with a BFF endpoint (see Configuration) or a CORS-enabled endpoint.                                                                   |
| Ollama: "Cannot reach Ollama"                | Make sure Ollama is running (`ollama serve`). If requests are blocked, set `OLLAMA_ORIGINS` to allow the taskpane origin.                                        |
| Ollama in Office on the web                  | Not supported — browsers block `http://localhost` from an HTTPS page. Use Office Desktop.                                                                        |
| Provider returns 429                         | Rate limit. JSON requests retry automatically (3 attempts, exponential backoff); streaming is not automatically retried. Wait before trying again.                |
| Request times out                            | Increase the timeout in **Settings** for that provider.                                                                                                          |
| Bundle/source maps                           | Production builds omit source maps by default; build with `SOURCEMAP=true npm run build` to emit them.                                                           |

## Architecture notes

- **Ribbon**: the manifest declares a shared runtime (`Runtimes`), so the ribbon buttons and the taskpane run in the same JavaScript context. `src/commands/ribbon.ts` forwards the command through a custom event and opens the panel.
- **Providers** implement a common contract (`BaseProvider`): `chat`, `chatStream`, `getModels`, `summarize`, `translate`, `analyse`. New providers only need a new class + one line in `ProviderFactory`.
- **Request shaping**: `config/modelParams.ts` adapts the request body to each model family (temperature support, output-token field and limit), so reasoning models and strict families do not fail with 400 errors.
- **Reasoning** is abstract: the selected level is translated into a system-prompt strategy per provider (`config/reasoningProfiles.ts`).
- **Retry**: JSON HTTP requests retry automatically on 429/5xx with exponential backoff (3 attempts). Streams are not retried automatically.
- **Logging**: structured in-memory log ring buffer (`services/LoggerService.ts`).

## License

Private.
