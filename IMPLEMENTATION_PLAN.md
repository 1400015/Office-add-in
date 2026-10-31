# Plano de implementação — estabilização completa do Office Universal AI

## 1. Objetivo e ponto de partida

Este plano foi executado no repositório `/workspace/Office-add-in` para corrigir os problemas identificados na análise de 30/10/2026. Uma revisão posterior acrescentou correções que aguardam testes, conforme solicitado pelo utilizador. O histórico de validação e as verificações pendentes estão em [VALIDATION_REPORT.md](VALIDATION_REPORT.md). As combinações com Office e fornecedores reais continuam pendentes.

Baseline analisada: branch `main`, commit `5b16013d7d10a74ebbeb803db83f03afe03862fe`. Nessa revisão passaram 193 testes em 23 ficheiros, TypeScript/build, lint e formatação. A auditoria das dependências de produção não reportou vulnerabilidades. O serviço oficial Microsoft aceitou o manifesto sem erros ou avisos. A CLI de validação devolveu código zero numa falha de rede: esse comportamento também precisa de correção.

Antes de executar: ler este plano, eventuais `AGENTS.md`, `package.json` e o estado Git atual. Adaptar as referências se existirem alterações posteriores, preservando o trabalho do utilizador. Usar Node >=20.19. As dependências já foram instaladas neste workspace; usar `npm ci` se estiverem ausentes ou o lockfile tiver mudado.

Conservar React, TypeScript, Vite, Fluent UI, Zustand, os seis fornecedores, os três hosts e os formatos de armazenamento existentes. A execução compreende código, testes, traduções, documentação e CI. Publicação, deploy, push ou alterações a documentos reais do utilizador não fazem parte das correções locais; os ensaios Office devem usar documentos de teste.

## 2. Decisões de implementação

Estas decisões fixam o comportamento esperado e evitam decisões de produto em aberto durante a execução:

1. **Seleções Word extensas:** recusar substituições acima de `MAX_CONTEXT_CHARS` antes de chamar a IA. Não introduzir processamento por partes nesta correção. Operações apenas de leitura podem truncar, com indicação no prompt e na interface.
2. **Destino Office:** preservar o intervalo original com objetos rastreados e reler o conteúdo antes de substituir. Mudar a seleção não muda o destino. Alterar/eliminar o conteúdo original impede a substituição.
3. **Conflito de edição:** conservar o resultado gerado no chat e mostrar aviso traduzido de que não foi aplicado. Cancelamento descarta o resultado conforme a regra seguinte.
4. **Uma operação de conteúdo por runtime:** envio, regeneração, template e ação rápida usam o mesmo coordenador. Consultas de modelos e testes de ligação têm o seu próprio cancelamento.
5. **Parar:** conserva uma única resposta parcial de chat, se existir. Novo chat, carregar outra conversa, bloquear o cofre ou eliminar a conversa ativa descartam a operação pendente. Trocar de separador conserva o pedido e mantém Parar funcional.
6. **Cofre bloqueado:** impede novas operações de conteúdo, incluindo Ollama, e impede qualquer gravação protegida em claro ou em `enc:v1`. Resultados antigos não podem reaparecer após bloquear.
7. **Persistência:** guardar definições nunca grava conversas. Cada conversa recebe um ID estável antes do primeiro trabalho assíncrono que a possa gravar.
8. **Ligação:** o botão verifica o endpoint/autenticação por um pedido real, sem geração paga, sem cache e sem modelos predefinidos. A mensagem não afirma ter validado inferência, saldo ou acesso a todos os modelos.
9. **Catálogo:** modelos predefinidos continuam disponíveis como sugestões cloud, identificadas como tal. Um Ollama acessível sem modelos apresenta uma lista vazia, não modelos ficticiamente instalados.
10. **Compatibilidade:** combinar sinais e timeouts sem depender de `AbortSignal.any` ou `AbortSignal.timeout`.

## 3. Ordem e dependências

