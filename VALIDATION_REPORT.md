# Registo de validação

**Estado mais recente:** C1–C6 implementadas em 2 de novembro de 2026; consultar a secção final. As verificações estáticas locais passaram. Os testes locais continuam adiados pelo utilizador; o CI do PR, iniciado automaticamente pelo push solicitado, executou `npm test` e falhou em testes com mocks/fixtures desatualizados. Os ensaios Office/fornecedores reais permanecem pendentes.

Data: 31 de outubro de 2026. Base: `5b16013d7d10a74ebbeb803db83f03afe03862fe`. As alterações estão no workspace local.

**Revisão posterior:** após as verificações registadas abaixo, foram alterados o arranque do Office, a leitura de credenciais, o envio do chat e os cabeçalhos CORS do proxy. A pedido do utilizador, essas alterações ainda não foram testadas. Os resultados abaixo pertencem ao estado anterior a esta revisão.

**Revisão complementar de 2 de novembro de 2026:** as recomendações R1–R7 foram implementadas sobre o merge `af5a14e3e0b6d06c2bfdfe4509a20cc3810f6f8e`. Apenas as verificações estáticas identificadas na secção final foram executadas nesta revisão. Os 277 testes e os resultados de build/serviços externos abaixo são históricos e não aprovam o código atual.

Nesta revisão foram preparados os seguintes ajustes para validação posterior:

- Aguardar `Office.onReady` antes de identificar o programa anfitrião e apresentar uma opção de recarregar se as definições não puderem ser lidas.
- Propagar erros de leitura, decifra e interpretação das configurações protegidas para evitar substituí-las por valores vazios.
- Manter o texto introduzido se o envio não for aceite, e manter o chat ocupado enquanto a resposta termina de ser guardada.
- Não assinalar um template como enviado se o pedido não tiver sido aceite.
- Tratar falhas ao guardar uma resposta cujo alvo Office sofreu um conflito e impedir erros tardios de aparecer noutra conversa.
- Permitir explicitamente `Authorization` e os cabeçalhos dos fornecedores no preflight CORS do proxy.

## Verificações automáticas

| Verificação | Resultado | Contexto |
| --- | --- | --- |
| Instalação limpa | Aprovado | `npm ci --no-audit --no-fund`, com o lockfile atualizado |
| TypeScript | Aprovado | `npm run typecheck` |
| ESLint | Aprovado | `npm run lint`, incluindo após gerar o bundle do proxy |
| Formatação | Aprovado | `npm run format:check` |
| Testes automatizados | Aprovado | `npm test`: 277 testes, 29 ficheiros |
| Build de produção | Aprovado | `npm run build`; Node 24.19.0 |
| Manifesto | Aprovado | `npm run validate`: serviço Microsoft respondeu `Accepted` |
| Informação do manifesto | Aprovado | `npx office-addin-manifest info manifest.xml` |
| Bundle do Worker | Aprovado | `npx --yes wrangler@4 deploy --dry-run --outdir dist-proxy`; sem deploy |
| Dependências de produção | Aprovado | `npm audit --omit=dev`: zero vulnerabilidades reportadas |
| Espaços e conflitos no diff | Aprovado | `git diff --check` |

Os testes automatizados usam mocks para Office, respostas dos fornecedores, armazenamento e condições de concorrência. Incluem testes de protocolo SSE e NDJSON, cancelamento, conflitos nos documentos, proteção do cofre, preferências, friso e validador. O manifesto foi submetido ao serviço oficial através do proxy do ambiente. O dry-run de Wrangler informou a existência de múltiplos ambientes, mas terminou com código zero e sem publicação.

## Ensaios Office pendentes

Não existem aplicações Microsoft Office nem sessões dos fornecedores configuradas neste ambiente. Não foi feito sideload e nenhuma das combinações abaixo foi executada. A aprovação do manifesto e os mocks não verificam o comportamento real do Office.

| Host | Windows Desktop | macOS Desktop | Office na Web |
| --- | --- | --- | --- |
| Word | Pendente | Pendente | Pendente |
| Excel | Pendente | Pendente | Pendente |
| PowerPoint | Pendente | Pendente | Pendente |

Em cada combinação disponível, usar um documento de teste e seguir `INSTALL.md` para iniciar o servidor HTTPS e carregar o manifesto. Confirmar carregamento, friso, chat e ações específicas. Registar a versão do Office, o sistema e o resultado de cada caso:

