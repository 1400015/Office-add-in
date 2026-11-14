# Registo de validação

**Estado mais recente (14 de novembro de 2026, snapshot `1006069`):** as verificações estáticas e os testes foram reexecutados neste snapshot — `typecheck`, `lint`, `format:check`, **291/291 testes em 31 ficheiros**, `build`, validação do manifesto (aceite pelo serviço Microsoft), `npm audit` (0 vulnerabilidades) e o bundle dry-run do Worker passam todos; o CI do GitHub Actions está verde (run `43048875060`, success, no commit `1006069`). As correções C1–C6 e R1–R7 continuam integradas. **Pendente:** os ensaios reais em Microsoft Office Desktop/Web e com fornecedores reais. O plano executável desses ensaios está em **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)**.

---

## Estado atual consolidado (snapshot `1006069`, branch `main`)

| Verificação | Resultado | Contexto |
| --- | --- | --- |
| `npm run typecheck` | ✅ Aprovado | `tsc --noEmit`, 0 erros |
| `npm run lint` | ✅ Aprovado | ESLint, 0 erros, 0 warnings |
| `npm run format:check` | ✅ Aprovado | Prettier, todos os ficheiros |
| `npm test` | ✅ **291/291 testes, 31/31 ficheiros** | Reexecutado neste snapshot (14 nov 2026) |
| `npm run build` | ✅ Aprovado | Vite build, code-split (chunks react, Fluent UI, markdown e views) |
| `npm run validate` | ✅ Aprovado | Serviço Microsoft: "Manifest accepted" (14 nov 2026) |
| `npm audit --omit=dev` | ✅ Aprovado | 0 vulnerabilidades (registo oficial via proxy) |
| CI GitHub Actions (run `43048875060`) | ✅ **success** | `main`, commit `1006069`: typecheck → lint → format → test → build → check:manifest-paths → validate → manifest info → wrangler dry-run |
| Wrangler dry-run | ✅ Aprovado | `npx wrangler@4 deploy --dry-run --outdir dist-proxy`; upload 4,32 KiB / gzip 1,59 KiB, sem deploy real |

> Nota: este snapshot do repositório é um único commit (`1006069`) — a história de commits referida nas secções seguintes (`0d6280a`, `5b16013`, …) pertence ao registo anterior e mantém-se apenas como contexto.

### Correção dos testes (histórico, commit `0d6280a`)

Os 21 testes que falhavam no PR #5 foram corrigidos atualizando apenas os mocks/fixtures para os contratos revistos do código de produção (nenhuma alteração em `src/`):

- `powerpointActions.test.ts`: `FakeShape`/`FakeSlide` com `load()`; coleção `slides.items`; `add()` sem placeholder artificial.
- `officeService.test.ts`: mocks PowerPoint com `id`/`type`/`load`; teste de inserção usa range null-object.
- `chatStream.test.ts`: stream Gemini com `finishReason: "STOP"`.
- `useChat.test.tsx` / `operationConcurrency.test.tsx`: store com `officeReady: true` e `modelCatalog` ready.
- `providerSelectors.test.tsx`: `useModelCatalog` montado junto ao componente; modelos com `chatCompatibility: "supported"`.

---

## Pendente: ensaios reais (ver TESTING_CHECKLIST.md)

Os cenários abaixo **ainda não foram executados** por falta de ambiente Office e credenciais reais. O plano executável com checkboxes, campos de resultado e registo de versões está em **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)**.

### Matriz Office (9 combinações)

| Host | Windows Desktop | macOS Desktop | Office na Web |
| --- | --- | --- | --- |
| Word | Pendente | Pendente | Pendente |
| Excel | Pendente | Pendente | Pendente |
| PowerPoint | Pendente | Pendente | Pendente |

Em cada combinação disponível, usar um documento de teste e seguir `INSTALL.md` para iniciar o servidor HTTPS e carregar o manifesto. Confirmar carregamento, friso, chat e ações específicas. Registar a versão do Office, o sistema e o resultado de cada caso.

### Fornecedores reais