| Etapa | Trabalho | Dependências |
| --- | --- | --- |
| E1 | Operações partilhadas, persistência e histórico | Baseline |
| E2 | Cifra, bloqueio e sanitização de logs | E1 para integração com pedidos |
| E3 | Alvos Office estáveis e leituras Excel limitadas | E1 |
| E4 | Transporte, streaming e cancelamento compatível | Contrato de operação de E1 |
| E5 | Probes, listagens reais e cache | E4 |
| E6 | Seletores e integração da interface | E1, E2, E5 |
| E7 | Conclusão dos comandos do friso | E1, E3 |
| E8 | Validação do manifesto, CI e documentação | Integrar os resultados das etapas anteriores |
| E9 | Verificação final e ensaios reais | Todas as anteriores |

E2, E3 e E4 podem avançar em paralelo depois de estabilizar os contratos de E1. Se houver delegação, atribuir um único responsável aos ficheiros partilhados, sobretudo `useChat.ts`, `useAppStore.ts`, tipos, `ErrorService` e traduções. Cada etapa deve terminar com os testes relevantes e um conjunto de alterações revisto antes da integração seguinte.

## 4. Etapas de implementação

### E1 — Coordenador de operações e persistência explícita

**Ficheiros principais:** `src/hooks/useChat.ts`, `src/store/useAppStore.ts`, `src/services/HistoryService.ts`, `Taskpane.tsx`, `ChatView.tsx`, `TemplatesView.tsx`, `HistoryView.tsx`; criar um serviço pequeno de operações partilhadas.

- Mover o `AbortController` do `useRef` por instância para um coordenador único do runtime. O store guarda metadata de UI, não controllers nem chaves de cifra.
- Usar um token imutável por operação: `requestId`, `conversationId`, geração da conversa e `signal`. Capturar também provider, modelo e opções usados pelo pedido.
- Expor operações equivalentes a `begin`, `cancel`, `assertCurrent` e `finish`. Invalidar o token antes de abortar. Só o pedido proprietário pode limpar o estado ocupado; um `finally` antigo não pode terminar um pedido novo.
- Validar o token nos callbacks de texto, erros, respostas e persistência, incluindo antes/depois de obter contexto Office. Criar o controller antes da primeira leitura assíncrona.
- Recusar uma segunda operação de conteúdo no serviço, além dos controlos da UI. A regra também se aplica ao friso, templates, regeneração e ações rápidas.
- Encaminhar `signal` para `chat` e `chatStream` de todos os fornecedores. Acrescentar um contexto de ação com `signal` e `assertCurrent()` às ações Office e aos adaptadores de ações rápidas.
- Aplicar a semântica de Parar definida na secção 2. Não inserir `"(empty response)"`. Não apresentar cancelamentos intencionais como timeout ou falha de autenticação.
- Separar o atual `persist()` em responsabilidades explícitas: guardar definições, guardar snapshot de conversa e atualizar a lista do histórico. Migrar **todos** os consumidores do método antigo, incluindo criação de frase-passe e templates.
- Gerar o ID da conversa de forma síncrona; uma gravação concluída não atribui um novo ID ao estado ativo. Usar o provider/modelo capturados na operação para os metadados gravados.
- Gravar a pergunta aceite e, depois, o resultado terminal/parcial permitido. Não gravar conversas vazias. Uma falha da API conserva a pergunta, sem inventar uma resposta.
- Serializar mutações do histórico. Associar gravações a uma época do histórico e revisão da conversa; eliminar/limpar invalida imediatamente os trabalhos antigos. A fila deve garantir que gravações já iniciadas são ordenadas antes da eliminação correspondente.
- Eliminar a conversa ativa limpa a conversa em memória e cancela o pedido. Limpar tudo cancela o pedido e inicia uma conversa vazia. Eliminar outra conversa preserva a ativa.
- Proteger leituras e atualizações da lista contra resultados atrasados. Carregar uma conversa depois de outra não pode publicar a primeira por terminar mais tarde. Guardar definições ou mudar um seletor nunca recria chats apagados.

**Aceitação/testes:** duas instâncias do hook partilham Parar; envio por template e mudança de tab continuam canceláveis; resposta A após início de B não altera B; Parar conserva uma parcial uma única vez; Novo chat durante gravação não recupera ID antigo; eliminar/limpar durante gravações e respostas pendentes não recria registos; guardar definições não chama a gravação de chats. Usar promises controladas nos testes, não temporizadores arbitrários.