- Word: alterar seleção durante o pedido; alterar/eliminar o alvo; tentar substituir seleção com 60 001 caracteres; gerar conteúdo e verificar o destino original.
- Excel: mudar célula/folha durante geração de fórmula; editar a célula ou permitir recálculo; analisar seleção de coluna/folha inteira e verificar o limite; testar inserção manual.
- PowerPoint: melhorar/traduzir/corrigir texto, editar/eliminar shape durante a resposta, criar slides e cancelar durante a criação.
- Em todos os hosts: executar comando do friso com painel aberto e fechado; trocar separador, parar e iniciar novo chat durante geração; confirmar ausência de duplicação.
- Cofre: ativar, bloquear, recarregar e desbloquear; bloquear durante uma ação; inspecionar em dados de teste se histórico protegido está cifrado; eliminar/limpar durante gravações pendentes.

## Fornecedores pendentes

Não foram usadas credenciais reais nem efetuadas chamadas reais aos fornecedores. Antes de considerar as integrações validadas, configurar endpoints/chaves de teste e confirmar probe, catálogo, resposta de ação e streaming para cada um:

| Fornecedor | Resultado real | Condições |
| --- | --- | --- |
| Mistral | Pendente | Chave e endpoint de teste |
| OpenAI | Pendente | Chave e proxy HTTPS configurado |
| Claude | Pendente | Chave e proxy HTTPS configurado |
| Gemini | Pendente | Chave e endpoint de teste |
| OpenRouter | Pendente | Chave e endpoint de teste |
| Ollama | Pendente | Office Desktop, servidor local e modelo instalado |

Os pedidos reais de geração podem consumir quota. O botão de teste de ligação usa pedidos sem geração. Confirmar igualmente que chaves não aparecem em URLs, logs ou mensagens de erro, e que os headers chegam ao fornecedor através do proxy.

## Estado de entrega

As verificações automáticas aprovadas cobrem o estado local analisado. A validação em Word, Excel, PowerPoint e nos fornecedores reais permanece pendente até existirem ambientes e credenciais de teste. Marcar cada combinação como aprovada ou falhada apenas depois de a executar, com versão e evidência correspondente.

## Revisão complementar — R1–R7

Data: 2 de novembro de 2026. Base Git: `af5a14e3e0b6d06c2bfdfe4509a20cc3810f6f8e`. Alterações locais, sem commit ou publicação nesta revisão.

### Implementação

| Recomendação | Alteração implementada |
| --- | --- |
| R1 — Respostas incompletas | Os seis fornecedores verificam motivos de conclusão. Respostas declaradas truncadas/bloqueadas lançam um erro com o texto parcial antes de este chegar à escrita Office. O streaming exige o marcador terminal próprio. Parciais recebidas são conservadas uma única vez no chat/histórico com `incomplete` e aviso traduzido; respostas vazias não criam mensagens artificiais. |
| R2 — Cofre | O desbloqueio regrava as configurações carregadas em `enc:v2` pela fila de definições, com guardas de revisão, antes de concluir a migração do histórico e libertar as operações. |
| R3 — PowerPoint | Um extrator partilhado lê IDs/tipos e consulta texto apenas em candidatos compatíveis, isolando placeholders sem texto. Ações, conflitos, resumo e contexto do chat usam o mesmo extrator. |
| R4 — Inserção/templates | Inserção manual reserva a operação e propaga as guardas até ao Office. Templates reservam a operação antes de alterar o prompt ou aguardar gravações; uma rejeição não altera o prompt nem assinala envio. |
| R5 — Modelos | A classificação usa capacidades declaradas, consulta `/api/show` em Ollama com concorrência limitada e reconhece famílias/modalidades conhecidas. Exclui incompatíveis; os desconhecidos exigem seleção explícita ou preferência guardada. O probe permanece independente desta classificação. |
| R6 — Histórico | A interface remove registos apenas após confirmação da eliminação. As versões das mutações impedem que leituras antigas recuperem listas anteriores. Erros são apresentados e ações duplicadas ficam bloqueadas durante a mutação. |
| R7 — JSON PowerPoint | Arrays com contagens/tipos errados, objetos e JSON malformado são rejeitados. O fallback para um único elemento só admite texto simples. |

Mensagens novas adicionadas nos cinco idiomas; README, INSTALL e IMPLEMENTATION_PLAN atualizados.

### Verificações executadas nesta revisão

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado após integração |
| `npm run lint` | Aprovado após corrigir um escape desnecessário na expressão do parser PowerPoint |
| `npm run format:check` | Aprovado |
| `git diff --check` | Aprovado |
| Revisão estática da integração | Concluída: propriedade/cancelamento das operações, retenção de parciais, contratos dos fornecedores, migração e publicação do histórico |
| Testes automatizados | **Não executados nem acrescentados, a pedido do utilizador** |
| Build, bundle Worker, manifesto remoto e auditoria de dependências | **Não executados nesta revisão**; não houve alterações ao manifesto, ao proxy ou às dependências |
| Office e fornecedores reais | **Pendentes por falta de ambiente/sessões/credenciais de teste** |

### Validação funcional adiada pelo utilizador

