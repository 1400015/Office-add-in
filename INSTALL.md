# Guia de Instalação — Office Universal AI

Este guia explica, passo a passo, como instalar o add-in **AI Assistant** no Microsoft Word, Excel e PowerPoint, cobrindo todas as plataformas: **Windows**, **Mac**, **Web** e instalação numa **organização**.

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Instalação em desenvolvimento (Sideload)](#2-instalação-em-desenvolvimento-sideload)
   - [2.1 Windows — Office Desktop](#21-windows--office-desktop)
   - [2.2 Mac — Office Desktop](#22-mac--office-desktop)
   - [2.3 Office na Web (Office 365 online)](#23-office-na-web-office-365-online)
3. [Instalação de produção (build + hosting HTTPS)](#3-instalação-de-produção-build--hosting-https)
4. [Instalação numa organização (catálogo central)](#4-instalação-numa-organização-catálogo-central)
5. [Verificação da instalação](#5-verificação-da-instalação)
6. [Configuração inicial do add-in](#6-configuração-inicial-do-add-in)
7. [Desinstalação](#7-desinstalação)
8. [Resolução de problemas (FAQ)](#8-resolução-de-problemas-faq)

---

## 1. Pré-requisitos

| Componente | Requisito |
|---|---|
| **Node.js** | versão >= 18 ([nodejs.org](https://nodejs.org)) |
| **Microsoft 365** | qualquer versão com suporte a add-ins (Word, Excel ou PowerPoint) |
| **Sistema operativo** | Windows 10/11, macOS 10.15+, ou browser moderno (para Web) |
| **Ligação à internet** | necessária para usar os fornecedores de IA online |
| **API Key** | pelo menos um fornecedor de IA configurado (ver [secção 6](#6-configuração-inicial-do-add-in)) |

> **Nota**: Para desenvolvimento local, o add-in obriga a **HTTPS** (requisito do Office). O projeto já trata disto automaticamente via certificados de desenvolvimento.

---

## 2. Instalação em desenvolvimento (Sideload)

O *sideload* permite carregar o add-in diretamente a partir do teu computador, sem publicação na loja.

### 2.1 Windows — Office Desktop

#### Passo 1 — Preparar o projeto

```powershell
# Abrir PowerShell na pasta do projeto
cd C:\caminho\para\Office-add-in

# Instalar dependências
npm install

# Gerar os ícones do add-in (apenas na primeira vez)
npm run icons
```

#### Passo 2 — Iniciar o servidor de desenvolvimento

```powershell
npm start
```

Isto vai:
1. Instalar certificados HTTPS de desenvolvimento (`office-addin-dev-certs`)
2. Verificar os certificados
3. Iniciar o servidor Vite em `https://localhost:3000`

> ⚠️ **Na primeira execução**, o Windows pode mostrar um aviso de segurança sobre o certificado. Aceita/instala o certificado na *Trusted Root Certification Authorities* do teu computador.

#### Passo 3 — Carregar o add-in no Office

1. Abre o **Word**, **Excel** ou **PowerPoint**
2. Vai ao separador **Inserir** (*Insert*) → **Obter Suplementos** (*Get Add-ins*) → **Os Meus Suplementos** (*My Add-ins*)
3. Seleciona o separador **Carregar o Meu Suplemento** (*Upload My Add-in*)
4. Escolhe o ficheiro **`manifest.xml`** da pasta do projeto
5. Clica em **Carregar** (*Upload*)

#### Passo 4 — Usar o add-in

- O grupo **AI Assistant** aparece no separador **Página Inicial** (*Home*)
- Clica em **Open Chat** para abrir o painel de chat
- Vai a **Settings** para configurar um fornecedor de IA

#### Alternativa — Ferramenta de debug oficial

```powershell
npm run sideload
```

Isto inicia automaticamente o Office Desktop com o add-in carregado.

---

### 2.2 Mac — Office Desktop

#### Passo 1 — Preparar o projeto

```bash
# Abrir Terminal na pasta do projeto
cd /caminho/para/Office-add-in

# Instalar dependências
npm install

# Gerar os ícones
npm run icons
```

#### Passo 2 — Iniciar o servidor

```bash
npm start
```

> ⚠️ **Na primeira execução**, o macOS pode pedir para confiar no certificado de desenvolvimento. Vai a **Preferências do Sistema → Privacidade e Segurança** e aceita o certificado, ou usa o Keychain Access para o marcar como sempre confiar.

#### Passo 3 — Carregar o add-in no Office

1. Abre o **Word**, **Excel** ou **PowerPoint** para Mac
2. Vai a **Inserir** → **Suplementos** (*Add-ins*) → **Os Meus Suplementos**
3. Clica em **Carregar suplemento personalizado** ou usa a seta ▼ ao lado de "Os Meus Suplementos" → **Carregar o Meu Suplemento**
4. Seleciona o ficheiro **`manifest.xml`**
5. Clica em **Carregar**

> **Nota para Mac**: Se a opção "Carregar o Meu Suplemento" não aparecer, verifica se tens uma subscrição Microsoft 365 ativa. O sideload requer:
> - Microsoft 365 para Mac (subscrição)
> - Ou Office 2019/2021 com versão >= 16.24

#### Passo 4 — Usar o add-in

- O grupo **AI Assistant** aparece no friso **Página Inicial**
- Clica em **Open Chat**

---

### 2.3 Office na Web (Office 365 online)

No Office Web, o add-in corre dentro de um iframe no browser. Como tal, não podes usar `https://localhost:3000` diretamente (o browser bloqueia certificados auto-assinados em iframes de terceiros).

#### Opção A — Desenvolvimento local com túnel (recomendado para testes)

Usa o `office-addin-debugging` que cria automaticamente a configuração necessária:

```bash
npm start                    # inicia https://localhost:3000
# Noutro terminal:
npx office-addin-debugging start manifest.xml web
```

Ou usa um túnel HTTPS (ex: Cloudflare Tunnel, ngrok):

```bash
# Exemplo com cloudflared
npm run build
npx serve dist --ssl-cert ~/.office-addin-dev-certs/localhost.crt --ssl-key ~/.office-addin-dev-certs/localhost.key --port 3000
cloudflared tunnel --url https://localhost:3000
```

Depois atualiza os URLs no `manifest.xml` para o URL do túnel.

#### Opção B — Produção (recomendado)

Faz build e aloja o `dist/` num servidor HTTPS (ver [secção 3](#3-instalação-de-produção-build--hosting-https)).

#### Passo — Carregar no Office Web

1. Abre [office.com](https://www.office.com) e inicia sessão
2. Abre o **Word**, **Excel** ou **PowerPoint** online
3. Vai a **Inserir** → **Suplementos** (*Add-ins*) → **Mais suplementos** (*More add-ins*)
4. Seleciona **Os Meus Suplementos** → **Carregar o Meu Suplemento**
5. Seleciona o `manifest.xml` atualizado (com os URLs do teu hosting)
6. Clica em **Carregar**

> ⚠️ **Limitação importante**: O fornecedor **Ollama** (local) **não funciona** no Office Web. O browser bloqueia ligações para `http://localhost` a partir de páginas HTTPS (mixed content). Usa o Office Desktop para Ollama, ou um endpoint Ollama remoto.

---

## 3. Instalação de produção (build + hosting HTTPS)

Para usar o add-in de forma permanente (ou partilhar com colegas), faz o build e aloja numa URL HTTPS.

### Passo 1 — Build de produção

```bash
npm install
npm run build
```

Isto gera a pasta `dist/` com os ficheiros otimizados.

### Passo 2 — Atualizar o manifest

Edita o `manifest.xml` e substitui **todos** os `https://localhost:3000` pelo teu URL de produção:

```xml
<!-- Antes -->
<IconUrl DefaultValue="https://localhost:3000/icons/icon-32.png"/>
<SourceLocation DefaultValue="https://localhost:3000/"/>

<!-- Depois (exemplo) -->
<IconUrl DefaultValue="https://meu-servidor.com/ai-addin/icons/icon-32.png"/>
<SourceLocation DefaultValue="https://meu-servidor.com/ai-addin/"/>
```

Elementos a atualizar:
- `IconUrl` e `HighResolutionIconUrl`
- `SupportUrl`
- `AppDomains` → `<AppDomain>https://meu-servidor.com</AppDomain>`
- `DefaultSettings` → `SourceLocation`
- Todos os `bt:Image` e `bt:Url` no `VersionOverrides`

> 💡 Dica: podes usar `sed` para substituir em massa:
> ```bash
> sed -i 's|https://localhost:3000|https://meu-servidor.com/ai-addin|g' manifest.xml
> ```

### Passo 3 — Alojar os ficheiros

Copia o conteúdo de `dist/` **e** o `manifest.xml` atualizado para um servidor HTTPS. Opções:

| Opção | Como |
|---|---|
| **Azure Static Web Apps** | `az webapp up` ou GitHub Actions |
| **Cloudflare Pages** | Arrastar a pasta `dist/` no dashboard |
| **Vercel / Netlify** | `vercel deploy` / `netlify deploy` |
| **Servidor próprio (nginx/Apache)** | Copiar para `/var/www/ai-addin/` |
| **SharePoint** | Carregar numa biblioteca de documentos com CDN ativado |

#### Exemplo — nginx

```nginx
server {
    listen 443 ssl;
    server_name meu-servidor.com;

    ssl_certificate /caminho/para/cert.pem;
    ssl_certificate_key /caminho/para/key.pem;

    root /var/www/ai-addin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Importante: CORS para o taskpane
    location /icons/ {
        add_header Access-Control-Allow-Origin *;
    }
}
```

> ⚠️ O servidor **tem de suportar HTTPS** — o Office obriga a isto.

### Passo 4 — Verificar o alojamento

Acede a `https://meu-servidor.com/ai-addin/` no browser. Deves ver a interface do add-in (fora do Office, em modo de desenvolvimento).

### Passo 5 — Carregar o add-in

Mesmo processo da [secção 2](#2-instalação-em-desenvolvimento-sideload), mas agora selecionas o `manifest.xml` **atualizado** com os URLs de produção.

---

## 4. Instalação numa organização (catálogo central)

Se és administrador de TI, podes disponibilizar o add-in a toda a organização através do **Centro de administração do Microsoft 365**.

### Passo 1 — Preparar o pacote de instalação

1. Faz build de produção (ver [secção 3](#3-instalação-de-produção-build--hosting-https))
2. Atualiza o `manifest.xml` com o URL de produção
3. Aloja os ficheiros num servidor HTTPS acessível pela organização

### Passo 2 — Adicionar ao catálogo central

1. Acede ao [Centro de administração do Microsoft 365](https://admin.microsoft.com)
2. Vai a **Definições** (*Settings*) → **Aplicações integradas** (*Integrated apps*) → **Suplementos** (*Add-ins*)
3. Clica em **Implementar Suplemento** (*Deploy Add-in*)
4. Escolhe **Carregar ficheiro personalizado** (*Upload custom add-in*) ou **Fornecer ligação para ficheiro de manifesto** (*Provide link to manifest file*)
5. Se escolheres URL: indica `https://meu-servidor.com/ai-addin/manifest.xml`
6. Configura a atribuição:
    - **Atribuído**: todos os utilizadores / grupos específicos
    - **Fixo** (o add-in aparece automaticamente) ou **Opcional** (o utilizador escolhe instalar)
7. Clica em **Implementar**

### Passo 3 — Aguardar propagação

A propagação pode demorar de **alguns minutos a 24 horas**. Os utilizadores verão o add-in no friso **Página Inicial** do Word/Excel/PowerPoint.

### Passo 4 — Gerir o add-in

No mesmo painel de administração podes:
- Atualizar o add-in (apontar para novo manifest.xml)
- Remover o add-in da organização
- Ver relatórios de utilizzo

---

## 5. Verificação da instalação

Depois de carregar o add-in, verifica se está tudo a funcionar:

| # | Verificação | Resultado esperado |
|---|---|---|
| 1 | O grupo **AI Assistant** aparece no friso **Página Inicial** | ✅ Grupo visível com 5 botões |
| 2 | Clicar em **Open Chat** abre o painel lateral | ✅ Taskpane carrega sem erros |
| 3 | O seletor de fornecedor mostra os 6 proveedores | ✅ Mistral, OpenAI, Claude, Gemini, OpenRouter, Ollama |
| 4 | Ir a **Settings** e guardar uma API key | ✅ "Settings saved" aparece |
| 5 | Clicar em **Test connection** | ✅ "OK (N models)" ou mensagem de erro clara |
| 6 | Enviar uma mensagem no chat | ✅ Resposta da IA aparece (com streaming) |
| 7 | Usar uma ação rápida (ex: **Summarize** no Word) | ✅ Resultado aparece no chat |

### Verificar a consola de erros (se algo falhar)

- **Windows**: `F12` no taskpane → separador **Console**
- **Mac**: `Cmd + Option + I` → **Console**
- **Web**: `F12` → **Console**

Procura erros em vermelho. Os erros mais comuns estão na [FAQ](#8-resolução-de-problemas-faq).

---

## 6. Configuração inicial do add-in

Após a instalação, configura pelo menos um fornecedor de IA:

### Passo 1 — Abrir Settings

Clica no separador **Settings** (⚙️) dentro do add-in.

### Passo 2 — Configurar um fornecedor

Para cada fornecedor, preenche:

| Campo | Descrição | Exemplo |
|---|---|---|
| **API Key** | A tua chave de API do fornecedor | `sk-...` (OpenAI), `sk-ant-...` (Claude) |
| **Endpoint** | URL base da API (pré-preenchido) | `https://api.openai.com/v1` |
| **Timeout** | Tempo máximo de espera (ms) | `120000` |
| **Use proxy** | Ativar se a API não suporta CORS | ✅ para OpenAI/Claude |
| **Proxy URL** | URL do teu BFF/proxy | `https://meu-proxy.workers.dev` |

### Passo 3 — Testar a ligação

Clica em **Test connection** para verificar se o fornecedor responde.

### Passo 4 — Configurações gerais

Na secção **General**:
- **Temperature**: 0.0 (preciso) a 2.0 (criativo). Default: 0.2
- **Max tokens**: máximo de tokens na resposta. Default: 8192
- **System prompt**: instrução de comportamento (ex: "Responde como médico especialista")
- **Theme**: Light / Dark / Automatic (segue o Office)
- **Language**: EN / PT / ES / FR / DE

### Fornecedores recomendados por cenário

| Cenário | Fornecedor recomendado | Motivo |
|---|---|---|
| Melhor custo/benefício | **Mistral** | API europeia, bom preço, CORS nativo |
| Melhor qualidade geral | **Claude** (via proxy) | Excelente em análise e código |
| Mais barato | **OpenRouter** | Acesso a dezenas de modelos com uma key |
| Privacidade total | **Ollama** (Desktop apenas) | Dados nunca saem do teu PC |
| Prototipagem rápida | **Gemini** (free tier) | Bom free tier, CORS nativo |

> ⚠️ **Nota de segurança**: Sem frase-passe, as API keys ficam só ofuscadas. Nas Definições podes definir uma frase-passe: as chaves e o histórico passam a ser cifrados e a frase não é guardada. Depois de recarregar o painel tens de a introduzir outra vez.

### Configurar um proxy (BFF) para OpenAI/Claude

A API da OpenAI e da Anthropic não envia CORS. O suplemento já sabe falar com o worker deste repositório.

```bash
npx wrangler deploy
```

O código está em [`proxy/worker.ts`](proxy/worker.ts). Aceita só destinos da lista (`api.openai.com`, `api.anthropic.com`, Azure OpenAI, Mistral, Gemini, OpenRouter). A chave vai no cabeçalho `Authorization`, não no URL.

Antes de publicar, limita as origens que podem chamar o proxy. Em produção
(`ENVIRONMENT=production`) o worker recusa-se a servir pedidos sem essa
configuração — devolve HTTP 500 em todas as rotas até `ALLOWED_ORIGINS` estar
definido (fail-fast). Pedidos sem header `Origin` (clientes não-browser, como
curl) também são recusados em produção.

```bash
npx wrangler deploy --var ENVIRONMENT:production --var ALLOWED_ORIGINS:"https://meu-servidor.com"
```

Só essa origem pode chamar o Worker a partir do browser. Sem `ENVIRONMENT=production`
(desenvolvimento), apenas `https://localhost:3000` é aceite como origem e pedidos
sem `Origin` continuam a ser aceites para testes locais com curl.

Nas Definições, ativa **Usar proxy** e cola a origem do Worker (por exemplo `https://ouai-proxy.workers.dev`) em **URL do proxy**.

#### Opção antiga — não uses a chave no URL

Um worker que lê `?key=` expõe a chave em logs. Não uses esse padrão.

---

## 7. Desinstalação

### Remover para um utilizador (sideload)

1. No Office: **Inserir** → **Suplementos** → **Os Meus Suplementos**
2. Seleciona o **AI Assistant**
3. Clica em **Remover** (🗑️)

### Remover certificados de desenvolvimento (após terminar o dev)

```bash
npm run stop
```

### Remover de uma organização (admin)

1. [Centro de administração do Microsoft 365](https://admin.microsoft.com)
2. **Definições** → **Aplicações integradas** → **Suplementos**
3. Seleciona o **AI Assistant** → **Remover implementação**

### Limpar dados locais

O add-in guarda dados no `OfficeRuntime.storage` e IndexedDB:

1. Dentro do add-in: **History** → **Clear all**
2. **Settings** → remover as API keys manualmente
3. Para limpar tudo: fecha o Office e limpa os dados do WebView2/IE cache (Windows) ou do browser (Web)

---

## 8. Resolução de problemas (FAQ)

### ❌ "O add-in não aparece no friso"

| Causa | Solução |
|---|---|
| O servidor `https://localhost:3000` não está a correr | Corre `npm start` |
| Certificado HTTPS não é de confiança | Corre `npm start` (instala certificados) e aceita no browser/OS |
| O manifest.xml tem URLs errados | Verifica se todos os URLs apontam para `https://localhost:3000` |
| Office versão antiga | Atualiza o Microsoft 365 |

### ❌ "O taskpane aparece em branco"

1. Abre a consola (`F12`) e procura erros
2. Verifica se `https://localhost:3000` está acessível no browser
3. Verifica se o certificado HTTPS é aceite
4. Tenta recarregar o taskpane (botão refresh no canto do painel)

### ❌ "Erro de CORS ao chamar a API"

- **OpenAI / Claude**: ativa **Use proxy** nas Settings, ou usa um endpoint com CORS
- **Outros fornecedores**: verifica se o endpoint está correto

### ❌ "Ollama não funciona no Office Web"

É esperado. O browser bloqueia `http://localhost` de páginas HTTPS. Soluções:
- Usa o **Office Desktop** (Windows/Mac)
- Expõe o Ollama num servidor remoto com HTTPS
- Configura `OLLAMA_ORIGINS` no Ollama para aceitar o teu domínio

### ❌ "API key inválida / erro 401"

1. Verifica se a key está correta (copia novamente do dashboard do fornecedor)
2. Verifica se a key tem créditos/quota disponível
3. Para OpenAI/Claude: verifica se o proxy está a injetar a key corretamente

### ❌ "Erro 429 (rate limit)"

O add-in tenta automaticamente 3 vezes com backoff exponencial. Se persistir:
- Aguarda alguns minutos
- Verifica os limites da tua conta no fornecedor
- Muda para outro modelo/fornecedor

### ❌ "O add-in está lento"

- O modelo selecionado pode ser muito grande — tenta um modelo mais leve (ex: `mistral-small`)
- Aumenta o **Timeout** nas Settings se as respostas forem longas
- Para Ollama: verifica se o modelo está carregado na memória

### ❌ "O histórico desapareceu"

O histórico é guardado em IndexedDB local. Se limpou os dados do browser/Office, o histórico é perdido. No Desktop, fecha completamente o Office (não apenas o documento) para garantir que os dados são escritos.

### ❌ "O tema escuro não ativa automaticamente"

O modo "Automatic" segue o tema do Office. Se o Office estiver em modo escuro mas o add-in não, verifica se estás no modo **Automatic** nas Settings (não **Light**).

### ❌ "Não consigo carregar o manifest.xml"

Verifica:
1. O caminho do ficheiro está correto
2. O ficheiro `manifest.xml` é XML válido: `python3 -c "import xml.dom.minidom; xml.dom.minidom.parse('manifest.xml')"`
3. Todos os URLs no manifest usam **HTTPS** (não HTTP)
4. Os ícones existem em `public/icons/` (corre `npm run icons`)

---

## Resumo rápido

| Plataforma | Comando | Onde carregar |
|---|---|---|
| Windows Desktop | `npm start` | Insert → Get Add-ins → Upload My Add-in → `manifest.xml` |
| Mac Desktop | `npm start` | Inserir → Suplementos → Carregar o Meu Suplemento → `manifest.xml` |
| Office Web (dev) | `npm start` + túnel HTTPS | Inserir → Suplementos → Carregar → `manifest.xml` atualizado |
| Produção | `npm run build` + hosting HTTPS | `manifest.xml` com URLs de produção |
| Organização | Hosting HTTPS + Admin Center | admin.microsoft.com → Integrated apps → Deploy |

---

## Precisas de ajuda?

- Consulta o [README.md](README.md) para detalhes técnicos
- Verifica os [logs estruturados](README.md#architecture-notes) na consola do browser
- Abre uma issue no repositório com a mensagem de erro completa