### E2 — Cofre bloqueado e logs

**Ficheiros principais:** `CryptoService.ts`, `StorageService.ts`, `HistoryService.ts`, `LoggerService.ts`, `useAppStore.ts`, definições e testes de cofre/histórico/logger.

- Tornar a regra de proteção obrigatória nos serviços: com frase-passe configurada e chave bloqueada, `saveChat` lança erro de bloqueio antes de `db.put`. Nunca decidir que uma falha na consulta do estado do cofre equivale a ausência de frase-passe.
- Revalidar o estado/revisão de proteção imediatamente antes da mutação, depois dos awaits de abertura da base, fila e cifra. Um bloqueio durante a preparação da gravação não pode autorizar uma gravação anterior nem publicar estado antigo.
- Impedir que `CryptoService.encrypt` escolha `enc:v1` quando existe frase-passe e falta a chave. Propagar falhas de cifra; não converter essas falhas em gravação de texto simples.
- Preservar leitura dos formatos antigos e a utilização sem frase-passe. Com frase-passe aberta, as novas gravações protegidas usam `enc:v2`.
- Na hidratação, derivar o bloqueio de `hasPassphrase && !isUnlocked`, incluindo o caso de migração incompleta com dados antigos. Não materializar chaves ou conversas antigas em claro na UI enquanto bloqueada.
- Ao bloquear: invalidar/cancelar operações, limpar conteúdo em memória e invalidar cache/pedidos de modelos com credenciais. Limpar também estado ocupado e resultados de testes de ligação que já não correspondam à configuração atual.
- Ativar a frase-passe só apresenta sucesso depois de proteger configurações e histórico. Uma migração parcial deve poder terminar de forma idempotente após desbloquear; apresentar falha sem anunciar proteção concluída.
- Usar exclusivamente a mensagem e os metadados sanitizados nas saídas para consola. Sanitizar objetos, arrays e campos sensíveis pelo nome, além dos padrões existentes: `apiKey`, `Authorization`, `x-api-key`, `x-goog-api-key`, tokens e parâmetros de URL com segredos.
- Na etapa E4/E5, passar a chave Gemini no header `x-goog-api-key`, retirando-a do URL em chat, streaming e catálogo. Confirmar passagem pelo proxy. Não acrescentar logs de corpos, prompts ou credenciais para diagnosticar as correções.

**Aceitação/testes:** cofre bloqueado nunca chama `put` com conteúdo; cifra falhada não degrada a proteção; ação pendente depois de bloquear não escreve no Office, não reaparece no chat e não persiste; roundtrips antigos continuam válidos; migração interrompida mantém bloqueio após reload e pode ser retomada; espiar `console.warn/error` com segredos fictícios em mensagens, arrays, objetos e URLs.

### E3 — Integridade das alterações Office e limites de leitura

**Ficheiros principais:** `word/wordActions.ts`, `excel/excelActions.ts`, `services/OfficeService.ts`, ações PowerPoint para as guardas de cancelamento, adaptadores de ações e erros traduzidos.

**Word**

- Separar a captura para leitura da captura para substituição. Nas substituições, medir o texto original sem o truncar; usar `trim()` apenas para decidir se está vazio, preservando o texto bruto para comparação.
- Recusar seleções acima de 60 000 caracteres antes de contactar o fornecedor. Testar abaixo, no limite e acima do limite. Recusar respostas vazias depois de remover fences.
- Capturar o `Word.Range`, chamar `track()` e `sync()`, guardar o texto original e fazer o pedido fora do batch de captura. Aplicar através de `Word.run(range, ...)`, relendo esse mesmo intervalo.
- Se o texto original mudou ou o alvo deixou de existir, não substituir. Devolver resultado tipado que permita publicar o texto gerado e o aviso de conflito na conversa ainda ativa.
- `generateAndInsert` captura antecipadamente o intervalo de inserção no fim da seleção original. A inserção manual da última resposta usa o destino atual no momento do clique.
- Libertar objetos com `untrack()` e `sync()` em `finally`, em sucesso, erro, conflito e cancelamento. Falha de cleanup não deve esconder o erro principal nem transformar uma escrita concluída numa falsa falha de escrita.
- Preservar o comportamento sem seleção: reescrita/tradução/correção podem responder no chat, mas não substituem o documento inteiro. Se houver truncagem num contexto apenas de leitura, sinalizá-la no prompt e UI.