Ao retomar os testes, alinhar primeiro os mocks existentes com os contratos reais: streams Gemini precisam de `finishReason`; os shapes PowerPoint precisam de tipo e `Shape.load()`; modelos esperados como escolha automática precisam de `chatCompatibility: "supported"`. Estas adaptações dos testes ficaram adiadas juntamente com a sua execução; não foram introduzidas permissões ou fallbacks no código de produção para acomodar mocks incompletos.

Validar os seguintes cenários com respostas e promises controladas e, depois, com documentos/contas de teste:

- Resposta Word com `finish_reason: "length"`, Claude com `max_tokens`, Gemini com `MAX_TOKENS` e Ollama com `done_reason: "length"`: nenhuma substituição; texto parcial com aviso no chat. Bloqueio sem conteúdo não cria mensagem vazia.
- Stream com texto seguido de EOF sem terminal, falha de rede ou timeout: parcial conservada e identificada; Parar durante a gravação não a duplica; Novo chat/bloqueio não recupera a resposta antiga.
- Ativação da frase-passe interrompida antes da gravação das configurações: desbloquear conclui a proteção `enc:v2`; uma nova falha ou bloqueio mantém as operações impedidas.
- Slide com caixas de texto, imagem/logótipo, placeholder sem texto e elemento eliminado/editado durante a resposta: leitura seletiva e conflito sem sobrescrita indevida.
- Inserção manual repetida ou simultânea com ação de conteúdo; Parar/Novo chat/bloquear durante os awaits; dois templates enquanto as definições aguardam gravação.
- Catálogo misto com modelos de chat, embeddings, imagem/áudio e modelos desconhecidos; Ollama com `/api/show` disponível/indisponível; refresh atrasado após trocar credenciais. Probe pode passar sem modelos compatíveis.
- Falha de delete/clear no IndexedDB, remontagem da vista e operações de gravação/desbloqueio concorrentes: conservar os registos que não foram eliminados e nunca repor eliminações confirmadas por uma leitura atrasada.
- PowerPoint com um só texto original e respostas `[]`, `["a", "b"]`, objeto, array malformado, JSON com tipos errados e texto simples: apenas o formato válido ou o texto simples admissível chega à escrita.

### Limites conhecidos

Endpoints compatíveis antigos que omitam o motivo de conclusão nas respostas sem streaming continuam legíveis; sem esse metadado não é possível detetar todas as truncagens. No streaming, o marcador de conclusão é obrigatório. A classificação de um modelo como compatível não verifica saldo, permissões de inferência ou todos os parâmetros aceites pelo endpoint. Texto dentro de grupos, tabelas e gráficos PowerPoint não é percorrido, mantendo as APIs existentes. Como já indicado no plano, uma escrita Office enviada ao host não pode ser revogada atomicamente por um cancelamento posterior.

## Correções C1–C6 — 2 de novembro de 2026

Execução de `IMPLEMENTATION_PLAN_SOL.md` sobre a branch local `main`, base Git `af5a14e3e0b6d06c2bfdfe4509a20cc3810f6f8e`, incluindo as alterações R1–R7 e os ficheiros novos que já existiam sem commit. Essas alterações foram preservadas. Estado de entrega: alterações locais; sem commit, push, merge ou publicação nesta execução. Ambiente das verificações: Node `v24.19.0`.

### Implementação integrada

| ID | Resultado e ficheiros principais |
| --- | --- |
| C1 | `powerpoint/slideTargets.ts` identifica cada slide novo pela diferença de IDs, com adição e leitura no mesmo batch; exige um ID novo e todos os anteriores presentes. `powerpointActions.ts` escreve apenas por ID, conserva placeholders e preserva o plano completo com aviso de possível criação parcial em caso de falha após começar. Não há rollback destrutivo. |
| C2 | `useAppStore.ts`: funções de gravação são iniciadas através de promises e aguardadas com `allSettled`; a fila só avança depois de todas terminarem, propagando a falha. A persistência geral deixou de guardar o modelo transitório. |
| C3 | Novo `providers/mistralText.ts`: strings e blocos textuais são normalizados para string; blocos thinking/outros tipados são ignorados e conteúdo malformado é rejeitado. Respostas normais e deltas usam o normalizador antes de conclusão/emissão; SSE comum permanece em `BaseProvider.ts`. |
| C4 | `useAppStore.ts` controla prontidão, revisões por configuração, geração/ID de consulta e preferências. `useModelCatalog.ts` fica sempre montado no `Taskpane`, com cancelamento e debounce apenas para edição. `ModelService.ts` serializa preferências com guardas; a hidratação usa posteriormente essa barreira para ler o modelo. Fornecedor e definições usam a mesma fila. Chat, regeneração, templates e friso validam a prontidão centralmente em `useChat.ts`; a inserção existente dispensa catálogo. Seletores consomem estado partilhado e os erros são globais. |
| C5 | `saveConversation()` captura época/revisão do cofre e revisão da conversa; valida dentro da fila antes de gravar e antes/depois de listar. Trabalhos expirados não gravam snapshots novos nem publicam resultados/erros noutra sessão. Versão incrementada após gravação confirmada; delete/clear conservam os guardas e commits anteriores. |
| C6 | Inserção PowerPoint captura slide/intervalo inicialmente no mesmo `run`. Revalida slide/shape/intervalo/conteúdo por ID; ausência reconhecida de texto/API usa o ID inicial e apresentação vazia usa C1. Falhas de escrita não tentam uma segunda inserção. |