| Fornecedor | Resultado real | Condições |
| --- | --- | --- |
| Mistral | Pendente | Chave e endpoint de teste |
| OpenAI | Pendente | Chave e proxy HTTPS configurado |
| Claude | Pendente | Chave e proxy HTTPS configurado |
| Gemini | Pendente | Chave e endpoint de teste |
| OpenRouter | Pendente | Chave e endpoint de teste |
| Ollama | Pendente | Office Desktop, servidor local e modelo instalado |

Os pedidos reais de geração podem consumir quota. O botão de teste de ligação usa pedidos sem geração. Confirmar igualmente que chaves não aparecem em URLs, logs ou mensagens de erro, e que os headers chegam ao fornecedor através do proxy.

---

## Histórico de revisões anteriores

<details>
<summary><b>Histórico completo (31 out – 2 nov 2026)</b> — clique para expandir</summary>

### 31 de outubro de 2026 — base `5b16013d7d10a74ebbeb803db83f03afe03862fe`

Verificações automáticas dessa base: instalação limpa, TypeScript, ESLint, formatação, 277 testes, build, manifesto aceite, bundle Worker dry-run, auditoria de dependências — todas aprovadas nesse estado.

### 2 de novembro de 2026 — R1–R7 e C1–C6 sobre `af5a14e3e0b6d06c2bfdfe4509a20cc3810f6f8e`

- **R1 — Respostas incompletas:** os seis fornecedores verificam motivos de conclusão. Respostas declaradas truncadas/bloqueadas lançam erro com o texto parcial antes de chegar à escrita Office. O streaming exige o marcador terminal próprio. Parciais são conservadas uma única vez no chat/histórico com `incomplete` e aviso traduzido.
- **R2 — Cofre:** o desbloqueio regrava as configurações carregadas em `enc:v2` pela fila de definições, com guardas de revisão, antes de concluir a migração do histórico e libertar as operações.
- **R3 — PowerPoint:** extrator partilhado lê IDs/tipos e consulta texto apenas em candidatos compatíveis, isolando placeholders sem texto.
- **R4 — Inserção/templates:** reserva a operação e propaga as guardas até ao Office. Uma rejeição não altera o prompt nem assinala envio.
- **R5 — Modelos:** classificação usa capacidades declaradas, consulta `/api/show` em Ollama com concorrência limitada e reconhece famílias/modalidades conhecidas.
- **R6 — Histórico:** a interface remove registos apenas após confirmação da eliminação. Versões das mutações impedem leituras antigas.
- **R7 — JSON PowerPoint:** arrays com contagens/tipos errados, objetos e JSON malformado são rejeitados.
- **C1 — slideTargets:** identifica cada slide novo pela diferença de IDs, no mesmo batch; exige um ID novo e todos os anteriores presentes.
- **C2 — filas de persistência:** funções de gravação iniciadas através de promises e aguardadas com `allSettled`.
- **C3 — Mistral:** novo `providers/mistralText.ts` normaliza strings e blocos textuais; blocos thinking ignorados.
- **C4 — catálogo partilhado:** `useModelCatalog` sempre montado no `Taskpane`; prontidão, revisões, geração/ID de consulta e preferências controlados no store.
- **C5 — sessão do cofre no histórico:** `saveConversation()` captura época/revisão do cofre e revisão da conversa; valida dentro da fila antes de gravar.
- **C6 — inserción PowerPoint por ID:** captura slide/intervalo inicialmente no mesmo `run`; revalida por ID.

Nessa altura, as verificações estáticas (typecheck, lint, format) passaram, mas os testes unitários foram adiados e acabaram por falhar no CI do PR #5 por mocks desatualizados — corrigidos posteriormente no commit `0d6280a` (ver secção "Estado atual consolidado" acima).

</details>

### Limites conhecidos

- Endpoints antigos que omitam motivo de conclusão em respostas sem streaming continuam legíveis; sem esse metadado não é possível detetar todas as truncagens. No streaming, o marcador de conclusão é obrigatório.
- A classificação de um modelo como compatível não verifica saldo, permissões de inferência ou todos os parâmetros do endpoint.
- Texto dentro de grupos, tabelas e gráficos PowerPoint não é percorrido.
- Uma escrita Office já enviada ao host não pode ser revogada atomicamente por um cancelamento posterior.
- A criação PowerPoint depende de identificação por diferença de IDs; a API não oferece atomicidade da criação perante alterações de coautores.