**Excel**

- Na geração de fórmula, capturar e rastrear a célula inicial, não toda a seleção. Aplicar com `Excel.run(range, ...)`, sem voltar a escolher a seleção ativa.
- Comparar `formulas[0][0]` com o snapshot original antes de escrever: esse campo também representa valores literais. Um recálculo de fórmula inalterada não deve criar falso conflito. Alvo eliminado/editado impede a escrita e mantém o resultado no chat com aviso.
- Centralizar a leitura limitada usada pelas ações e por `getExcelContext()`. Carregar primeiro apenas endereço e dimensões; construir depois um intervalo de, no máximo, **200 linhas × 50 colunas**, a partir da seleção capturada. Só nesse intervalo carregar `values/formulas`.
- Preferir `getCell(0, 0).getResizedRange(...)`, compatível com as APIs já usadas. Não introduzir requirement sets mais recentes apenas para esta correção.
- Distinguir endereço original de intervalo analisado e devolver metadata de truncagem. `explainFormula` e `generateFormula` leem só a célula relevante. Manter também o limite de caracteres do contexto serializado.

**Todas as ações que escrevem**

- No PowerPoint, preservar os IDs existentes e acrescentar a validação dos textos originais: reler todos os shapes do snapshot antes de aplicar substituições. Se algum foi editado/eliminado, não aplicar nenhuma dessas substituições; conservar o resultado no chat com aviso de conflito. Validar o conjunto completo antes de enfileirar escritas.
- Usar resultado tipado para diferenciar aplicação, resposta apenas de leitura e conflito; atualizar os adaptadores que atualmente assumem sempre `Promise<string>`.
- Verificar `assertCurrent()` depois de awaits relevantes, antes de enfileirar mutações e antes dos `sync()` que as enviam. Incluir geração de slides, entre passos/slides, e caminhos de fallback PowerPoint.
- Não engolir cancelamentos num `catch` que tenta outra forma de inserção.
- Documentar o limite real: Office.js não fornece aqui compare-and-set transacional. Uma alteração já enviada ao Office não é anulada por abort; as guardas impedem os passos seguintes. Reler e escrever sem nova chamada externa entre ambos reduz a janela de conflito.

**Aceitação/testes:** seleção A→B escreve só em A; edição de A gera conflito e conserva a resposta; texto >60 000 não chama IA nem escreve; resposta vazia não apaga texto; todos os caminhos libertam ranges rastreados; Excel muda célula/folha sem mudar destino; recálculo não gera conflito; seleção de coluna/folha inteira nunca carrega valores no intervalo original completo; PowerPoint com shape editado/eliminado não aplica substituições parciais; cancelamento não agenda novas escritas/slides. Os mocks devem representar intervalos distintos e sequência real de `load/sync/track/untrack`.

### E4 — Transporte de streaming e sinais compatíveis

**Ficheiros principais:** `HttpService.ts`, `sse.ts`, providers, tipos; utilitário partilhado de sinais/timeout e leitor NDJSON.