Mensagens novas nos cinco idiomas para atualização/falha do catálogo e criação possivelmente parcial, incluindo falha de gravação desse plano no histórico. README, INSTALL e ambos os planos atualizados.

### Verificações executadas

Última execução conjunta dos comandos: **2 de novembro de 2026, 10:20 UTC**, após a integração do código.

| Verificação | Resultado atual |
| --- | --- |
| `npm run typecheck` | **Aprovado**, código de saída 0. Durante a integração foram corrigidas três comparações incompatíveis com o tipo de compatibilidade do catálogo; execução final sem erros. Compila também os ficheiros de teste existentes sem os executar. |
| `npm run lint` | **Aprovado**, código de saída 0, zero avisos. |
| `npm run format:check` | **Aprovado**, código de saída 0. Formatação aplicada apenas aos ficheiros alterados nesta execução. |
| `git diff --check` | **Aprovado**, sem erros de whitespace. |
| Revisão estática de integração | Concluída: filas sem dependência circular, sessão do cofre, consultas antigas/StrictMode, preferências e entradas de geração; APIs PowerPoint conferidas nos tipos instalados. Uma preferência em memória ausente da lista já não impede usar uma preferência guardada admissível. |
| Alterações em `tests/` | **Nenhuma**, confirmado por `git diff --name-only -- tests`. |

### Testes adiados e verificações não executadas

- **Testes locais: não acrescentados, alterados nem executados, por indicação do utilizador.** O CI de GitHub executado automaticamente pelo push do PR #5 correu `npm test` e **falhou**. O conjunto atual usa mocks ainda incompatíveis com os contratos revistos: `powerpointActions.test.ts` falha porque os shapes simulados não têm `load()`; `officeService.test.ts` também não fornece objetos carregáveis para a seleção PowerPoint; `operationConcurrency.test.tsx` não prepara a prontidão do catálogo partilhado; `chatStream.test.ts` não fornece o `finishReason` obrigatório no stream Gemini. Estas falhas não foram corrigidas nesta entrega, conforme a suspensão dos testes. Também não indicam sucesso dos comportamentos funcionais; adaptar esses fixtures e executar os cenários continua pendente para a fase de testes indicada pelo utilizador. A contagem histórica de testes deste relatório não se aplica a estas alterações.
- **CI automático do PR #5:** `npm ci`, `npm run typecheck`, `npm run lint` e `npm run format:check` passaram; `npm test` falhou e, por a workflow parar no primeiro comando falhado, build, validate, validação XML/manifesto e bundle do proxy foram ignorados. Execução: run `41428924576`, commit `9e2678f04473c9db83e6d52018f2d30386069cd4`. O relatório do PR confirma que não houve alteração de código depois desta execução.
- **Office Desktop/Web e OfficeRuntime real: pendentes por falta de sessão/ambiente Office de teste.** Incluem seleção de texto/API 1.5, criação, coautoria, mudança de seleção, eliminação do destino, frase-passe e persistência no runtime real. Não foram abertos ou alterados documentos reais.
- **Fornecedores reais: pendentes por falta de credenciais/endpoints de teste.** Incluem conteúdo Mistral em blocos/streaming e catálogos de contas/endpoints diferentes, incluindo Ollama. Não foram efetuadas chamadas reais de geração.
- **Build, bundle Worker, manifesto remoto e auditoria de dependências: não executados nesta revisão.** Não houve alterações ao manifesto, proxy ou dependências. Aprovações históricas desses passos não são uma execução atual.

### Limites específicos desta entrega

As verificações estáticas não demonstram a execução dos cenários funcionais planeados. A criação PowerPoint depende de identificação por diferença de IDs; a API não oferece propriedade atómica da criação perante quaisquer alterações de coautores. Os placeholders herdados são conservados e podem ficar visíveis no modo de edição. Escritas já enviadas ao Office/armazenamento não são revogadas por guardas posteriores; não há retry automático que possa duplicar inserções. O catálogo pronto, sobretudo quando apresentado como sugestões, não certifica acesso a inferência, saldo ou todos os parâmetros do modelo.
