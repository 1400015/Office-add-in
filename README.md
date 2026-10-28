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
- **i18n**: English and Portuguese (extensible)

## Project structure

```text
OfficeUniversalAI/
├── manifest.xml              # Universal manifest (Word, Excel, PowerPoint)
├── index.html                # Taskpane entry
├── commands.html             # Ribbon command handlers
├── src/
│   ├── taskpane/             # React UI (Chat, Settings, History, Templates)
│   ├── providers/            # BaseProvider + 6 providers + factory
│   ├── services/             # Storage, History (IndexedDB), Model, Office, Http, Logger
│   ├── store/                # Zustand store
│   ├── hooks/                # useOfficeInit, useChat
│   ├── word/ excel/ powerpoint/  # Host-specific actions
│   ├── config/               # Provider definitions, reasoning profiles
│   ├── i18n/                 # Translations (en, pt)
│   └── types/                # Shared TypeScript types
├── assets/                   # Icons (16–128 px)
└── tests/                    # Vitest unit tests
```

## Documentation

- **[INSTALL.md](INSTALL.md)** — detailed installation guide (Windows, Mac, Web, production hosting, organization deployment)
- **[README.md](README.md)** — this file (architecture, configuration, development)

## Getting started

### Prerequisites

- Node.js >= 18
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
npm run validate    # validate manifest.xml against Microsoft's gateway
npm run lint        # ESLint (strict, zero warnings allowed)
npm run format      # Prettier
npm test            # Vitest unit tests
npm run stop        # remove dev certificates
```

> **Note on `npm run validate`**: the remote validation gateway may report false
> errors for manifests containing `VersionOverrides` (a known gateway limitation).
> The manifest uses the standard Microsoft format (`ov:` prefix with
> `taskpaneappversionoverrides/1.0` namespace) and is fully valid for sideloading.
> Local XML well-formedness is always verified; `office-addin-manifest info`
> can be used to confirm the manifest parses correctly.

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
- Providers whose APIs do not allow direct browser calls (**OpenAI**, **Claude**) require the **proxy** in [`proxy/worker.ts`](proxy/worker.ts). Deploy it with `npx wrangler deploy` and paste the worker origin into **Proxy URL**. The add-in sends `X-OUAI-Upstream`; the worker only forwards to allowlisted provider hosts and adds CORS. The API key stays in the `Authorization` header, never in the URL.
- **Ollama** only works in **Office Desktop** (the browser blocks `http://localhost` from the Office web taskpane).

> ⚠️ **Security note**: Without a passphrase, API keys are only obfuscated in `OfficeRuntime.storage`. Set a passphrase in Settings to encrypt keys and chat history with a key that stays in memory for the session (it is not stored). Secrets are masked in the UI and redacted from logs.

## Troubleshooting

| Problem | Cause / Fix |
|---|---|
| Add-in won't load / blank taskpane | Office requires HTTPS. Run `npm start` to install dev certificates, and trust the certificate in your OS keychain on first run. |
| `npm run validate` reports manifest errors | Known gateway limitation with `VersionOverrides`. Verify locally: `npx office-addin-manifest info manifest.xml`. |
| OpenAI / Claude requests fail in the browser | CORS. Use the proxy option with a BFF endpoint (see Configuration) or a CORS-enabled endpoint. |
| Ollama: "Cannot reach Ollama" | Make sure Ollama is running (`ollama serve`). If requests are blocked, set `OLLAMA_ORIGINS` to allow the taskpane origin. |
| Ollama in Office on the web | Not supported — browsers block `http://localhost` from an HTTPS page. Use Office Desktop. |
| Provider returns 429 | Rate limit. The add-in retries automatically (3 attempts, exponential backoff); wait a moment if it still fails. |
| Request times out | Increase the timeout in **Settings** for that provider. |
| Bundle/source maps | Production builds omit source maps by default; build with `SOURCEMAP=true npm run build` to emit them. |

## Architecture notes

- **Providers** implement a common contract (`BaseProvider`): `chat`, `chatStream`, `getModels`, `summarize`, `translate`, `analyse`. New providers only need a new class + one line in `ProviderFactory`.
- **Reasoning** is abstract: the selected level is translated into a system-prompt strategy per provider (`config/reasoningProfiles.ts`).
- **Retry**: HTTP requests retry automatically on 429/5xx with exponential backoff (3 attempts).
- **Logging**: structured in-memory log ring buffer (`services/LoggerService.ts`).

## License

Private.