- Preservar a API externa `chatStream(messages, options, onToken, context?, signal?)`, emitindo apenas texto novo.
- Alterar o transporte interno para receber `format: "sse" | "ndjson"` e um callback de payload bruto. O callback deve conseguir indicar conclusão. O transporte trata HTTP, UTF-8, timeout, cancelamento e enquadramento; a interpretação JSON pertence ao provider.
- Mapeamento: OpenAI/Mistral/OpenRouter usam SSE e `choices[0].delta.content`; Claude usa SSE e `content_block_delta.delta.text`; Gemini usa SSE com `alt=sse` e `candidates[0].content.parts[].text`; Ollama usa NDJSON de `/api/chat` e `message.content`.
- Mover Claude para o transporte comum, eliminando o `fetch`/timeout/sinais duplicados. Ollama implementa o protocolo nativo e envia `temperature` dentro de `options`, junto de `num_predict`.
- SSE: suportar LF/CRLF, comentários e eventos com várias linhas `data:` concatenadas com newline; delimitar por linha vazia. Descartar evento final sem delimitação. Ajustar os fixtures atuais que juntam eventos JSON sem a separação real.
- NDJSON: suportar chunks arbitrários, linhas vazias e última linha válida sem newline. Preservar UTF-8 dividido em ambos os formatos.
- Terminais `[DONE]`, `message_stop` e `done: true` encerram o consumo. Se o registo terminal Ollama ainda trouxer `message.content`, emitir esse texto uma vez antes de encerrar. Ignorar eventos válidos sem texto; payload JSON inválido ou erro remoto não pode terminar como sucesso vazio.
- Libertar/cancelar o reader quando apropriado e limpar temporizadores/listeners em `finally`, inclusive em exceções de callbacks. Um stream concluído sem texto produz erro identificável, não uma resposta fictícia no histórico.
- Extrair combinação de sinais e timeout para utilitário com `dispose()`, usado por pedidos JSON e streams. Sinal já abortado falha imediatamente; distinguir timeout de cancelamento intencional. Tornar a espera entre retries JSON cancelável.
- Conservar a ausência de repetição automática de streams nesta correção, evitando duplicação de texto. Documentar que o retry existente se aplica aos pedidos JSON.

**Aceitação/testes:** fixtures realistas dos seis providers; UTF-8 dividido, CRLF, SSE multiline, NDJSON sem newline final, terminais, erros remotos e HTTP, JSON inválido, resposta sem texto, timeout e abort antes/durante o consumo. Remover `AbortSignal.any` do ambiente de teste e executar Claude com sinal externo. Confirmar limpeza e ausência de tokens duplicados/tardios.

### E5 — Probes verdadeiros, catálogo e cache

**Ficheiros principais:** providers, `config/providers.ts`, `ModelService.ts`, `components/settings/connection.ts`, Settings e tipos.

- Acrescentar `probeConnection(signal?)`, que só resolve após pedido real bem-sucedido. Retornar metadata pequena, como contagem opcional de modelos; validar a estrutura da resposta.
- Usar os caminhos relativos abaixo com os mesmos headers, endpoint, proxy, upstream e timeout do fornecedor. Os endpoints base atuais já incluem `/v1`, `/v1beta` ou `/api/v1` onde necessário.

| Fornecedor | Probe sem geração | Autenticação |
| --- | --- | --- |
| Mistral | `GET /models` | Bearer |
| OpenAI | `GET /models` | Bearer |
| Claude | `GET /models` | `x-api-key`, `anthropic-version` |
| Gemini | `GET /models` | `x-goog-api-key` |
| OpenRouter | `GET /auth/key` | Bearer; `/models` é público e não valida a chave |
| Ollama | `GET /api/tags` | Chave opcional |

- Validar chave não vazia nos fornecedores cloud. Não usar cache/fallback para transformar erros em sucesso. Mensagens de falha passam por `friendlyError` e traduções, nunca por texto bruto do fornecedor.
- Tornar `getModels()` estrito nos providers: erros propagam; retirar os `catch` que devolvem defaults. Implementar consultas reais OpenAI/Claude e atualizar a flag de capacidade de Claude.
- Gemini filtra por `supportedGenerationMethods.includes("generateContent")`. Percorrer paginação de Gemini/Claude quando existir, detetando cursores repetidos. Validar e deduplicar IDs de modelos.
- Ollama consulta `/api/tags` sem exigir chave e distingue servidor vazio de servidor indisponível.
- Concentrar a tolerância no `ModelService`, com um resultado equivalente a `{ models, source: "remote" | "cache" | "fallback", warningKey? }`. Identificar listas predefinidas/anteriores na UI; não gravar fallback como sucesso remoto.
- Cache apenas de sucessos remotos, com TTL de cinco minutos, por provider e revisão da configuração efetiva. Comparar em memória endpoint, chave, proxy e `useProxy`, sem colocar segredos em IDs de cache/logs/armazenamento adicional.
- `forceRefresh` ignora cache. Invalidação incrementa revisão e impede uma resposta antiga de repovoar a cache. Invalidação também ocorre em hydrate/unlock/lock quando muda a configuração.

**Aceitação/testes:** verificar URL/headers dos seis probes; chave inválida/401, 403, timeout, proxy rejeitado e servidor desligado nunca mostram OK; OpenRouter com catálogo público e chave inválida falha no probe; Ollama sem chave faz pedido real; catálogo vazio não vira lista de modelos instalados; filtro/paginação Gemini, OpenAI/Claude reais, TTL/refresh e respostas anteriores à invalidação.

### E6 — Seletores, estados assíncronos e mensagens

**Ficheiros principais:** `ProviderSelectors.tsx`, hooks de modelos se extraídos, `SettingsView.tsx`, `ChatView.tsx`, `MessageBubble.tsx`, templates/ações rápidas, store e cinco locales.

- Consolidar a consulta de modelos num único efeito/pipeline. O handler de mudança de fornecedor só atualiza a seleção; retirar a segunda consulta concorrente atual.
- Reagir ao fornecedor, revisão de configuração e conclusão de hydrate/unlock. Evitar que a carga inicial com configurações vazias substitua o modelo guardado antes da hidratação.
- Associar carga/refresh a identidade de pedido e configuração. Após cada await, só publicar lista, modelo, erro e gravação de preferência se ainda corresponderem ao estado atual.
- Conservar o modelo escolhido se estiver na lista aceite; senão escolher o primeiro; lista vazia limpa o modelo. Durante troca/carga impedir envios com modelo de outro fornecedor. Refresh também reconcilia a seleção.
- Serializar atualizações do mapa de modelos guardados para evitar perda de preferências por read-modify-write concorrente. Uma resposta antiga não grava a preferência atual.
- Aplicar o mesmo controlo de revisão aos testes de ligação; editar credenciais invalida o resultado mostrado, e uma resposta antiga não mostra sucesso para a configuração nova.
- Expor Parar e o estado ocupado de forma consistente para chat e ações rápidas. Desativar envio, regeneração, templates e ações incompatíveis quando há operação ativa ou cofre bloqueado; manter navegação e Novo chat acessíveis.
- Tratar falhas de gravação assíncrona na UI. Só mostrar Guardado quando a gravação termina com sucesso.
- Acrescentar mensagens de seleção extensa, conflito, contexto truncado, cofre bloqueado, catálogo de recurso/vazio e resposta vazia nos cinco idiomas. Preservar paridade i18n e mapear erros através do serviço comum.

**Aceitação/testes:** mudar A→B, concluir B antes de A e manter B; alterar endpoint/chave durante carga não aplica lista antiga; refresh antigo não substitui refresh novo; hydrate com provider inalterado aplica credenciais/modelo guardados; teste de ligação atrasado não publica sucesso após editar/bloquear; modelos e ações ficam coerentes com o estado ocupado; erros de gravação não mostram sucesso.

### E7 — Contrato dos comandos do friso

**Ficheiros principais:** `src/commands/ribbon.ts`, `useRibbonCommands.ts`, testes de comandos.

- Cada handler recebe `Office.AddinCommands.Event` e chama `event.completed()` exatamente uma vez num `finally`.
- Concluir depois de despachar o trabalho para o runtime, sem aguardar a resposta remota da IA. Cobrir erro de despacho, indisponibilidade/falha de abertura do painel e operação já ocupada/bloqueada.
- Preservar a passagem do comando antes/depois da montagem do listener e impedir dupla execução em StrictMode/remontagem.
- O manifesto existente foi aceite pelo serviço oficial. Não alterar a sua estrutura com base na suspeita anterior; qualquer alteração necessária deve ter evidência de execução num host e nova validação.

**Aceitação/testes:** conclusão exatamente uma vez em sucesso e erro; comando pendente executado uma vez; friso respeita o coordenador e bloqueio sem iniciar pedido concorrente.

### E8 — Validação fiável do manifesto, CI e documentação

**Ficheiros principais:** novo script em `scripts/`, `package.json`/lockfile se necessário, `.github/workflows/ci.yml`, `README.md`, `INSTALL.md`.

- Substituir ou envolver a CLI atual com um validador que interprete a resposta estruturada do serviço Microsoft e termine com código diferente de zero em rejeição, falha de rede, timeout, JSON inválido ou resposta sem aprovação explícita.
- Sucesso exige o resultado `Accepted` e ausência de erros; apresentar avisos sem os mascarar. Manter verificação local de XML e informação do manifesto.
- Respeitar `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` e a confiança CA herdada. Não desativar TLS. Usar dependências explícitas e pequenas se o cliente HTTP/agent escolhido as exigir, sem depender acidentalmente de transitivas.
- Testar o script com respostas simuladas e verificar o código de saída do processo. Os testes unitários não devem depender do serviço remoto.
- CI executa os checks existentes e o validador fiável. Manter o bundle do Worker com `wrangler deploy --dry-run`; isto não publica o proxy.
- Alinhar Node >=20.19 em README, INSTALL, engines e CI. Atualizar as descrições de catálogo, probe, limites, conflitos, cancelamento, cifra e retries para o comportamento implementado.
- Remover afirmações desatualizadas sobre contagens fixas de traduções/testes. Não aumentar versões/dependências alheias às correções nem alterar modelos predefinidos sem evidência de necessidade.

**Aceitação/testes:** serviço indisponível/rejeição nunca deixa CI verde por código zero; proxy suportado; manifesto continua aceite; comandos de instalação correspondem à configuração real; Worker continua a compilar sem deploy.

### E9 — Verificação final e ensaios reais

Usar os testes existentes como base. Os nomes de ficheiros novos abaixo são sugestões; podem ser ajustados mantendo esta cobertura:

| Etapa | Ficheiros de teste a estender/criar |
| --- | --- |
| E1 | `useChat.test.tsx`, `historyService.test.ts`, novos testes do coordenador e persistência do store |
| E2 | `vault.test.ts`, `cryptoService.test.ts`, `storageService.test.ts`, `historyService.test.ts`, `logger.test.ts` |
| E3 | `wordActions.test.ts`, `excelActions.test.ts`, `officeService.test.ts`, `powerpointActions.test.ts`, `errorService.test.ts` |
| E4 | `chatStream.test.ts`, `httpService.test.ts`, `providers.test.ts`, novos testes do utilitário de sinais/NDJSON |
| E5 | `providers.test.ts`, `providersConfig.test.ts`, `settings.test.ts`, novos testes de `ModelService` e probes |
| E6 | `settingsView.test.tsx`, `useChat.test.tsx`, `i18n.test.ts`, novos testes de seletores e transições entre vistas |
| E7 | Novos testes de handlers do friso e entrega de comandos antes/depois da montagem |
| E8 | Novos testes do script de validação e dos seus códigos de saída |

Executar os testes pertinentes durante cada etapa. Após integração, executar uma vez os checks completos, repetindo apenas o que for afetado por novas alterações ou falhas:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run validate
npx office-addin-manifest info manifest.xml
npx --yes wrangler@4 deploy --dry-run --outdir dist-proxy
npm audit --omit=dev
```

Rever o diff e o estado Git. Não usar `lint:fix`/formatação global para introduzir alterações irrelevantes. Não adicionar thresholds arbitrários de cobertura nem testes que apenas repitam a implementação: testar os cenários de regressão e os contratos de rede/Office/armazenamento.

Criar um registo de validação com comando/cenário, resultado, ambiente e limitações. Para os ensaios reais, usar documentos de teste e a matriz abaixo. Registar versão do Office e plataforma; mocks não contam como aprovação destas linhas.

| Área | Ensaio real exigido |
| --- | --- |
| Hosts/plataformas | Carregar e abrir o add-in em Word, Excel e PowerPoint, em Windows, Mac e Web, conforme acesso disponível; assinalar cada combinação |
| Word | Reescrever, traduzir e corrigir; mudar seleção durante a resposta; editar/eliminar alvo; testar 60 001 caracteres e resposta vazia; gerar/inserir no destino inicial |
| Excel | Fórmula no destino inicial após mudar célula/folha; edição vs recálculo; coluna/folha inteira com leitura limitada; inserção manual |
| PowerPoint | Melhorar/traduzir/corrigir, criar slides, inserir resposta, mudar slide durante pedido, editar/eliminar shape durante geração e cancelar entre passos |
| Runtime/friso | Comando com painel fechado/aberto; repetição; Novo chat, tabs, template e Parar durante geração; nenhuma execução duplicada |
| Cofre/histórico | Ativar, bloquear, recarregar, desbloquear; bloquear durante ação; eliminar/limpar com operação pendente; confirmar cifragem no armazenamento de teste |
| Fornecedores | Nos seis fornecedores: probe, catálogo, resposta normal de ação e streaming. OpenAI/Claude pelo proxy configurado; Ollama em Desktop com modelos realmente instalados |
| Segredos | Nenhuma chave em URLs/logs/erros apresentados; headers continuam a atravessar o proxy |

Se faltarem Office, plataforma, endpoint de teste ou credenciais, terminar todo o trabalho local possível e marcar os ensaios afetados como **pendentes por falta de ambiente**, com os passos exatos para os executar. Não inventar chaves, não gerar chamadas pagas só para o probe e não afirmar validação real a partir de mocks.

## 5. Rastreabilidade e conclusão

| Achado da análise | Etapas que o resolvem |
| --- | --- |
| Seleção Word truncada e substituída integralmente | E3 |
| Escrita no destino alterado Word/Excel | E1, E3 |
| Histórico em claro com cofre bloqueado | E1, E2 |
| Streaming Gemini | E4 |
| Streaming Ollama e parâmetros nativos | E4 |
| Cancelamento por instância e respostas antigas | E1, E4, E6 |
| Teste de ligação com falso sucesso | E5, E6 |
| Catálogo Ollama sem chave e filtro Gemini | E5 |
| Chaves na consola | E2, E4, E5 |
| Histórico apagado reaparece | E1 |
| Corridas de provider/modelo/cache | E5, E6 |
| Persistência atrasada recupera estado antigo | E1, E6 |
| Leitura Excel sem limite antes de load | E3 |
| Falta de event.completed | E7 |
| AbortSignal.any no Claude | E4 |
| Validador com sucesso de processo em falha de rede | E8 |
| Documentação Node e comportamentos desatualizados | E8 |
| Ausência de validação Office/API real | E9 e registo de resultados |

Checklist para a entrega:

- [x] E1 concluída com regressões de concorrência e histórico.
- [x] E2 concluída com invariantes de proteção e logs verificados.
- [x] E3 concluída com alvos rastreados, conflitos e limites verificados em testes simulados.
- [x] E4 concluída com os seis protocolos testados com respostas simuladas e sinais compatíveis.
- [x] E5 concluída com probes estritos e catálogo/cache verificáveis com respostas simuladas.
- [x] E6 concluída com transições entre componentes testadas.
- [x] E7 concluída com conclusão dos comandos verificada em testes simulados.
- [x] E8 concluída com CI e documentação coerentes.
- [ ] Checks finais pendentes após a revisão posterior; os resultados anteriores estão em `VALIDATION_REPORT.md`.
- [x] E9 registada por combinação/cenário; pendências externas identificadas em `VALIDATION_REPORT.md`.
- [x] Diff revisto e resumo final com alterações, testes, limitações e ficheiros relevantes.

Considerar **implementação concluída** apenas quando E1–E8 e os checks automáticos estiverem aprovados. Considerar **validado nos ambientes reais** apenas para as combinações efetivamente executadas em E9. A entrega deve apresentar estes dois estados separadamente; a preparação para produção exige resolver as pendências de execução relevantes.

## 6. Instrução de arranque para o executor

> Lê `IMPLEMENTATION_PLAN.md` e executa E1–E9 pela ordem e dependências indicadas. Implementa as correções, regressões, traduções, documentação e CI; não te limites a repetir o plano. Mantém o documento atualizado com as etapas concluídas e cria o registo de validação. Resolve escolhas técnicas locais seguindo os contratos fixados. Conclui todo o trabalho possível no workspace e identifica com precisão qualquer validação externa que dependa de Office, plataformas ou credenciais indisponíveis. Não declares como testado o que apenas foi simulado.
